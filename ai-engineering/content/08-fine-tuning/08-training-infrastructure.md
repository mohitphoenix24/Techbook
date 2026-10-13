---
title: Training Infrastructure — GPUs, Memory Math and Parallelism
level: advanced
time: 55
summary: What it takes to actually train. Where GPU memory goes (weights, gradients, optimiser state, activations), mixed precision, gradient checkpointing, data/tensor/pipeline/sequence parallelism, ZeRO and FSDP, how to size a job, throughput and MFU, fault tolerance and checkpointing, frameworks and clouds, and a runnable memory and cost planner.
---

Training jobs fail for boring reasons: out of memory, bad throughput, a crashed node at step 40,000. Knowing the arithmetic lets you plan a run on paper, pick hardware, and diagnose problems quickly. This is the "systems" side of fine-tuning and pretraining.

## Where GPU memory goes

For a model with `P` parameters trained with mixed precision and Adam:

| Component | Bytes per parameter | Notes |
|---|---|---|
| **Weights** (bf16/fp16) | 2 | the compute copy |
| **Gradients** (bf16/fp16) | 2 | same shape as weights |
| **FP32 master weights** | 4 | for stable updates |
| **Adam state**: first moment `m` | 4 | fp32 |
| **Adam state**: second moment `v` | 4 | fp32 |
| **Total (model state)** | **≈ 16** | before activations |
| **Activations** | depends on batch × sequence × layers | often comparable to or larger than the model state without checkpointing |
| **KV / buffers / fragmentation** | overhead | add 10–20% headroom |

So a 7B model needs ≈ **112 GB** of model state, which does not fit on one 80 GB GPU, which is why we shard, offload or use LoRA/QLoRA.

:::formula Model-state memory (mixed-precision Adam)
M_{\text{state}} \approx 16\,P \text{ bytes}\quad(2+2+4+4+4)
:::

### Activations and how to shrink them

Activations are the intermediate tensors saved for the backward pass. They scale with **batch size × sequence length × hidden size × layers**. Reducers:

- **Gradient (activation) checkpointing**: do not store most activations; **recompute** them during backward. Roughly 30% more compute for large memory savings.
- **FlashAttention** ([paper](https://arxiv.org/abs/2205.14135)): avoids materialising the n² attention matrix.
- **Smaller micro-batches** + **gradient accumulation**.
- **Sequence packing** and **truncation** to realistic lengths.
- **Mixed precision** (bf16) and sometimes **FP8** on newest hardware.

```python run title="A training memory planner" level=intermediate
def gb(x): return x / 1e9

def plan(params_b, method="full", seq=4096, micro_batch=1, hidden=4096, layers=32, checkpointing=True, adapter_frac=0.008):
    P = params_b * 1e9
    if method == "full":
        state = 16 * P
    elif method == "lora":
        state = 2 * P + 16 * (P * adapter_frac)
    elif method == "qlora":
        state = 0.56 * P + 16 * (P * adapter_frac)
    # rough activation estimate: ~ (34 bytes) * seq * micro_batch * hidden per layer without checkpointing; checkpointing keeps ~1 tensor per layer
    per_layer = 34 * seq * micro_batch * hidden
    act = (2 * seq * micro_batch * hidden * layers) if checkpointing else per_layer * layers
    return gb(state), gb(act), gb(state + act) * 1.15            # +15% for buffers/fragmentation

print(f"{'model':>5} {'method':>7} {'ckpt':>5} {'state GB':>9} {'activations GB':>15} {'total GB':>9}")
for size, hidden, layers in ((7, 4096, 32), (70, 8192, 80)):
    for method in ("full", "lora", "qlora"):
        for ckpt in (False, True):
            s, a, t = plan(size, method, hidden=hidden, layers=layers, checkpointing=ckpt)
            print(f"{size:>4}B {method:>7} {str(ckpt):>5} {s:>9.1f} {a:>15.1f} {t:>9.1f}")
```

(Estimates are rough; real numbers depend on the framework, attention implementation and batch shape. Use the model's **memory profiler** to confirm.)

## Mixed precision

Modern training uses **bf16** (bfloat16): the same exponent range as fp32 with fewer mantissa bits, so no loss scaling needed, unlike fp16. Weights and activations are bf16 for speed, while **optimizer states and master weights stay fp32** for accuracy. FP8 training and 8-bit optimisers (bitsandbytes) cut memory and time further on supporting hardware, at some stability risk.

## Parallelism: how big jobs are split

When one GPU is not enough, split the work. The four dimensions:

```viz algo=arch title="Parallelism strategies" dir=down
dp   Data parallelism | same model on every GPU, different data [gpu*4] @0,0
zero ZeRO / FSDP | shard params, grads and optimiser state across the data-parallel group [gpu*4] @1,0
tp   Tensor parallelism | split each matrix across GPUs [gpu*4] @2,0
pp   Pipeline parallelism | different layers on different GPUs [gpu*4] @3,0
sp   Sequence / context parallelism | split the sequence across GPUs [gpu*4] @4,0
--
dp -> zero : too much memory per GPU
zero -> tp : still too big or too slow
tp -> pp : across nodes
pp -> sp : very long sequences
```

| Strategy | What is split | Communication | Use when |
|---|---|---|---|
| **Data parallel (DDP)** | the **batch**; each GPU holds a full model copy | all-reduce of gradients each step | the model fits on one GPU; scale throughput |
| **ZeRO / FSDP** | **parameters, gradients, optimiser state** sharded across data-parallel GPUs, gathered on demand | all-gather / reduce-scatter | model state does not fit per GPU; the default for fine-tuning up to ~70B on a node or two |
| **Tensor parallel (TP)** | each layer's **matrices** split across GPUs | all-reduce within each layer (needs fast interconnect, NVLink) | very large layers; within a node |
| **Pipeline parallel (PP)** | **layers** assigned to different GPUs (stages), micro-batches flow through | point-to-point activations; "bubbles" of idle time | across nodes; very deep models |
| **Sequence/context parallel** | the **sequence length** | all-to-all / ring communication | extremely long contexts |
| **Expert parallel** | MoE **experts** across GPUs | all-to-all token routing | mixture-of-experts models |

**ZeRO stages** (DeepSpeed): stage 1 shards optimiser states; stage 2 adds gradients; stage 3 adds parameters. PyTorch **FSDP** is the native equivalent of ZeRO-3. Large pretraining combines them (**3D/4D parallelism**: DP × TP × PP × SP). The Hugging Face **Ultra-Scale Playbook** ([guide](https://huggingface.co/spaces/nanotron/ultrascale-playbook)) and the JAX **How to Scale Your Model** book ([online](https://jax-ml.github.io/scaling-book/)) are the best free deep dives.

```python run title="How ZeRO stages cut per-GPU memory for a 7B model on 8 GPUs" level=intermediate
def per_gpu_gb(P, n_gpus, stage):
    weights, grads, opt = 2 * P, 2 * P, 12 * P                    # bytes (opt = fp32 master + m + v)
    if stage >= 1: opt /= n_gpus
    if stage >= 2: grads /= n_gpus
    if stage >= 3: weights /= n_gpus
    return (weights + grads + opt) / 1e9

P, N = 7e9, 8
print(f"model state for 7B on {N} GPUs (activations excluded):")
print(f"  plain data parallel (every GPU holds all 16 B/param): {per_gpu_gb(P, N, 0):6.1f} GB per GPU")
for stage in (1, 2, 3):
    print(f"  ZeRO stage {stage}: {per_gpu_gb(P, N, stage):6.1f} GB per GPU")
```

## Throughput, MFU and "is my cluster any good?"

**Model FLOPs Utilisation (MFU)**: achieved model FLOP/s divided by the hardware's peak. Good large-scale training reaches roughly 35–55% on modern GPUs. Lower numbers point to: communication stalls, small batches, data-loader bottlenecks, poor kernels or no FlashAttention.

```python run title="Estimate training time and cost from FLOPs and MFU" level=intermediate
def training_time(params, tokens, n_gpus, peak_flops_per_gpu, mfu, price_per_gpu_hour):
    flops = 6 * params * tokens                                   # forward + backward
    seconds = flops / (n_gpus * peak_flops_per_gpu * mfu)
    hours = seconds / 3600
    return hours, hours * n_gpus * price_per_gpu_hour

# fine-tuning: 8B model, 50M tokens, 8 GPUs (~1e15 peak bf16 each), 40% MFU, $2.5/GPU-hour
h, cost = training_time(8e9, 50e6, 8, 1e15, 0.40, 2.5)
print(f"fine-tune 8B on 50M tokens:  {h:5.1f} hours, ~${cost:,.0f}")
# LoRA does ~2/3 of the FLOPs of full tuning (no weight gradients for frozen matrices)
h2, c2 = training_time(8e9 * 2 / 3, 50e6, 8, 1e15, 0.40, 2.5)
print(f"same with LoRA (approx.):    {h2:5.1f} hours, ~${c2:,.0f}")
# pretraining a 7B model on 1T tokens, 512 GPUs
h3, c3 = training_time(7e9, 1e12, 512, 1e15, 0.45, 2.5)
print(f"pretrain 7B on 1T tokens, 512 GPUs: {h3 / 24:5.1f} days, ~${c3 / 1e6:,.1f}M")
```

Fine-tuning is **cheap** (minutes to hours, dollars to hundreds of dollars of raw compute). Even a small 7B pretraining run is a six-figure project once you add failed runs, data work and engineering, and frontier-scale runs cost orders of magnitude more. This is why almost everyone adapts rather than pretrains.

## Practicalities

- **Fast generation for RL and eval**: use a serving engine (vLLM) for rollouts; training frameworks integrate it (TRL, Open-R1, verl, OpenRLHF).
- **Data loading**: tokenise ahead of time, stream shards, pack sequences; an idle GPU waiting for data is wasted money.
- **Checkpointing**: save model, optimiser and **data-loader/RNG state** frequently (every N steps) to resume exactly; keep several; write to fast storage and sync to object storage. Test resumption.
- **Fault tolerance**: at scale, nodes fail daily; use elastic or restartable launchers (torchrun), monitoring and auto-restart.
- **Reproducibility**: seeds, library versions, config in git, logged hyperparameters; track runs with Weights & Biases, MLflow or similar.
- **Monitoring**: loss, grad norm, learning rate, throughput (tokens/s), GPU utilisation and memory, eval metrics; alert on NaN and divergence.
- **Hyperparameter search** is expensive: tune learning rate on a short run or a smaller model first.

## Frameworks and clouds

| Layer | Options |
|---|---|
| **Training libraries** | Hugging Face **Transformers/TRL/PEFT**, **Axolotl**, **Unsloth**, **torchtune**, **LLaMA-Factory**, **LitGPT**, **DeepSpeed**, **Megatron-LM**, **torchtitan**, **verl/OpenRLHF** (RL) |
| **Compute** | hyperscalers (AWS, GCP, Azure), GPU clouds (Lambda, CoreWeave, RunPod, Vast, Together, Modal, Lightning), on-prem clusters |
| **Hardware** | NVIDIA H100/H200/B200/A100, AMD MI300-series, TPUs; consumer GPUs (RTX 4090/5090) for QLoRA experiments; Apple silicon (MLX) for small local tuning |
| **Managed fine-tuning** | provider APIs, cloud ML platforms (SageMaker, Vertex AI, Azure AI Foundry), Hugging Face AutoTrain |

Choose by **cost per useful experiment**: for a first project, a single rented 24–80 GB GPU with QLoRA/LoRA and Unsloth or TRL is hard to beat. Scale only when evals show you need to.

```quiz
? Roughly how much memory does mixed-precision Adam training need per parameter for model state?
- 2 bytes
+ about 16 bytes (2 weights + 2 grads + 4 master + 4 m + 4 v)
- 100 bytes
> A 7B model therefore needs about 112 GB before activations.

? What does gradient checkpointing trade?
+ Extra recomputation (about 30% more compute) for much less activation memory
- Accuracy for speed
- Nothing
> It recomputes activations during the backward pass.

? Which parallelism shards parameters, gradients and optimiser state across data-parallel GPUs?
- Pipeline parallelism
+ ZeRO / FSDP
- Tensor parallelism
> ZeRO-3 and FSDP gather shards on demand.

? What does a low MFU indicate?
+ The hardware is underused: communication, data loading, small batches or inefficient kernels
- The model is too accurate
- The loss is too low
> Profile before buying more GPUs.
```

:::problem You need to fully fine-tune a 13B model but have one node with 8×80 GB GPUs. Is it possible, and how? {level=hard tags="memory,parallelism"}
Do the arithmetic.

:::solution Model answer
Model state ≈ 16 × 13B = **208 GB**, which does not fit on one 80 GB GPU but fits across 8 (640 GB total). Use **FSDP / ZeRO-3** to shard parameters, gradients and optimiser state across the 8 GPUs: about 26 GB of state per GPU, leaving ~50 GB for activations, which with **gradient checkpointing**, **FlashAttention** and a modest micro-batch plus gradient accumulation is comfortable. bf16 mixed precision, sequence packing and fast interconnect (NVLink) keep throughput high. If full fine-tuning is not essential, **LoRA** needs only ~30 GB per GPU even without sharding.
:::
:::

:::keypoints
- Mixed-precision Adam needs ≈ 16 bytes per parameter of model state, plus activations and overhead; LoRA/QLoRA slash the state to adapters plus a (quantised) frozen base.
- Reduce activations with gradient checkpointing, FlashAttention, micro-batching with accumulation and packing.
- Parallelism: data (DDP), ZeRO/FSDP (sharded state), tensor, pipeline, sequence and expert parallel; combine as scale demands.
- Plan with FLOPs ≈ 6·N·D, realistic MFU (35–55% at scale) and GPU price; fine-tuning is cheap, pretraining is not.
- Operate with fast data loading, resumable checkpoints (including optimiser and data state), monitoring and reproducible configs.
:::

:::resources
- [Hugging Face Ultra-Scale Playbook](https://huggingface.co/spaces/nanotron/ultrascale-playbook) — a hands-on guide to training on GPU clusters.
- [How to Scale Your Model (JAX)](https://jax-ml.github.io/scaling-book/) — rigorous, free book on the maths of scaling.
- [Horace He: Making Deep Learning Go Brrrr](https://horace.io/brrr_intro.html) — compute, memory bandwidth and overhead.
- [DeepSpeed](https://github.com/microsoft/DeepSpeed) and [PyTorch FSDP docs](https://pytorch.org/blog/) — ZeRO and sharded training.
- [FlashAttention](https://arxiv.org/abs/2205.14135) — the kernel that made long-context training practical.
- [Llama 3 Herd of Models](https://arxiv.org/abs/2407.21783) — a detailed account of real large-scale training infrastructure.
:::
