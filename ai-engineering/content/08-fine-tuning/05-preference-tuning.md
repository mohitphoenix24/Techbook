---
title: Preference Tuning — RLHF, DPO and Friends
level: advanced
time: 55
summary: How models learn what people prefer. Preference data, the Bradley–Terry reward model, the RLHF loop with PPO and a KL penalty, direct preference optimisation (the loss, its intuition, a worked example), variants (IPO, KTO, ORPO, SimPO), on-policy and AI-feedback data, known failure modes (length bias, reward hacking, over-optimisation), and a practical recipe. With runnable reward-model training, best-of-n and a DPO implementation.
---

SFT shows the model **good** answers. But for many qualities (helpfulness, tone, safety, concision, taste) it is much easier to say **"A is better than B"** than to write the perfect answer. **Preference tuning** turns such comparisons into training signal. It is the second stage of how assistants are made ([InstructGPT](https://arxiv.org/abs/2203.02155)) and the main tool for steering behaviour after SFT.

## The data: comparisons

A preference example is a **prompt** with a **chosen** (preferred) and a **rejected** response:

```json
{"prompt": "Explain what a token is.",
 "chosen":   "A token is a chunk of text, roughly 4 characters, that the model reads as one unit...",
 "rejected": "Tokens are things. They are used in AI."}
```

Sources: **human annotators** ranking outputs; **AI feedback** (a strong model judges, as in RLAIF and [Constitutional AI](https://arxiv.org/abs/2212.08073)); **implicit signals** (accepted vs edited drafts, regenerations, thumbs); **verifiable pairs** (a correct answer vs an incorrect one). **On-policy** data (responses sampled from the model you are tuning) is generally more useful than someone else's outputs.

## RLHF: reward model plus reinforcement learning

:::flow The classic RLHF pipeline
SFT model | a starting policy that follows instructions
Collect comparisons | sample several responses per prompt; rank them
Train a reward model | learn to score responses so preferred ones score higher
Optimise the policy | RL (PPO) maximises reward, with a KL penalty to stay near the SFT model
:::

### 1. The reward model (Bradley–Terry)

Given a prompt `x` and responses `y_w` (preferred) and `y_l` (rejected), a reward model `r(x, y)` is trained so that the preferred response gets a higher score. The Bradley–Terry model says the probability that `y_w` beats `y_l` is `σ(r_w − r_l)`:

:::formula Reward-model loss
\mathcal{L}_{RM} = -\log \sigma\big(r(x,y_w) - r(x,y_l)\big)
:::

```python run title="Train a tiny reward model from preference pairs" level=advanced
import numpy as np

rng = np.random.default_rng(0)
D = 6
true_w = np.array([2.0, 1.0, -1.5, 0.5, 0.0, 0.0])          # hidden "human taste" over 6 response features (helpful, polite, long, ...)

def sample_pairs(n):
    A, B = rng.normal(size=(n, D)), rng.normal(size=(n, D))  # feature vectors of two responses
    p_a_wins = 1 / (1 + np.exp(-(A - B) @ true_w))            # humans are noisy: Bradley-Terry with the true taste
    a_wins = rng.random(n) < p_a_wins
    chosen, rejected = np.where(a_wins[:, None], A, B), np.where(a_wins[:, None], B, A)
    return chosen, rejected

chosen, rejected = sample_pairs(2000)
w = np.zeros(D)
for step in range(500):
    margin = (chosen - rejected) @ w                          # r_w - r_l
    grad = -((1 - 1 / (1 + np.exp(-margin)))[:, None] * (chosen - rejected)).mean(axis=0)   # d/dw of -log sigmoid(margin)
    w -= 0.5 * grad

test_c, test_r = sample_pairs(2000)
acc = np.mean((test_c @ w) > (test_r @ w))
print("learned reward weights:", np.round(w, 2))
print("true taste weights    :", true_w)
print(f"held-out pair accuracy: {acc:.0%}  (the ceiling is below 100% because the 'annotators' are noisy)")
```

### 2. Optimise the policy with a KL leash

The policy `π_θ` generates responses; the reward model scores them; **PPO** (or a related RL algorithm) updates the policy to increase reward, with a **KL penalty** that keeps it close to the reference (SFT) model:

:::formula RLHF objective
\max_\theta\; \mathbb{E}_{x,\,y\sim\pi_\theta}\big[r(x,y)\big] - \beta\, D_{KL}\big(\pi_\theta(\cdot|x)\,\|\,\pi_{ref}(\cdot|x)\big)
:::

The KL term prevents the policy from drifting into gibberish that **exploits** the reward model (reward hacking). RLHF works but is **complex and unstable**: four models in memory (policy, reference, reward, value), many hyperparameters, and high variance.

### Best-of-n: the simplest use of a reward model

You do not have to train anything: sample `n` responses and return the one with the highest reward. It is a strong, cheap baseline and a way to improve outputs at inference time (or to make training data: **rejection sampling fine-tuning**).

```python run title="Best-of-n with a reward model: gains and diminishing returns" level=intermediate
import numpy as np

rng = np.random.default_rng(2)
def sample_rewards(n):                      # reward scores of n sampled responses (a noisy proxy for true quality)
    return rng.normal(0.0, 1.0, n)

def best_of_n(n, trials=5000):
    return np.mean([sample_rewards(n).max() for _ in range(trials)])

for n in (1, 2, 4, 8, 16, 64):
    print(f"best-of-{n:<3} expected reward = {best_of_n(n):5.2f}")
print("\nbut a proxy reward can be hacked: pushing n very high can select responses that exploit the reward model's flaws")
```

## DPO: skip the reward model and the RL loop

**Direct Preference Optimization** ([Rafailov et al.](https://arxiv.org/abs/2305.18290)) observes that the RLHF objective has a closed-form optimal policy, so you can optimise the policy directly on preference pairs with a simple classification-style loss:

:::formula DPO loss
\mathcal{L}_{DPO} = -\log \sigma\!\Big(\beta\big[\log\tfrac{\pi_\theta(y_w|x)}{\pi_{ref}(y_w|x)} - \log\tfrac{\pi_\theta(y_l|x)}{\pi_{ref}(y_l|x)}\big]\Big)
:::

Intuition: the quantity in brackets is how much **more the policy has moved toward the chosen answer than toward the rejected one, relative to the reference**. DPO pushes that up. `β` controls how far the policy may stray from the reference (like the KL coefficient).

Advantages: **two models** (policy and a frozen reference, or even one with LoRA), **no sampling loop**, stable, easy with a standard trainer. It is now the default open recipe for preference tuning (for example in [Tulu 3](https://arxiv.org/abs/2411.15124)).

```python run title="DPO on a toy policy: watch the chosen response gain probability" level=advanced
import numpy as np

# A "policy" over 4 candidate responses to ONE prompt, parameterised by logits. Reference = initial policy.
ref_logits = np.array([0.0, 0.0, 0.0, 0.0])
theta = ref_logits.copy()
CHOSEN, REJECTED, BETA, LR = 0, 3, 0.5, 0.5

def logp(z): z = z - z.max(); return z - np.log(np.exp(z).sum())

for step in range(0, 61):
    lp, lr_ = logp(theta), logp(ref_logits)
    margin = BETA * ((lp[CHOSEN] - lr_[CHOSEN]) - (lp[REJECTED] - lr_[REJECTED]))
    loss = np.log1p(np.exp(-margin))
    # margin = BETA * ((z_c - z_l) - (ref_c - ref_l)): the log-sum-exp terms cancel, so only the two logits matter.
    sig = 1 / (1 + np.exp(margin))                          # sigma(-margin) = -dloss/dmargin
    g = np.zeros(4)
    g[CHOSEN], g[REJECTED] = -BETA * sig, BETA * sig        # gradient of the loss wrt each logit
    theta -= LR * g
    if step in (0, 10, 30, 60):
        print(f"step {step:>2}: loss {loss:.3f}  P(chosen)={np.exp(lp[CHOSEN]):.2f}  P(rejected)={np.exp(lp[REJECTED]):.2f}  others={np.exp(lp[1:3]).round(2)}")
```

The chosen response's probability rises and the rejected one's falls, while `β` and the reference anchor how far it moves.

## Variants

| Method | Change | Why |
|---|---|---|
| **IPO** | squared loss instead of log-sigmoid | less over-fitting to deterministic preferences |
| **KTO** | learns from **single** good/bad labels, not pairs ([paper](https://arxiv.org/abs/2402.01306)) | easier data (thumbs up/down) |
| **ORPO** | combines SFT and odds-ratio preference loss in one stage, no reference model | simpler, cheaper |
| **SimPO** | reference-free, length-normalised reward | efficiency and length control |
| **RLAIF / Constitutional AI** | AI feedback replaces human labels | scalable, explicit principles |
| **Online / iterative DPO** | repeatedly sample from the current policy, label, and train again | closes the distribution gap |
| **GRPO / RLVR** | RL with group baselines and verifiable rewards | next lesson |

## Failure modes

| Problem | Symptom | Mitigation |
|---|---|---|
| **Length bias** | policy learns "longer is better" (annotators and judges favour length) | length-normalised or length-controlled training; balance pair lengths |
| **Reward hacking / over-optimisation** | reward rises but true quality falls (Goodhart) | KL penalty, early stopping, fresh evals, ensembles, proxy-vs-gold monitoring |
| **Sycophancy** | agrees with users to win approval | include pushback-robustness pairs; evaluate |
| **Noisy or inconsistent labels** | slow, unstable learning | guidelines, agreement checks, filter ambiguous pairs |
| **Off-policy mismatch** | pairs come from another model's distribution | on-policy sampling; iterative DPO |
| **Alignment tax** | capability regressions | mix SFT data, small `β` steps, regression suites |
| **Refusal drift** | too many or too few refusals | balanced safety and helpfulness pairs; over-refusal evals |

## A practical recipe

1. Start from a good **SFT model** (preference tuning refines, it does not teach a task from scratch).
2. Build **preference pairs** for your target behaviour: sample 2–4 responses per prompt from the SFT model, label by experts or a **calibrated judge**, keep clear winners, drop ties.
3. Train **DPO with LoRA** (β around 0.1; low learning rate such as 5e-7 for full, 5e-6 to 5e-5 for LoRA; 1–3 epochs).
4. Evaluate on task metrics, general capabilities, **length distribution**, **refusal behaviour** and safety. Read samples.
5. Iterate on-policy if gains plateau.
6. Keep the SFT model as the fallback.

```python local title="DPO with TRL (sketch)"
from datasets import load_dataset
from trl import DPOConfig, DPOTrainer
from peft import LoraConfig

dataset = load_dataset("json", data_files="preferences.jsonl", split="train")      # columns: prompt, chosen, rejected
trainer = DPOTrainer(
    model="my-org/my-sft-model",
    args=DPOConfig(output_dir="dpo-out", beta=0.1, learning_rate=5e-6, num_train_epochs=2,
                   per_device_train_batch_size=2, gradient_accumulation_steps=8, bf16=True),
    train_dataset=dataset,
    peft_config=LoraConfig(r=16, lora_alpha=32, target_modules="all-linear", task_type="CAUSAL_LM"),
)
trainer.train()
```

```quiz
? What does the KL penalty in RLHF do?
+ Keeps the policy close to the reference model so it cannot exploit the reward model with degenerate outputs
- Speeds up training
- Increases reward
> It anchors the policy and limits reward hacking.

? What is the main advantage of DPO over classic RLHF?
+ No separate reward model or RL sampling loop: a simple, stable loss on preference pairs
- It needs no data
- It is always more accurate
> Two models and a classification-style loss versus four models and PPO.

? What is length bias?
+ Annotators and judges tend to prefer longer answers, so tuned models become verbose
- Models cannot generate long text
- A tokenizer problem
> Control for length in data and evals.

? What is best-of-n sampling?
+ Sample n responses and return the one a reward model scores highest
- Training n models
- Using n GPUs
> A simple way to use a reward model at inference or to build training data.
```

:::problem Your DPO-tuned model gives longer, friendlier answers that annotators love, but users say it rambles and sometimes agrees with wrong claims. What happened and what do you change? {level=hard tags="dpo,length bias,sycophancy"}
Diagnose from the training data and propose changes.

:::solution Model answer
Likely **length bias and sycophancy** learned from preferences that favoured long, agreeable answers. Audit the preference data: correlation of `chosen` with length and with agreement; build **length-matched pairs** or add a length-controlled objective (SimPO/length-normalised loss); add **pushback pairs** where the preferred response politely holds a correct position; rebalance helpfulness vs concision; use an eval suite measuring **length distribution, sycophancy and correctness** besides preference win rate; lower `β` step or fewer epochs; and keep user-outcome metrics (task completion, edits) rather than annotator preference alone.
:::
:::

:::keypoints
- Preference tuning learns from "A is better than B" comparisons; sources include humans, AI feedback and implicit signals; on-policy data is best.
- RLHF = reward model (Bradley–Terry) + RL (PPO) with a KL penalty; best-of-n is a simple inference-time alternative.
- DPO optimises the policy directly on pairs with a stable loss relative to a reference model; variants include IPO, KTO, ORPO and SimPO.
- Watch for length bias, reward hacking, sycophancy, noisy labels, off-policy mismatch and capability regression.
- Recipe: good SFT model → clean pairs → DPO (LoRA, small β) → broad evals including length, safety and refusals → iterate.
:::

:::resources
- [Direct Preference Optimization](https://arxiv.org/abs/2305.18290) — the DPO paper.
- [Training language models to follow instructions with human feedback](https://arxiv.org/abs/2203.02155) — InstructGPT and the RLHF recipe.
- [Constitutional AI](https://arxiv.org/abs/2212.08073) — AI feedback guided by principles.
- [Hugging Face: Illustrating RLHF](https://huggingface.co/blog/rlhf) and [PPO implementation details](https://huggingface.co/blog/the_n_implementation_details_of_rlhf_with_ppo) — visual and practical.
- [Hugging Face TRL docs](https://huggingface.co/docs/trl) — DPO, KTO, ORPO and reward-model trainers.
- [Tulu 3](https://arxiv.org/abs/2411.15124) — a fully documented open post-training pipeline including DPO.
:::
