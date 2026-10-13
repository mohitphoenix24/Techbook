---
title: Speculative Decoding and Mixture-of-Experts
level: advanced
time: 50
summary: Two ways to get more quality per unit of inference cost. Speculative decoding (a cheap draft proposes, the big model verifies in one pass, with exact output distribution), its acceptance maths and variants (draft models, Medusa/EAGLE heads, n-gram lookup), and mixture-of-experts (routing, active versus total parameters, load balancing, expert parallelism, serving implications). With a verified speculative sampler and a runnable MoE router.
---

Decoding is bottlenecked by reading the weights once per token. Two ideas break the "one big read per token" rule from different directions: **speculative decoding** produces **several tokens per big-model step**; **mixture-of-experts** reads only a **fraction of the parameters per token**.

## Speculative decoding

:::def Speculative decoding
A small, fast **draft** model (or a cheap predictor) proposes `k` tokens ahead. The large **target** model then scores **all `k` positions in a single forward pass** (a prefill-like, parallel operation that costs about one decode step because decode is memory-bound). Tokens are **accepted** left to right while they agree with what the target would have produced; at the first rejection, the target supplies a corrected token and the process repeats. The output distribution is **exactly** the target's ([Leviathan et al.](https://arxiv.org/abs/2211.17192)).
:::

:::analogy
An intern drafts the next few sentences of a report; the senior editor reviews them in one pass, keeps everything up to the first thing they disagree with, and fixes that one spot. When the intern is good, the editor approves several sentences per review instead of writing each one personally.
:::

Try it: change the acceptance rate, draft length and draft cost, and see the speedup.

```viz algo=specdec title="Speculative decoding speedup"
```

### The maths

If each draft token is accepted independently with probability `α` (the **acceptance rate**), the expected number of tokens produced per target step with draft length `k` is:

:::formula Expected tokens per step
\mathbb{E}[\text{tokens}] = \frac{1-\alpha^{k+1}}{1-\alpha}
:::

If drafting costs a fraction `c` of a target step per token, the wall-clock **speedup** is `E[tokens] / (1 + c·k)`. It improves with high `α` (draft closely matches target) and cheap drafting, and has an optimal `k` (too long and later tokens are rarely accepted).

### How exactness is preserved

For each drafted token `x` sampled from the draft distribution `q`, accept with probability `min(1, p(x)/q(x))` where `p` is the target's distribution. On rejection, **resample** from the "residual" distribution `max(0, p − q)` (normalised). This **rejection-sampling** scheme guarantees the final token is distributed exactly according to `p`.

```python run title="Speculative sampling is exactly the target distribution (and when it is fast)" level=advanced
import numpy as np

rng = np.random.default_rng(0)
vocab = 6
p = np.array([0.50, 0.20, 0.12, 0.08, 0.06, 0.04])            # target model's next-token distribution
q = np.array([0.35, 0.30, 0.10, 0.10, 0.10, 0.05])            # draft model's (different!) distribution

def spec_step():
    x = rng.choice(vocab, p=q)                                  # draft proposes
    if rng.random() < min(1.0, p[x] / q[x]):                    # target verifies
        return x, True
    resid = np.maximum(p - q, 0); resid /= resid.sum()          # on rejection: sample from the residual distribution
    return rng.choice(vocab, p=resid), False

N = 200_000
samples, accepted = zip(*(spec_step() for _ in range(N)))
emp = np.bincount(samples, minlength=vocab) / N
print("target p      :", np.round(p, 3))
print("speculative   :", np.round(emp, 3), "<- identical up to sampling noise")
alpha = np.mean(accepted)
print(f"measured acceptance rate α = {alpha:.3f}   (theory: sum_x min(p, q) = {np.minimum(p, q).sum():.3f})")
for k in (1, 3, 5):
    print(f"k={k}: expected tokens per target step = {(1 - alpha ** (k + 1)) / (1 - alpha):.2f}")
```

The draft can be **wrong in distribution** and the result is still exactly right: the verification step corrects it. Speedup depends only on how often the draft agrees.

### Flavours of speculation

| Variant | Draft source | Notes |
|---|---|---|
| **Separate draft model** | a small model of the same family (e.g. 1B drafting for 70B) | needs a shared tokenizer; extra memory; α typically 0.6–0.85 |
| **Self-speculation / extra heads** (**Medusa**, **EAGLE**, multi-token prediction heads) | lightweight prediction heads on the target's own hidden states | no second model; trained once; tree-structured candidates raise acceptance |
| **n-gram / prompt-lookup** | copy likely continuations from the prompt (great for RAG, code editing, summarisation) | no model at all; helps when output repeats the input |
| **Lookahead / Jacobi decoding** | parallel iterative refinement | no draft model; modest gains |
| **Tree speculation** | verify a **tree** of candidate continuations in one pass | higher accepted length per step |

**When it helps:** low-concurrency, latency-sensitive serving where the GPU is underused (memory-bound decode), predictable text (code, structured output, edits, summaries with copying). **When it helps less:** very high concurrency (the batch already keeps the GPU busy, and speculation adds compute), highly random sampling at high temperature (lower acceptance), or when the draft is not cheap enough. Engines (vLLM, SGLang, TensorRT-LLM) support several methods; **measure on your traffic**.

## Mixture-of-experts (MoE)

:::def Mixture-of-experts
A Transformer whose feed-forward (MLP) block is replaced by **many parallel "expert" MLPs** plus a small **router** that sends each token to only a few of them (typically top-2 of 8, or top-8 of 64–256). Total parameters are large, but **active parameters per token are small**. Examples: Mixtral ([paper](https://arxiv.org/abs/2401.04088)), DeepSeek-V3 ([paper](https://arxiv.org/abs/2412.19437)), and many frontier models.
:::

The point: **capacity scales without proportional compute**. A model with 600B total parameters that activates 40B per token has the knowledge capacity of a very large model but the per-token compute (and decode bandwidth, in an ideal case) of a mid-sized one.

```python run title="A top-2 mixture-of-experts layer with a learned-style router" level=advanced
import numpy as np

rng = np.random.default_rng(1)
d, n_experts, top_k, n_tokens = 16, 8, 2, 4096

W_router = rng.normal(size=(d, n_experts)) * 0.5
experts = [(rng.normal(size=(d, 4 * d)) * 0.1, rng.normal(size=(4 * d, d)) * 0.1) for _ in range(n_experts)]     # each expert = a small MLP
x = rng.normal(size=(n_tokens, d))

def softmax(z): e = np.exp(z - z.max(axis=-1, keepdims=True)); return e / e.sum(axis=-1, keepdims=True)

logits = x @ W_router
top = np.argsort(-logits, axis=1)[:, :top_k]                                       # chosen experts per token
gates = np.take_along_axis(softmax(logits), top, axis=1); gates /= gates.sum(axis=1, keepdims=True)

out = np.zeros_like(x)
for e, (W1, W2) in enumerate(experts):
    rows, slots = np.where(top == e)                                               # tokens routed to expert e
    if len(rows):
        h = np.maximum(x[rows] @ W1, 0) @ W2
        out[rows] += gates[rows, slots][:, None] * h

load = np.bincount(top.ravel(), minlength=n_experts) / (n_tokens * top_k)
print("share of routed token-slots per expert:", np.round(load, 3), " (balanced would be", round(1 / n_experts, 3), ")")
print(f"active expert-MLPs per token: {top_k} of {n_experts} -> compute is {top_k / n_experts:.0%} of a dense layer with the same total parameters")

# load-balancing auxiliary loss (Switch Transformer style): encourages the router to spread tokens evenly
frac_tokens = load * top_k                                                          # fraction of tokens dispatched to each expert
mean_prob = softmax(logits).mean(axis=0)
aux = n_experts * float(np.sum(frac_tokens / top_k * mean_prob))
print(f"auxiliary balance loss ≈ {aux:.3f} (1.0 means perfectly balanced; larger means a few experts are overloaded)")
```

### Training MoE: the load-balancing problem

Routers tend to collapse onto a few favourite experts (the others get no training and become useless). Remedies: an **auxiliary load-balancing loss** ([Switch Transformers](https://arxiv.org/abs/2101.03961)), **capacity limits** with token dropping, **noisy gating**, and newer **auxiliary-loss-free** balancing (DeepSeek-V3).

### Serving MoE: what changes

| Aspect | Effect |
|---|---|
| **Memory** | **all experts must be resident** (or fetched), so memory ≈ total parameters, not active parameters |
| **Decode bandwidth** | per token only active experts' weights are *needed*, but with a **batch**, different tokens hit different experts, so a large batch touches most experts: the bandwidth advantage shrinks at high batch sizes |
| **Compute** | FLOPs per token ≈ active parameters: cheaper than a dense model of equal total size |
| **Parallelism** | **expert parallelism**: place experts on different GPUs; tokens are routed with **all-to-all** communication each layer |
| **Load imbalance** | popular experts become hotspots, hurting latency; batch composition matters |
| **Quantisation and offload** | experts are natural units to quantise or offload to CPU; on-demand expert loading is an active research area |
| **Prefill vs decode** | prefill batches many tokens, activating most experts: efficient. Single-stream decode touches few experts: good for bandwidth |

Quality versus cost framing: a MoE with `P_total` and `P_active` behaves roughly like a dense model between `P_active` and `P_total` in quality, at **compute of `P_active`** but **memory of `P_total`**. That makes MoE attractive for **large-scale serving with many GPUs** (memory is plentiful, compute per token is what you pay for) and less attractive for **single small GPUs** (memory-limited).

```python run title="Dense vs MoE: memory, compute and decode traffic" level=easy
def describe(name, total_b, active_b, bytes_per=2, batch=1, n_experts=64, top_k=6):
    mem_gb = total_b * bytes_per
    flops_per_token_g = 2 * active_b
    # expected fraction of experts touched by a batch (each token picks top_k of n_experts at random)
    touched = 1 - (1 - top_k / n_experts) ** batch
    traffic_gb = active_b * bytes_per if batch == 1 else (total_b * bytes_per * touched if "MoE" in name else total_b * bytes_per)
    return f"{name:26} memory {mem_gb:>6.0f} GB | compute {flops_per_token_g:>5.0f} GFLOPs/token | weight traffic per step (batch {batch:>3}) ≈ {traffic_gb:>6.0f} GB"

for b in (1, 32):
    print(describe("dense 70B", 70, 70, batch=b))
    print(describe("MoE 235B total / 22B active", 235, 22, batch=b))
    print()
```

At batch 1 the MoE moves far fewer bytes per step; at batch 32 nearly all experts are touched, so the bandwidth advantage mostly vanishes. Yet compute per token stays low, and quality per FLOP is better than dense.

```quiz
? Why can speculative decoding be exact?
+ Verification uses rejection sampling against the target's distribution, resampling from the residual on rejection
- The draft model is always correct
- It only works at temperature 0
> The final tokens are distributed exactly according to the target model.

? When is speculative decoding most helpful?
+ Latency-sensitive, low-concurrency serving of predictable text (code, edits, summaries), where decode leaves the GPU underused
- Very high-concurrency batch throughput jobs
- High-temperature creative sampling with a poor draft
> It trades extra compute for fewer sequential target steps.

? In a MoE model, what is true of memory and compute?
+ Memory scales with total parameters (all experts resident) while per-token compute scales with active parameters
- Memory scales with active parameters
- Compute scales with total parameters
> That is why MoE suits multi-GPU serving.

? Why is a load-balancing loss needed when training MoE?
+ Routers tend to collapse onto a few experts; balancing keeps all experts trained and utilised
- To reduce the vocabulary
- To speed up tokenization
> Imbalance wastes capacity and creates hotspots.
```

:::problem A product team wants lower latency for a code-editing assistant served at low concurrency. Propose an inference optimisation plan. {level=medium tags="speculative decoding,latency"}
Include method choice and validation.

:::solution Model answer
Code edits copy large portions of the existing file, so **prompt-lookup / n-gram speculation** (no extra model) or **EAGLE/Medusa-style heads** give high acceptance; a **small same-family draft model** is the alternative. Because concurrency is low, decode is memory-bound and speculative decoding yields substantial speedups (often 2×+). Validate: enable in vLLM/SGLang, benchmark ITL and tokens/s on real edit traces at realistic concurrency, confirm **output equality** at temperature 0 and quality parity under sampling, tune draft length `k`, and monitor acceptance rate; combine with quantisation and prefix caching of the file context. Check that speedup holds as concurrency rises and fall back if throughput suffers.
:::
:::

:::keypoints
- Speculative decoding: a cheap draft proposes k tokens, the target verifies them in one pass and keeps the accepted prefix plus one correction; output is exactly the target's distribution.
- Expected tokens per step = (1−α^(k+1))/(1−α); speedup depends on acceptance rate and draft cost; best for low-concurrency, predictable text.
- Variants: draft model, Medusa/EAGLE heads, n-gram/prompt lookup, lookahead, tree verification.
- MoE routes each token to a few experts: huge total capacity, small active compute; training needs load balancing.
- Serving MoE needs memory for all experts, expert parallelism with all-to-all, careful batching, and shines at multi-GPU scale.
:::

:::resources
- [Fast Inference from Transformers via Speculative Decoding](https://arxiv.org/abs/2211.17192) — the original paper.
- [Switch Transformers](https://arxiv.org/abs/2101.03961), [Mixtral of Experts](https://arxiv.org/abs/2401.04088) and [DeepSeek-V3](https://arxiv.org/abs/2412.19437) — MoE design and scaling.
- [vLLM docs](https://docs.vllm.ai) and [SGLang docs](https://docs.sglang.ai) — speculative decoding options and MoE serving.
- [Lilian Weng: Large Transformer Model Inference Optimization](https://lilianweng.github.io/posts/2023-01-10-inference-optimization/) — speculative decoding and MoE explained.
- [Hugging Face blog](https://huggingface.co/blog) — search for "mixture of experts explained" and "assisted generation".
- [Sebastian Raschka's magazine](https://magazine.sebastianraschka.com) — architecture comparisons including MoE models.
:::
