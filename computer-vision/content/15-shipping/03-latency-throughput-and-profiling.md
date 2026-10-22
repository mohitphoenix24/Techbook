---
title: Measuring Latency, Throughput and Cost Honestly
level: advanced
time: 40
summary: Benchmarks that you can trust. Latency versus throughput, warm-up and percentiles, GPU timing pitfalls, batching trade-offs, the roofline view (compute-bound versus memory-bound) with a runnable demo, profiling tools, end-to-end budgets (capture, decode, pre-process, inference, post-process), and cost per image.
---

"It runs in 8 ms" is a claim that needs a lot of questions: which hardware, which batch, which precision, which input size, which percentile, including pre- and post-processing? This lesson is how to measure and talk about performance in a way that survives an interview and a customer.

## Latency, throughput, and what the user feels

- **Latency**: time from one input to its result (ms). What a **live camera** and a **robot loop** feel.
- **Throughput**: items per second (FPS, images/s). What an **offline batch job** or a **server under load** cares about.
- **They are different and trade against each other.** Batching and multi-streaming raise throughput but add waiting time. A pipeline can have 100 FPS throughput and 150 ms latency.
- **Tail latency** (p95, p99, max): a robot arm that stalls once every 100 frames is unusable even if the average is fine. Report **median and p95/p99**, not just the mean.
- **Jitter**: variation of frame times; matters for control loops and for synchronised multi-camera systems.

## How to benchmark properly

1. **Warm up** (5-50 runs): caches, lazy initialisation, kernel auto-tuning, GPU clock ramp-up and the very first call are slow.
2. **Fix the conditions**: input size, batch, precision, thread count, power mode (Jetson `nvpmodel`/`jetson_clocks`), and thermal state. **Thermal throttling** can halve the speed after minutes of load: test for 10+ minutes.
3. **Synchronise the GPU**: CUDA calls are **asynchronous**. Without `torch.cuda.synchronize()` (or CUDA events) you time only the launch, not the work. This is the #1 benchmarking bug.
4. **Time the whole pipeline**, not only `model(x)`: decode, resize, normalise, copy to GPU, inference, copy back, NMS, drawing. Often pre/post-processing takes as long as the network.
5. **Use realistic data**: real images and real content (a crowded scene has more boxes for NMS than an empty one).
6. **Repeat and report the distribution** (median, p95, p99, max) and the hardware/software versions.
7. **Compare equal terms**: same precision, same accuracy; a faster model that is 3 mAP worse is not a free win.

```python run title="First call versus steady state, percentiles, and the batching trade-off" level=intermediate
import time
import numpy as np

def bench(fn, warmup=5, runs=60):
    for _ in range(warmup): fn()                                           # warm-up: caches, lazy initialisation, JIT, clock speed
    times = []
    for _ in range(runs):
        t0 = time.perf_counter(); fn(); times.append((time.perf_counter() - t0) * 1e3)
    t = np.array(times)
    return t

rng = np.random.default_rng(0)
a, b = rng.random((256, 256)), rng.random((256, 256))
fn = lambda: a @ b
t0 = time.perf_counter(); fn(); first = (time.perf_counter() - t0) * 1e3                      # the very first call
t = bench(fn)
print(f"first call: {first:.2f} ms   | after warm-up: median {np.median(t):.2f} ms, mean {t.mean():.2f} ms, p95 {np.percentile(t, 95):.2f} ms, max {t.max():.2f} ms")
print("report the median and the p95/p99: the mean hides the slow calls that make a camera pipeline stutter")

# throughput versus latency with batching (a model of a GPU-like device): fixed overhead + per-item time
overhead_ms, per_item_ms = 6.0, 1.5
print("\nbatch | latency per batch | images per second | latency seen by one frame")
for batch in (1, 2, 4, 8, 16, 32):
    lat = overhead_ms + per_item_ms * batch
    print(f"{batch:>5} | {lat:>12.1f} ms   | {1000 * batch / lat:>12.0f}      | {lat:.1f} ms (+ waiting {(batch - 1) * 33.3:.0f} ms to fill the batch at 30 FPS)")
print("batching raises throughput but adds waiting time: a live camera usually runs batch 1; an offline job uses a large batch")
```

(The exact numbers in your browser will differ from run to run; that is the point: look at the *pattern*.)

## The roofline view: what limits speed?

Each layer needs `F` floating-point operations and moves `B` bytes of memory. A device has a peak compute rate (FLOP/s) and a memory bandwidth (bytes/s). The layer takes at least `max(F / peak, B / bandwidth)`:

- **Compute-bound**: the arithmetic units are the limit (big dense convolutions, large matmuls). Lower precision or a faster chip helps.
- **Memory-bound**: waiting for data (depthwise conv, element-wise ops, normalisation, softmax, attention without fusion). Fusing layers, using lower precision (fewer bytes) and avoiding copies helps; more TFLOPS does not.
- **Arithmetic intensity** = FLOPs per byte. Low intensity means memory-bound.

```python run title="MACs versus real speed: why depthwise convolutions disappoint" level=advanced
import numpy as np

def conv_cost(h, w, cin, cout, k, stride=1, groups=1):
    ho, wo = h // stride, w // stride
    macs = ho * wo * cout * (cin // groups) * k * k                              # multiply-accumulates
    params = cout * (cin // groups) * k * k
    bytes_moved = 4 * (h * w * cin + ho * wo * cout + params)                    # float32: read the input, write the output, read the weights
    return macs, params, bytes_moved

print("layer on a 56x56x128 map                 |   MACs     params   | MACs per byte moved")
rows = [("standard 3x3 conv, 128 -> 128", dict(cin=128, cout=128, k=3)),
        ("depthwise 3x3 (groups = 128)", dict(cin=128, cout=128, k=3, groups=128)),
        ("pointwise 1x1, 128 -> 128", dict(cin=128, cout=128, k=1)),
        ("depthwise + pointwise (MobileNet)", None)]
tot = {}
for name, kw in rows:
    if kw is None:
        (m1, p1, b1), (m2, p2, b2) = conv_cost(56, 56, 128, 128, 3, groups=128), conv_cost(56, 56, 128, 128, 1)
        m, p, b = m1 + m2, p1 + p2, b1 + b2
    else:
        m, p, b = conv_cost(56, 56, **kw)
    tot[name] = (m, b)
    print(f"{name:<41}| {m / 1e6:7.1f} M  {p / 1e3:7.1f} K  | {m / b:6.1f}")
std, mob = tot["standard 3x3 conv, 128 -> 128"], tot["depthwise + pointwise (MobileNet)"]
print(f"MobileNet-style block does {std[0] / mob[0]:.1f}x fewer MACs, but moves {mob[1] / std[1]:.1f}x as many bytes in total (the depthwise output is written to memory and read back)")

# a tiny roofline: time = max(compute time, memory time)
peak_flops, bandwidth = 2e12, 50e9                                                # an edge GPU: 2 TFLOPS, 50 GB/s
print("\nlayer                                    | compute-limited ms | memory-limited ms | the layer is")
for name, (m, b) in tot.items():
    tc, tm = 2 * m / peak_flops * 1e3, b / bandwidth * 1e3
    print(f"{name:<41}| {tc:>12.3f}       | {tm:>12.3f}      | {'memory-bound' if tm > tc else 'compute-bound'}")
t = {n: max(2 * m / peak_flops, b / bandwidth) * 1e3 for n, (m, b) in tot.items()}
print(f"predicted speed-up of the MobileNet-style block over the standard conv: {t['standard 3x3 conv, 128 -> 128'] / t['depthwise + pointwise (MobileNet)']:.1f}x, much smaller than the {std[0] / mob[0]:.1f}x saving in MACs")
print("fewer FLOPs does not guarantee lower latency: depthwise layers are limited by memory traffic, not by arithmetic")
```

## Profiling tools

- **PyTorch profiler** (`torch.profiler`) and TensorBoard: per-op CPU/GPU time and memory.
- **NVIDIA Nsight Systems / Nsight Compute**, `nvprof` replacement: timeline of kernels, copies and gaps (find idle GPU between frames).
- **TensorRT** `trtexec --dumpProfile` for per-layer times; **ONNX Runtime** profiling JSON; **OpenVINO** `benchmark_app`; **TFLite** benchmark tool; `tegrastats` on Jetson (utilisation, clocks, power).
- **py-spy / cProfile** for Python overhead; **perf** for C++.
- Look for: **CPU-GPU copies** that could be avoided, **small kernels** launched many times (launch overhead: use CUDA graphs or larger fused ops), **Python in the loop**, unnecessary format conversions, and **GPU idle time** between stages.

## The end-to-end budget

For a 30 FPS camera you have 33 ms per frame. Write the budget down:

| Stage | Typical cost | Tricks |
|---|---|---|
| Capture and transfer (USB/MIPI/GigE) | 1-30 ms | Hardware trigger, lower resolution/ROI, avoid extra copies |
| Decode (JPEG/H.264 to RGB) | 2-15 ms | Hardware decoders (NVDEC, VA-API), keep NV12 on GPU |
| Pre-process (resize, normalise) | 1-10 ms | Do it on GPU, fuse into the model graph, resize once |
| **Inference** | 3-100 ms | Quantisation, TensorRT, smaller model, lower resolution |
| Post-process (NMS, tracking, mask decode) | 1-20 ms | GPU NMS, fewer candidates, in-graph NMS |
| Output (draw, encode, send) | 1-20 ms | Do not render at full resolution; send results, not video |

**Pipelining** (overlap stages in different threads/streams) turns latency 40 ms + 40 ms + 40 ms into a throughput of one frame per 40 ms, but the latency of each frame is still about 120 ms. Decide which one you must meet.

## Cost per image (servers and cloud)

`cost per 1000 images = (instance cost per hour) / (images per second × 3600) × 1000`. Increase utilisation (batching, multiple streams per GPU, MIG partitions), use spot instances for offline jobs, cache repeated results, and run a cheap model first with a heavy model only for hard cases (**cascades**). On edge devices the cost is **power and hardware**: compare joules per inference.

:::interview Questions you may get
- "How do you benchmark an inference model?" Warm up, fix conditions, synchronise the GPU, include pre/post-processing, use realistic inputs, report median and tail percentiles, and note hardware and software versions.
- "Latency versus throughput?" Latency is per-item delay; throughput is items per second; batching boosts throughput and hurts latency.
- "Why is my model slower than its FLOPs suggest?" Memory-bound layers, small kernels and launch overhead, data copies, poor kernel support, thermal throttling; profile.
- "What does GPU asynchronous execution mean for timing?" Kernel launches return immediately; without synchronisation you measure launch time; use events/synchronise.
- "How would you hit a 30 FPS budget on a Jetson?" Measure per-stage costs, use TensorRT FP16/INT8, hardware decode and GPU pre-processing, pipeline stages, lower resolution or ROI, a smaller model.
:::

```quiz
? Why must you warm up before timing?
+ The first calls include initialisation, caching and clock ramp-up
- To heat the room
- To increase accuracy
> They do not represent steady state.

? What should you call before reading the time when benchmarking CUDA code?
+ torch.cuda.synchronize() or use CUDA events
- model.train()
- print()
> Kernels run asynchronously.

? A layer is memory-bound. What helps most?
+ Fewer bytes moved: fusion, lower precision, avoiding copies
- A higher TFLOPS GPU only
- A bigger batch of zeros
> Bandwidth is the limit.

? Why report p99 latency?
+ Rare slow frames can break a real-time control loop even if the mean is fine
- It is easier to compute
- It always equals the mean
> Tail latency.
```

:::problem A detector runs at 12 ms in a notebook benchmark but the production service shows 45 ms per image at p95. List the likely differences. {level=medium tags="latency,benchmarking,production"}
Compare what the benchmark skipped.

:::solution Model answer
The benchmark likely timed only the model on a GPU-resident tensor, with warm-up, batch 1 and a fixed small input, without synchronisation issues hidden. Production adds image decode, resize and normalisation on CPU, host-to-device copies, NMS and JSON serialisation, network and queue time, multi-request contention, cold starts and thermal/CPU limits, plus larger real images and more detections. Instrument each stage with timers, compare with the benchmark conditions, move pre/post-processing to the GPU or into the graph, batch/queue properly, and report the stage breakdown.
:::
:::

:::keypoints
- Latency is per-item delay, throughput is items per second; report median and p95/p99 and always the conditions (hardware, precision, batch, size, power mode).
- Benchmark with warm-up, GPU synchronisation, realistic data and the whole pipeline, including pre- and post-processing.
- Roofline thinking: compute-bound vs memory-bound; fewer MACs do not always mean faster (depthwise layers, attention).
- Write the end-to-end time budget; pipeline stages for throughput, and track cost per image.
:::

:::resources
- [NVIDIA: Measuring performance with CUDA events and synchronisation](https://developer.nvidia.com/blog/how-implement-performance-metrics-cuda-cc/) — timing GPU code correctly.
- [PyTorch Profiler documentation](https://pytorch.org/tutorials/recipes/recipes/profiler_recipe.html) — per-op profiling.
- [Williams, Waterman, Patterson: Roofline: an insightful visual performance model](https://dl.acm.org/doi/10.1145/1498765.1498785) — the original roofline paper.
- [Dao et al.: FlashAttention](https://arxiv.org/abs/2205.14135) — a memory-aware (IO-aware) attention kernel, a roofline success story.
:::
