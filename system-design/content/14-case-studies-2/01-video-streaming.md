---
title: Design YouTube (Video Streaming)
level: advanced
time: 55
summary: Uploading and streaming video at planetary scale — resumable uploads, a transcoding DAG that turns one upload into a ladder of renditions and segments, adaptive bitrate streaming with HLS/DASH, CDNs and ISP-embedded caches, the metadata and view-count services, and the storage and cost trade-offs of long-tail content.
---

:::problem Design YouTube {level=hard tags="HLD,video,CDN,transcoding"}
Design a video platform like YouTube or Netflix: creators upload videos (up to several GB), viewers watch them smoothly on any device and network, with search, view counts and recommendations at a high level. **2 B monthly users**, **500 hours of video uploaded per minute**, **1 B hours watched per day**.

:::hint Hint
There are two very different pipelines. **Upload**: large files, then heavy, parallelisable processing (transcoding into many formats). **Watch**: enormous egress that must come from caches close to users, delivered in small segments the player can switch between as the network changes.
:::
:::

## 1. Requirements

**Functional**: upload video with title/description/thumbnail; watch on web/mobile/TV at multiple qualities; search; view counts, likes, comments; recommendations (out of scope beyond a mention).

**Non-functional**
- **Smooth playback**: fast start (< 2 s), **no rebuffering**, quality adapts to the network.
- **Massive read bandwidth**, worldwide; highly available streaming.
- Uploads are **durable** and **resumable**; processing within minutes is fine.
- Cost-efficient storage for a huge long tail of rarely watched videos.

## 2. Estimates

:::derive Upload, storage and egress
500\ \text{h/min} \times 60 \times 24 = 720{,}000\ \text{hours uploaded/day} ||
\text{storage} \approx 720{,}000\,\text{h} \times 3\,\text{GB/h (all renditions)} \approx 2\,\text{PB/day} || originals extra
\text{egress} = 10^9\,\text{h/day} \times 2.5\,\text{Mbit/s} \times 3600\,\text{s} \approx 1.1\,\text{EB/day} ||
!\approx 100\,\text{Tbit/s average egress} || only possible with CDNs and caches inside ISPs
:::

**Conclusions:** egress dominates everything; **serve from the edge**, as close to viewers as possible. Transcoding is a massive, parallel batch workload. Storage needs tiering (popular vs long-tail videos).

## 3. API

```text
POST /v1/uploads {title, size, ...}            → {uploadId, uploadUrl}   (resumable, chunked)
PUT  <uploadUrl> (chunks with offsets)           → resume from the last acknowledged offset
GET  /v1/videos/{id}                             → metadata + manifest URL
GET  https://cdn…/{id}/master.m3u8               → HLS master playlist (renditions)
GET  https://cdn…/{id}/720p/seg_00042.m4s        → one 4-second segment
```

## 4. High-level design

```viz algo=arch title="Video platform: upload pipeline and watch path" dir=down
creator  Creator [user] @0,0
viewer   Viewer | player [browser] @0,2
upl      Upload service | resumable [service] @1,0
api      Video API | metadata, manifests [service*2] @1,1.1
cdn      CDN + ISP caches [cdn] @1,2.2
raw      Raw uploads [storage] @2,0
meta     Metadata DB [db] @2,1.1
dag      Transcoding DAG | split, encode, package [worker*3] @3,0
segs     Segment storage | renditions [storage] @3,2.2
--
creator -> upl : chunks
upl -> raw
upl ~> dag : VideoUploaded
raw -> dag
dag -> segs : HLS/DASH segments
dag -> meta : status: ready
viewer -> api : play
api -> meta
viewer -> cdn : segments
cdn -> segs : miss
--
flow Upload and processing
creator > upl : The creator uploads a 4 GB file in 8 MB chunks; a dropped connection resumes from the last chunk.
upl > raw : The original is stored durably in object storage.
upl > dag : A VideoUploaded event starts the processing DAG.
raw > dag : The video is split into chunks (by GOP), encoded in parallel into the bitrate ladder (240p…4K, H.264/VP9/AV1), plus thumbnails, captions, safety checks…
dag > segs : …packaged into 2–6 s segments with HLS/DASH manifests.
dag > meta : The video is marked ready and becomes visible.
flow Watching
viewer > api : The player fetches metadata and the master manifest URL (with a signed CDN token).
api > meta : Metadata from a cached DB.
viewer > cdn : The player downloads segments from the nearest edge, choosing the rendition for each segment from its measured bandwidth.
cdn > segs : A rarely watched video misses the edge and is pulled from segment storage (through regional mid-tier caches).
```

## 5. Deep dives

### A. Transcoding as a DAG

One upload becomes dozens of outputs: renditions (resolution × codec), audio tracks, thumbnails, captions, previews. Model it as a **DAG of tasks** run by a workflow engine: split the source into chunks at keyframes, **encode the chunks in parallel** on many workers (minutes instead of hours for a long video), merge, package into segments + manifests, then publish. Each task is **idempotent** and retried on failure; progress is checkpointed. Popular formats are produced first; expensive codecs (AV1) can be generated later for videos that become popular.

### B. Adaptive bitrate streaming (ABR)

Videos are cut into short **segments** at each quality level; a **manifest** (HLS `.m3u8` or DASH `.mpd`) lists them. The **player** decides, segment by segment, which quality to fetch, based on measured throughput and how much video is buffered. Servers just serve static files, which makes CDN caching easy.

```js run title="Fixed quality vs adaptive bitrate on a network with a tunnel"
// Adaptive bitrate streaming: the player picks a rendition for each 4-second segment
const LADDER = [{ name: "240p", kbps: 400 }, { name: "480p", kbps: 1200 }, { name: "720p", kbps: 2800 }, { name: "1080p", kbps: 5000 }];
const SEG = 4, VIDEO = 120, MAX_BUFFER = 20;                       // seconds
// network bandwidth (kbit/s): good Wi-Fi, a train tunnel, partial recovery, then good again
const bandwidth = (t) => (t < 40 ? 8000 : t < 70 ? 900 : t < 90 ? 2500 : 7000);

function play(choose, label) {
  let t = 0, buffer = 0, startup = 0, stalls = 0, frozen = 0, est = 3000, started = false;
  const picks = [];
  for (let seg = 0; seg < VIDEO / SEG; seg++) {
    const r = choose(est, buffer);
    let bits = r.kbps * SEG;                                       // kbit to download
    const begin = t;
    let stalled = false;
    while (bits > 0) {                                             // download in 0.1 s steps; playback drains the buffer
      bits -= bandwidth(t) * 0.1; t += 0.1;
      if (!started) startup += 0.1;
      else if (buffer > 0) buffer = Math.max(0, buffer - 0.1);
      else { frozen += 0.1; if (!stalled) { stalls++; stalled = true; } }   // the video froze
    }
    started = true;
    buffer += SEG;
    const sample = (r.kbps * SEG) / (t - begin);                   // measured throughput for this segment
    est = Math.min(sample, 0.7 * est + 0.3 * sample);               // conservative: drop fast, rise slowly
    if (buffer > MAX_BUFFER) { t += buffer - MAX_BUFFER; buffer = MAX_BUFFER; }   // full: pause downloading
    picks.push(r.name.replace("p", ""));
  }
  const avg = picks.reduce((s, n) => s + LADDER.find((r) => r.name === n + "p").kbps, 0) / picks.length;
  console.log(`${label.padEnd(15)} startup ${startup.toFixed(1)}s, stalls ${stalls} (${frozen.toFixed(1)}s frozen), average ${Math.round(avg)} kbps`);
  console.log("   " + picks.join(" "));
}

play(() => LADDER[3], "always 1080p");
play(() => LADDER[0], "always 240p");
play((est, buffer) => {                                            // pick the best rendition the network can sustain
  const safety = buffer < 8 ? 0.5 : 0.8;                           // be careful when little video is buffered
  return [...LADDER].reverse().find((r) => r.kbps <= est * safety) || LADDER[0];
}, "adaptive (ABR)");
```

Always-1080p freezes repeatedly in the tunnel; always-240p never freezes but looks bad; ABR keeps quality high when it can and drops quickly when the network degrades. Real players (e.g. BOLA, MPC-based) combine throughput and buffer level in similar ways.

### C. Delivering the bytes: CDN hierarchy

- **Edge caches** in many cities, **plus appliances inside ISPs** (Netflix Open Connect, Google Global Cache), so the most popular content never crosses the internet backbone.
- **Popularity is heavily skewed**: a small fraction of videos produces most views. Pre-position (push) new popular releases to edges during off-peak hours; serve the long tail from regional mid-tier caches and origin.
- **Signed URLs/tokens** protect content; DRM for premium content.

### D. Metadata, views and storage

- **Metadata** (title, channel, status, manifest URLs) in a sharded database with heavy caching; it's tiny next to video bytes.
- **View counts**: an event stream (deduplicated, bot-filtered) aggregated into counters asynchronously; displayed counts lag slightly.
- **Storage tiering**: renditions of long-tail videos can move to colder storage, or rarely used renditions can be deleted and re-transcoded on demand. Originals go to archival storage.

## 6. Wrap-up

**Upload**: resumable chunked uploads → object storage → event → **transcoding DAG** (parallel chunk encoding, idempotent tasks) → segments + manifests. **Watch**: metadata API → manifest → **ABR player** fetching segments from **CDN edges and ISP caches**. Monitor rebuffering ratio, startup time, average bitrate, CDN hit ratio and egress, transcoding queue latency, and upload failure rate.

```quiz
? Why are videos cut into short segments at several bitrates?
+ The player can switch quality between segments as bandwidth changes, and static segments cache well on CDNs
- To make files smaller in total
- Because browsers can't play long files
> Adaptive bitrate streaming = segments + manifests + a smart player.

? How do you transcode a 3-hour 4K video quickly?
+ Split it into chunks at keyframes and encode chunks in parallel on many workers, then merge and package
- Use one very fast machine
- Transcode only on first view
> A DAG of idempotent, parallel tasks.

? Where should the bulk of video bytes come from?
+ CDN edges and caches inside ISPs, close to viewers
- The origin object store
- The API servers
> Egress is the dominant cost; keep it at the edge.
```

:::keypoints
- Two pipelines: **upload** (resumable chunks → object storage → **transcoding DAG**) and **watch** (manifest → **ABR player** → segments from CDN).
- Transcoding: split at keyframes, **encode in parallel**, idempotent retried tasks, package into HLS/DASH segments.
- **ABR**: the player picks a rendition per segment using throughput and buffer level to avoid rebuffering.
- Egress dominates: **CDN hierarchy + ISP-embedded caches**, pre-positioning popular content, signed URLs.
- Metadata is small and cached; view counts via streams; tiered storage for the long tail.
:::
