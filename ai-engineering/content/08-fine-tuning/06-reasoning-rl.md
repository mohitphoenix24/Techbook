---
title: Reasoning Models and Reinforcement Learning with Verifiable Rewards
level: advanced
time: 55
summary: How today's reasoning models are trained. Reward functions you can compute (RLVR), the GRPO algorithm (group-relative advantages, no value network), the DeepSeek-R1 recipe (cold start, RL, rejection sampling, distillation), emergent reasoning behaviours, process versus outcome rewards, test-time compute and budget control, and how to try it yourself. With runnable verifiers, a toy GRPO learner and a majority-vote scaling experiment.
---

A reasoning model "thinks" for hundreds or thousands of tokens before answering: it plans, tries, checks, backtracks. Where does that behaviour come from? Not mainly from copying human reasoning traces, but from **reinforcement learning**: let the model generate long chains of thought, reward the ones that end in **correct, checkable answers**, and the useful habits emerge. This lesson explains the mechanics so you can use these models intelligently and train small ones yourself.

## Verifiable rewards

:::def RLVR (Reinforcement Learning with Verifiable Rewards)
RL where the reward comes from a **programmatic check** rather than a learned reward model or human labels: does the final answer match the ground truth, does the code pass the tests, does the proof check, is the output in the required format? Cheap, objective, and hard to game compared with learned rewards.
:::

Domains with verifiers: **maths** (answer equality), **code** (unit tests, compilers), **logic puzzles** (constraint checkers), **structured tasks** (schema validity, SQL results), **instruction following with checkable constraints** ("exactly three bullet points"), and **tool tasks** with a final state to check.

```python run title="Verifiers: turn a model's text into a reward" level=intermediate
import re

def extract_final_answer(text):
    m = re.search(r"<answer>\s*(.*?)\s*</answer>", text, re.S)
    return m.group(1).strip() if m else None

def math_reward(completion, gold):
    ans = extract_final_answer(completion)
    if ans is None: return 0.0                                  # no answer in the required format
    try:
        return 1.0 if abs(float(ans.replace(",", "")) - float(gold)) < 1e-6 else 0.0
    except ValueError:
        return 0.0

def format_reward(completion):
    ok = bool(re.search(r"<think>.*?</think>\s*<answer>.*?</answer>", completion, re.S))
    return 0.2 if ok else 0.0

def total_reward(completion, gold): return math_reward(completion, gold) + format_reward(completion)

samples = [
    "<think>12 pens is 4 groups of 3, each $2, so 8.</think><answer>8</answer>",
    "<think>3 pens cost 2, so 12 pens cost 6.</think><answer>6</answer>",          # wrong
    "The answer is 8.",                                                              # right, but wrong format
]
for s in samples:
    print(f"reward {total_reward(s, 8):.1f}  | {s[:70]}")
```

The format reward teaches the model to separate reasoning from answer so the verifier can parse it.

## GRPO: group-relative policy optimisation

PPO needs a **value network** (a critic) to estimate a baseline, which is costly for LLMs. **GRPO** ([DeepSeekMath](https://arxiv.org/abs/2402.03300)) drops it: for each prompt, sample a **group** of `G` responses, score them, and use the **group's own mean and standard deviation** as the baseline.

:::formula Group-relative advantage
A_i = \frac{r_i - \operatorname{mean}(r_1,\dots,r_G)}{\operatorname{std}(r_1,\dots,r_G)}
:::

Responses better than their siblings get positive advantage (raise their probability); worse ones get negative advantage. The policy update is clipped (as in PPO) and regularised with a KL term to a reference model.

:::flow One GRPO step
Sample prompts | a batch of questions with ground truth
Generate groups | G responses per prompt from the current policy
Score | verifier rewards for each response
Advantages | normalise rewards within each group
Update | policy gradient with clipping and a KL penalty
:::

### A toy GRPO learner

A "policy" chooses among strategies for solving a problem; each strategy has a hidden success probability. GRPO raises the probability of the strategies that win more often than their group average.

```python run title="GRPO on a toy policy: the policy discovers the reliable strategy" level=advanced
import numpy as np

rng = np.random.default_rng(0)
strategies = ["guess", "quick mental math", "write steps then check", "write steps, check, retry if mismatch"]
success_prob = np.array([0.10, 0.45, 0.70, 0.90])                   # hidden: how often each strategy yields a correct answer
logits = np.zeros(4)

def softmax(z): e = np.exp(z - z.max()); return e / e.sum()

G, LR, STEPS = 16, 0.5, 120
for step in range(STEPS + 1):
    p = softmax(logits)
    choices = rng.choice(4, size=G, p=p)                           # a group of G sampled behaviours for the same prompt
    rewards = (rng.random(G) < success_prob[choices]).astype(float) # verifiable reward: correct or not
    adv = (rewards - rewards.mean()) / (rewards.std() + 1e-8)       # group-relative advantages
    grad = np.zeros(4)
    for c, a in zip(choices, adv):                                  # policy gradient: raise log-prob of high-advantage choices
        onehot = np.eye(4)[c]
        grad += a * (onehot - p)
    logits += LR * grad / G
    if step in (0, 20, 60, 120):
        print(f"step {step:>3}: " + "  ".join(f"{s[:14]}={q:.2f}" for s, q in zip(strategies, softmax(logits))) + f"   mean reward {rewards.mean():.2f}")
```

Real GRPO does the same with a billion-parameter policy over token sequences. Notice what emerges: the policy shifts toward **verification and retrying**, the "reasoning behaviours" seen in real reasoning models.

## The DeepSeek-R1 recipe

The R1 paper ([arXiv](https://arxiv.org/abs/2501.12948)) made the approach public:

1. **R1-Zero**: apply RL (GRPO) **directly to a base model** with accuracy and format rewards. Reasoning ability grew steadily: longer chains of thought, **self-verification, reflection, "aha moments"**, all without human reasoning data. Weaknesses: poor readability, language mixing.
2. **Cold start**: fine-tune on a small set of **long chain-of-thought examples** to stabilise and make outputs readable.
3. **Reasoning-oriented RL**: GRPO with verifiable rewards plus a **language-consistency reward**.
4. **Rejection sampling + SFT**: sample many solutions from the RL model, keep correct ones (plus general data) and fine-tune.
5. **RL again** across all scenarios, including preference rewards for helpfulness and harmlessness.
6. **Distillation**: fine-tune smaller models on the large model's reasoning traces, which transfers much of the ability **more effectively than running RL on small models directly**.

Open reproductions (Open-R1 by Hugging Face, [blog](https://huggingface.co/blog/open-r1); TRL's `GRPOTrainer`) let you experiment at small scale.

```python local title="GRPO with TRL (sketch for a small model)"
from datasets import load_dataset
from trl import GRPOConfig, GRPOTrainer
import re

def accuracy_reward(prompts, completions, answer, **kwargs):
    """Reward = 1 if the <answer> tag contains the ground truth. TRL passes dataset columns (like `answer`) as kwargs."""
    out = []
    for completion, gold in zip(completions, answer):
        text = completion if isinstance(completion, str) else completion[0]["content"]
        m = re.search(r"<answer>(.*?)</answer>", text, re.S)
        out.append(1.0 if m and m.group(1).strip() == str(gold) else 0.0)
    return out

dataset = load_dataset("json", data_files="math_train.jsonl", split="train")      # columns: prompt, answer
trainer = GRPOTrainer(
    model="Qwen/Qwen2.5-0.5B-Instruct",
    reward_funcs=accuracy_reward,
    args=GRPOConfig(output_dir="grpo-out", num_generations=8, per_device_train_batch_size=8, learning_rate=1e-6, max_completion_length=512, bf16=True),
    train_dataset=dataset,
)
trainer.train()
```

## Outcome versus process rewards

- **Outcome rewards** (is the final answer right?) are simple and hard to hack, but give sparse signal for long chains and may reward lucky guesses or wrong reasoning that lands on the right answer.
- **Process rewards** score each reasoning **step** ([Let's Verify Step by Step](https://arxiv.org/abs/2305.20050)): denser feedback and better credit assignment, but they need step-level labels or a learned process reward model, which can be gamed.

Most open recipes use **outcome verifiers**, sometimes with format and length shaping.

## Reward design pitfalls

| Pitfall | Example | Fix |
|---|---|---|
| **Reward hacking** | the model edits the tests, hard-codes expected outputs, or exploits a checker's bug | sandbox, hidden tests, verify the verifier, penalise suspicious patterns |
| **Format gaming** | outputs the answer tag with no reasoning | combine rewards; require substantive reasoning for credit |
| **Length drift** | chains grow without improving accuracy | length penalties, budget-aware rewards |
| **Sparse rewards** | too-hard problems give all-zero groups (no signal) | curriculum; filter prompts to medium difficulty (some groups succeed, some fail) |
| **Diversity collapse** | the policy becomes deterministic and stops exploring | entropy bonuses, higher sampling temperature, KL control |
| **Verifier brittleness** | "1/2" vs "0.5" marked wrong | robust answer normalisation |

## Test-time compute

Reasoning models improve with **more thinking at inference**:

- **Longer chains of thought** (higher effort/budget): more verification and exploration.
- **Parallel sampling + aggregation**: majority voting ([self-consistency](https://arxiv.org/abs/2203.11171)), best-of-n with a verifier.
- **Search** (tree/beam search guided by verifiers).
- **Budget forcing** ([s1](https://arxiv.org/abs/2501.19393)): control thinking length by truncating or appending "Wait" to extend reasoning.

[Snell et al.](https://arxiv.org/abs/2408.03314) show that, for some tasks, spending compute at inference can beat scaling the model. The cost is **latency and tokens**, which is why APIs expose **effort** or **thinking budget** controls.

```python run title="Majority voting improves accuracy as you sample more (test-time compute)" level=intermediate
import numpy as np

rng = np.random.default_rng(4)

def solve_once(p_correct, n_wrong=5):
    """One sampled reasoning chain: correct with probability p; otherwise one of several wrong answers."""
    return "correct" if rng.random() < p_correct else f"wrong{rng.integers(n_wrong)}"

def voted_accuracy(p, k, trials=3000):
    wins = 0
    for _ in range(trials):
        votes = {}
        for a in (solve_once(p) for _ in range(k)):
            votes[a] = votes.get(a, 0) + 1
        wins += max(votes, key=votes.get) == "correct"
    return wins / trials

print(f"{'single-chain accuracy':>22} " + " ".join(f"k={k:<3}" for k in (1, 4, 16, 64)))
for p in (0.35, 0.5, 0.65):
    print(f"{p:>22.0%} " + " ".join(f"{voted_accuracy(p, k):>4.0%} " for k in (1, 4, 16, 64)))
print("\nvoting only helps when the right answer is the most common one; below that it cannot rescue the model")
```

## When to use a reasoning model

| Task | Reasoning model? |
|---|---|
| Hard maths, code with subtle bugs, multi-step planning, scientific analysis | **Yes**, with higher effort |
| Extraction, classification, routing, short answers | usually **no** (or low effort): faster and cheaper |
| Agents | often **yes**, with adaptive effort; interleaved thinking between tool calls |
| Latency-critical UX | prefer low effort or a non-reasoning model; stream partial progress |

**Prompting reminders:** state goals and constraints rather than step-by-step procedures; control cost with the effort setting; expect more tokens (billed as output); do not rely on the raw chain of thought as an explanation.

## Training your own reasoner: realistic advice

- RL on **small models (1–8B)** works best on **narrow, verifiable domains** (a specific puzzle type, code for your DSL, SQL generation) and often needs a **cold-start SFT** on traces first.
- **Distilling** a strong teacher's reasoning traces into your model is often the most effective and cheapest route.
- Invest in the **verifier and the prompt set** (difficulty-calibrated). Monitor reward, response length, entropy, KL and **held-out accuracy**.
- Budget generously for **inference** during training: rollouts dominate cost (use vLLM-style fast generation).

```quiz
? What is the main idea of RLVR?
+ Use programmatic verifiers (answer match, tests) as the reward instead of a learned reward model
- Use only human labels
- Train without data
> Cheap, objective rewards that are hard to game.

? How does GRPO get a baseline without a value network?
+ It samples a group of responses per prompt and normalises rewards by the group's mean and standard deviation
- It guesses
- It uses the reference model's output
> Group-relative advantages replace the critic.

? Why distill reasoning traces into small models instead of running RL on them directly?
+ The reasoning ability of a large RL-trained model transfers efficiently to smaller models through SFT on its traces
- Small models cannot be trained
- It avoids all data
> Distillation outperformed direct RL on small models in the R1 report.

? What does majority voting over sampled chains require to help?
+ The correct answer must be the most common one among samples (individual chains better than random guessing)
- A larger vocabulary
- Lower temperature only
> Voting amplifies a signal that is already there.
```

:::problem You want RL to improve a 3B model at text-to-SQL for your schema. Outline the setup. {level=hard tags="rlvr,sql,design"}
Cover the verifier, data, and monitoring.

:::solution Model answer
**Verifier**: execute the generated SQL in a sandboxed database snapshot and compare result sets to the reference (order-insensitive unless required); add small rewards for valid syntax and required format; penalise destructive statements. **Data**: a few thousand (question, reference SQL/result) pairs covering joins, aggregates and edge cases; filter by difficulty so that groups of 8 samples contain both successes and failures. **Training**: optional short SFT cold start, then GRPO with ~8 generations per prompt, low LR, KL to the SFT model. **Monitoring**: held-out execution accuracy, reward and length curves, entropy/KL, and samples checked for reward hacking (hard-coded results, unsafe SQL). Compare to the prompted baseline and a larger teacher, and keep a schema-shift test set.
:::
:::

:::keypoints
- Reasoning behaviours emerge when RL rewards verifiably correct final answers; RLVR uses programmatic checks (answers, tests, constraints) as rewards.
- GRPO samples a group per prompt and uses group-normalised rewards as advantages, avoiding a value network; add clipping and a KL term.
- The R1 recipe: R1-Zero RL → cold-start SFT → reasoning RL → rejection-sampling SFT → RL → distillation into smaller models.
- Watch reward hacking, format gaming, length drift, sparse rewards, entropy collapse and brittle verifiers.
- Test-time compute (longer thinking, sampling plus voting, search, budget forcing) trades tokens for accuracy; use effort controls and reserve reasoning models for hard tasks.
:::

:::resources
- [DeepSeek-R1](https://arxiv.org/abs/2501.12948) and [DeepSeekMath (GRPO)](https://arxiv.org/abs/2402.03300) — the recipe and the algorithm.
- [Open-R1 (Hugging Face)](https://huggingface.co/blog/open-r1) and [TRL docs](https://huggingface.co/docs/trl) — open reproductions and trainers.
- [Scaling LLM Test-Time Compute Optimally](https://arxiv.org/abs/2408.03314) and [s1: Simple test-time scaling](https://arxiv.org/abs/2501.19393) — inference-time scaling.
- [Let's Verify Step by Step](https://arxiv.org/abs/2305.20050) — process supervision.
- [Lilian Weng: Why We Think](https://lilianweng.github.io/posts/2025-05-01-thinking/) — a survey of reasoning and test-time compute.
- [Tulu 3](https://arxiv.org/abs/2411.15124) — RLVR within an open post-training recipe.
:::
