---
title: Speech and Voice Agents
level: intermediate
time: 50
summary: How machines hear and speak. Speech recognition (Whisper-style encoder-decoder models, streaming ASR, word error rate), text-to-speech (neural vocoders and codec language models), the two architectures for voice agents (cascaded STT→LLM→TTS versus speech-to-speech), latency budgets, voice activity detection, turn-taking and interruption, telephony and WebRTC, evaluation, and safety. With runnable WER, VAD and latency-budget calculations.
---

Voice is the oldest interface and, after years of poor results, one of the newest to work well. Modern speech recognition is close to human-level on clear audio, synthetic voices are natural, and **real-time voice agents** can hold fluid conversations. Building one well is mostly an exercise in **latency, turn-taking and robustness**.

## Speech recognition (ASR / STT)

**Whisper** ([paper](https://arxiv.org/abs/2212.04356)) popularised the recipe: an **encoder–decoder Transformer** trained on 680K hours of weakly supervised multilingual audio. Audio is converted to a **log-Mel spectrogram** (a time–frequency image), the encoder produces audio features, and the decoder autoregressively writes text tokens, including language ID, timestamps and translation. The result is robust to accents, noise and domain shift.

:::flow Speech-to-text pipeline
Capture | microphone or phone audio (16 kHz mono typical)
Chunk / VAD | split into segments; skip silence
Features | log-Mel spectrogram
Encoder | audio → hidden representation
Decoder | tokens: text, timestamps, language
Post-process | punctuation, casing, numbers, diarisation (who spoke)
:::

| Concern | Notes |
|---|---|
| **Accuracy** | measured by **word error rate (WER)**; depends on audio quality, accent, domain terms, overlapping speech |
| **Streaming vs batch** | batch (whole file) is most accurate; streaming ASR emits partial results with low latency (needed for voice agents) |
| **Domain vocabulary** | names, products, jargon: use **prompts/biasing** (custom vocabulary), or fine-tune |
| **Diarisation** | who spoke when (pyannote and similar) |
| **Languages and code-switching** | multilingual models vary widely in quality per language |
| **Models and services** | Whisper (open; faster-whisper, whisper.cpp, distilled variants), cloud ASR APIs (Google, Azure, AWS, Deepgram, AssemblyAI, and others), on-device engines |

### Word error rate

:::formula WER
\text{WER} = \frac{S + D + I}{N}
:::

`S` substitutions, `D` deletions, `I` insertions, and `N` the number of words in the reference transcript (computed with edit distance over words).

```python run title="Compute WER (and CER) with edit distance" level=intermediate
def edit_distance(ref, hyp):
    d = [[0] * (len(hyp) + 1) for _ in range(len(ref) + 1)]
    for i in range(len(ref) + 1): d[i][0] = i
    for j in range(len(hyp) + 1): d[0][j] = j
    for i in range(1, len(ref) + 1):
        for j in range(1, len(hyp) + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost)
    return d[-1][-1]

def wer(reference, hypothesis):
    r, h = reference.lower().split(), hypothesis.lower().split()
    return edit_distance(r, h) / len(r)

def cer(reference, hypothesis):
    return edit_distance(list(reference.lower()), list(hypothesis.lower())) / len(reference)

ref = "please transfer five hundred dollars to account number four seven two"
hyp = "please transfer five hundred dollar to account number for seven two"
print(f"WER = {wer(ref, hyp):.0%}  CER = {cer(ref, hyp):.0%}")
print("note: 'dollar' vs 'dollars' and 'for' vs 'four' count as errors even though a human understands the sentence;")
print("      for business use, measure the errors that matter (numbers, names), not just overall WER.")
```

Evaluate ASR on **your** audio (phone-line quality, domain terms), with **entity-level accuracy** (account numbers, names, dates), not just WER.

## Text-to-speech (TTS)

TTS turns text into audio. Modern systems are neural: a model predicts an intermediate acoustic representation (spectrogram or **discrete audio codes**), and a **vocoder** or **codec decoder** produces the waveform. Two broad families:

| Family | Idea | Traits |
|---|---|---|
| **Acoustic model + vocoder** (Tacotron/FastSpeech + HiFi-GAN; VITS) | text → spectrogram → waveform | fast, controllable, lightweight |
| **Codec language models** (VALL-E, many newer LLM-based TTS) | an LLM predicts **audio tokens** (from a neural codec such as EnCodec/SoundStream/SNAC) conditioned on text (and a voice prompt); decoded to audio | very natural, expressive, zero-shot **voice cloning**; latency from autoregression |
| **Diffusion/flow TTS** | generate audio latents by denoising | high quality, parallel, less streaming-friendly |

Properties that matter: **naturalness and prosody**, **latency to first audio** (streaming synthesis), **voice and language coverage**, **emotion/style control**, **pronunciation control** (SSML, lexicons for names and acronyms), **cost per character**, and **licensing and consent** for voice cloning.

## Voice agents: two architectures

```viz algo=arch title="Cascaded vs speech-to-speech voice agents" dir=down
mic   Caller audio [phone] @0,1
vad   VAD + turn detection [filter] @1,1
stt   Speech-to-text [search] @2,0
llm   LLM + tools | text in, text out [llm] @3,0
tts   Text-to-speech [video] @4,0
s2s   Speech-to-speech model | audio in, audio out [llm] @3,2.2
spk   Agent audio [phone] @5,1
--
mic -> vad
vad -> stt : cascaded
stt -> llm
llm -> tts
tts -> spk
vad -> s2s : speech-to-speech
s2s -> spk
```

| | **Cascaded (STT → LLM → TTS)** | **Speech-to-speech (native audio model)** |
|---|---|---|
| Latency | sum of three stages (mitigated by streaming) | one model: lowest latency |
| Control | high: inspect and edit text, use any LLM, tools, guardrails | less: audio in/out; tool use supported in newer APIs |
| Paralinguistics (tone, laughter, emotion, hesitation) | lost at the text boundary | preserved and generated |
| Cost | three components | typically one (price varies) |
| Debuggability | transcripts at every stage | harder, but transcripts are usually also produced |
| Flexibility | swap each part; domain ASR/TTS | tied to the provider's model |

Many production systems start cascaded (maximum control and observability) and move to speech-to-speech where the naturalness is worth it. APIs offering realtime audio-native interaction exist from major providers (for example OpenAI's Realtime API, Google's Live API); open-source frameworks include **LiveKit Agents** ([docs](https://docs.livekit.io/agents/)) and **Pipecat** ([repo](https://github.com/pipecat-ai/pipecat)).

## The latency budget

Humans expect a reply within roughly **300–800 ms** after they finish speaking; beyond about 1.2 s conversations feel broken. Add up the pieces:

```python run title="A voice-agent latency budget (cascaded pipeline)" level=easy
stages_ms = {                                           # typical p50 values; measure yours
    "end-of-speech detection (VAD silence timeout)": 300,
    "network: audio to server": 40,
    "streaming ASR finalisation": 120,
    "LLM time-to-first-token": 350,
    "TTS time-to-first-audio": 180,
    "network: audio back to caller": 40,
}
total = sum(stages_ms.values())
for stage, ms in stages_ms.items():
    print(f"{ms:>5} ms  {'#' * (ms // 20):<18} {stage}")
print(f"{total:>5} ms  total mouth-to-ear latency  ->", "feels natural" if total < 800 else "noticeable delay" if total < 1200 else "feels broken")

# the big levers
improved = dict(stages_ms); improved["end-of-speech detection (VAD silence timeout)"] = 180; improved["LLM time-to-first-token"] = 220
print("\nwith faster endpointing and a smaller/streaming LLM:", sum(improved.values()), "ms")
```

Levers: **stream everything** (partial ASR → LLM starts early; LLM tokens → TTS starts at the first sentence); **smart endpointing** (shorter silence timeouts with a semantic "turn complete?" model); **small, fast LLMs** for conversation with tools for slow work; **prefix caching** for the system prompt; **co-locate** components; **WebRTC** for transport (lower latency than WebSockets over TCP); **filler/acknowledgement audio** ("let me check that") while tools run.

## Voice activity detection and turn-taking

**VAD** decides when someone is speaking. Energy thresholds are the simplest; neural VADs (Silero VAD, WebRTC VAD) are more robust to noise.

```python run title="A simple energy-based voice activity detector" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
sr, frame = 16_000, 320                                         # 16 kHz audio, 20 ms frames
t = np.arange(sr * 3) / sr
speech = 0.3 * np.sin(2 * np.pi * 180 * t) * ((t > 0.6) & (t < 1.5)) + 0.25 * np.sin(2 * np.pi * 220 * t) * ((t > 2.0) & (t < 2.6))
audio = speech + 0.02 * rng.normal(size=t.size)                 # two utterances + background noise

frames = audio[: len(audio) // frame * frame].reshape(-1, frame)
energy = (frames ** 2).mean(axis=1)
threshold = 5 * np.median(energy)                                # adaptive: a multiple of the noise floor
active = energy > threshold

# hangover: stay "speaking" through short pauses so we do not cut people off
HANG = 8                                                         # 160 ms
smoothed, hold = np.zeros_like(active), 0
for i, a in enumerate(active):
    hold = HANG if a else max(0, hold - 1)
    smoothed[i] = hold > 0

segments, start = [], None
for i, s in enumerate(smoothed):
    if s and start is None: start = i
    if not s and start is not None: segments.append((start * frame / sr, i * frame / sr)); start = None
print("detected speech segments (seconds):", [(round(a, 2), round(b, 2)) for a, b in segments])
print("true speech: (0.6-1.5) and (2.0-2.6)")
```

**Turn-taking** is the hard part of voice UX:

- **Endpointing**: when has the user finished? Too early cuts them off; too late adds latency. Use VAD plus a **semantic turn detector** (a small model judging whether the sentence is complete).
- **Barge-in / interruption**: the user speaks while the agent is talking: stop TTS immediately, discard queued audio, and handle the partial utterance. Requires **echo cancellation** so the agent does not hear itself.
- **Backchannels** ("mm-hm") and **overlapping speech** are normal in human talk; simple systems should not treat them as full turns.
- **Silence handling**: prompts after long pauses; timeouts; call end detection.

## Production concerns

- **Telephony**: PSTN audio is narrowband (8 kHz); ASR accuracy drops, so test on **phone-quality audio**. Integrate via SIP/Twilio/Telnyx or WebRTC; DTMF tones for keypad input.
- **Noise, accents, code-switching, speakerphone echo**: build a test set with real recordings.
- **Reliability**: reconnect logic, jitter buffers, fallback to DTMF/IVR or human transfer.
- **Tool use mid-call**: keep the voice flowing: acknowledge, run tools, speak results concisely; avoid reading long lists aloud.
- **Prompting for voice**: short sentences; no markdown, bullets or URLs; spell out numbers, dates and codes sensibly; confirm critical details (read back account numbers); handle "can you repeat that".
- **Transcripts and analytics**: store transcripts, per-turn latencies, interruptions, outcomes; sample calls for QA.
- **Compliance**: **recording consent** laws vary by jurisdiction; disclose that callers are talking to AI where required; handle PCI/PHI data carefully (pause recording for card numbers).

## Safety: voice cloning and fraud

Synthetic voices enable **impersonation and fraud** (voice-clone scams, spoofed authentication). Use consent for any voice cloning, do not rely on voice alone for authentication, watermark or label synthetic audio where possible, add detection and rate limits on cloning endpoints, and design call flows that verify identity with multiple factors.

```quiz
? What does WER count?
+ Substitutions, deletions and insertions at the word level, divided by the number of reference words
- The number of seconds of audio
- Only deleted words
> Also measure entity-level accuracy for the words that matter.

? What is the main trade-off between cascaded and speech-to-speech voice agents?
+ Cascaded gives control and observability but adds latency and loses tone; speech-to-speech is faster and more natural but less controllable
- Cascaded is always cheaper
- Speech-to-speech cannot use tools
> Many teams start cascaded and adopt native audio where it pays off.

? Why does barge-in handling need echo cancellation?
+ Otherwise the agent hears its own speech through the caller's speaker and treats it as an interruption
- To compress audio
- To translate
> Stop TTS immediately on real user speech, not on echo.

? Roughly what end-to-end response time makes a voice conversation feel natural?
+ Under about 800 ms (with 300–500 ms ideal)
- 5 seconds
- It does not matter
> Stream every stage and tune endpointing.
```

:::problem Design a phone agent for appointment booking that must feel natural and be robust to bad audio. Outline architecture and tests. {level=hard tags="voice,design"}
Cover pipeline, latency, errors and evaluation.

:::solution Model answer
Use **WebRTC/SIP** into a streaming pipeline: VAD + semantic endpointing, **streaming ASR tuned for telephony** (custom vocabulary for names, clinics), a **fast LLM with tool calls** (calendar availability, booking) and **streaming TTS** starting at the first sentence; keep prompts voice-optimised (short, no markdown), **read back** dates/times for confirmation, and speak acknowledgements while tools run. Handle **barge-in** with echo cancellation, silence timeouts, and fallback to a human transfer. Latency budget < 800 ms median; measure p95. Evaluate on a **recorded-call test set** (noisy, accents, interruptions, phone-quality): entity accuracy (dates, names), task success, latency percentiles, interruption handling, escalation rate; run scripted **simulated callers** for regression. Comply with recording consent and AI disclosure; protect personal data.
:::
:::

:::keypoints
- Whisper-style ASR: log-Mel spectrogram → encoder → text decoder; measure WER, but also entity accuracy on your audio; use streaming ASR for live agents.
- TTS: acoustic model + vocoder, codec language models (expressive, voice cloning) or diffusion/flow; judge latency to first audio, naturalness, pronunciation control and licensing.
- Voice agents: cascaded (STT→LLM→TTS: controllable) versus speech-to-speech (lowest latency, richer prosody); frameworks like LiveKit Agents and Pipecat.
- Budget latency end to end (under ~800 ms): stream every stage, tune endpointing, use fast LLMs and caching.
- Master VAD, endpointing, barge-in and echo cancellation; prompt for the ear; test with real phone audio; address consent, disclosure and voice-cloning fraud.
:::

:::resources
- [Robust Speech Recognition via Large-Scale Weak Supervision (Whisper)](https://arxiv.org/abs/2212.04356) and [openai/whisper](https://github.com/openai/whisper) — the model and code.
- [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — fast CTranslate2-based Whisper inference.
- [LiveKit Agents](https://docs.livekit.io/agents/) and [Pipecat](https://github.com/pipecat-ai/pipecat) — open-source realtime voice-agent frameworks.
- [OpenAI Realtime guide](https://platform.openai.com/docs/guides/realtime) — a speech-to-speech API design to study.
- [Hugging Face Audio course (in the HF learning hub)](https://huggingface.co/learn/cookbook) — recipes for ASR and TTS.
- [Coqui TTS](https://github.com/coqui-ai/TTS) — an open-source TTS toolkit.
:::
