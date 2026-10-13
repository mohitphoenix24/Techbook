---
title: The Next-Token Machine
level: easy
time: 35
summary: The one idea behind every LLM. A model scores every possible next token, softmax turns scores into probabilities, and generation is just repeating that step. You build softmax, log-probabilities, perplexity and a generation loop, and see how a chat conversation is really one long piece of text.
---

An LLM does one thing. Given some text, it outputs a **probability for every possible next token**. Then one token is chosen, appended, and the process repeats. Writing an essay, solving a puzzle or calling a tool is that loop running many times.

:::analogy
Autocomplete on your phone, but trained on a library instead of your texts, and able to look at the entire conversation instead of the last word. "Predict the next word" sounds trivial until you notice that to predict the next word of a physics proof, you have to model physics.
:::

## The loop

:::flow Autoregressive generation
Text so far | "The capital of France is"
Model | a neural network computes a score (logit) for every token in the vocabulary
Softmax | scores become probabilities that sum to 1
Pick one | greedy, or sample (next lessons)
Append | " Paris" joins the text
Repeat | until an end token or a length limit
:::

:::def Logits
The raw, unnormalised scores a model outputs, one per vocabulary entry. They can be any real number (positive or negative). They are not probabilities yet.
:::

:::def Softmax
A function that turns logits into probabilities: exponentiate each score, then divide by the total. Bigger scores get a larger share, and everything sums to 1.
:::

:::formula Softmax
p_i = \frac{e^{z_i}}{\sum_j e^{z_j}}
:::

## Softmax in code

Subtracting the maximum before exponentiating changes nothing mathematically but avoids overflow. Real libraries always do it.

```python run title="Softmax and a peek at probabilities" level=easy
import numpy as np

def softmax(z):
    z = np.asarray(z, dtype=float)
    e = np.exp(z - z.max())          # subtract max: numerically stable
    return e / e.sum()

vocab  = ["Paris", "London", "Rome", "banana", "the"]
logits = [6.1, 3.0, 2.5, -2.0, 0.5]

for w, p in zip(vocab, softmax(logits)):
    print(f"{w:>7}: {p:6.3%}")
print("sum:", softmax(logits).sum())

# a huge logit would overflow without the max trick
print(softmax([1000, 999, 998]).round(3))
```

## Log-probabilities and perplexity

Multiplying many small probabilities underflows, so engineers work with **log-probabilities** (logprobs). The log of a product is a sum.

The probability of a whole sentence is the product of each token's probability given the tokens before it (the **chain rule**):

:::formula Chain rule of language
P(x_1, x_2, \dots, x_n) = \prod_{t=1}^{n} P(x_t \mid x_1, \dots, x_{t-1})
:::

:::def Perplexity
How surprised a model is by a text, as an "effective number of equally likely choices per token". Computed as the exponential of the average negative log-probability. **Lower is better.** Perplexity 1 means perfectly predicted; perplexity equal to the vocabulary size means total guessing.
:::

```python run title="Scoring sentences with a bigram model" level=intermediate
import numpy as np

corpus = ("the cat sat on the mat . the dog sat on the log . "
          "the cat saw the dog . the dog saw the cat .").split()
vocab = sorted(set(corpus)); idx = {w: i for i, w in enumerate(vocab)}

counts = np.ones((len(vocab), len(vocab))) * 0.1          # tiny smoothing so nothing is impossible
for a, b in zip(corpus, corpus[1:]):
    counts[idx[a], idx[b]] += 1
P = counts / counts.sum(axis=1, keepdims=True)

def logprob(sentence):
    words = sentence.split()
    return sum(np.log(P[idx[a], idx[b]]) for a, b in zip(words, words[1:]))

def perplexity(sentence):
    n = len(sentence.split()) - 1
    return float(np.exp(-logprob(sentence) / n))

for s in ["the cat sat on the mat .",
          "the dog saw the cat .",
          "mat the on sat cat the ."]:
    print(f"{s:28} logprob={logprob(s):7.2f}  perplexity={perplexity(s):6.2f}")
```

The scrambled sentence is far more surprising. That is how models are trained: adjust the numbers so that **real text gets high probability**, i.e. minimise the average negative log-probability, called the **cross-entropy loss**.

:::formula Cross-entropy loss for one token
\mathcal{L} = -\log p_\theta(x_t \mid x_{<t})
:::

## From counting to a neural network

The bigram model above has a probability table with one row per previous word. That does not scale: the number of possible contexts grows exponentially. A neural network replaces the table with a **function with learned parameters** that maps *any* context to a probability vector, generalising to contexts it has never seen.

| | Bigram table | LLM |
|---|---|---|
| Looks at | the previous word | thousands to millions of previous tokens |
| Parameters | vocab² numbers | billions of numbers |
| Generalises | no (unseen pair = 0) | yes (similar contexts give similar predictions) |
| Learned by | counting | gradient descent on cross-entropy |

## A chat is just text

The "chat" format is a convention. Before the model sees a conversation, it is flattened into one string with special marker tokens. A model fine-tuned on this format learns to continue it as the assistant.

```python run title="A chat template, by hand" level=easy
def apply_chat_template(messages, add_generation_prompt=True):
    """A simplified ChatML-style template. Every model family has its own markers."""
    out = ""
    for m in messages:
        out += f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n"
    if add_generation_prompt:
        out += "<|im_start|>assistant\n"        # the model continues from here
    return out

conversation = [
    {"role": "system", "content": "You are a concise assistant."},
    {"role": "user", "content": "Capital of France?"},
]
print(apply_chat_template(conversation))
```

Three consequences you will use constantly:

1. The API is **stateless**: the model remembers nothing between calls. To "continue a conversation" you resend the whole history.
2. The **system prompt** is just the first part of the text, given extra weight during training.
3. Token limits apply to the **whole** flattened conversation, plus the reply.

:::warn The model does not "look things up"
It computes probabilities from patterns in its weights and the text in front of it. If the answer is not in the context and was not learned well, a fluent but wrong continuation can still have a high probability. That is a **hallucination**, covered in the limits lesson.
:::

## Generation loop with a stopping rule

```python run title="A generation loop with stop conditions" level=intermediate
import numpy as np

vocab = ["<eos>", "the", "cat", "sat", "on", "mat", "."]
# fake "model": next-token logits depend only on the last token (a stand-in for a Transformer)
table = {
    "<start>": [0, 5, 0, 0, 0, 0, 0],
    "the": [0, 0, 4, 0, 0, 3, 0],
    "cat": [0, 0, 0, 5, 0, 0, 1],
    "sat": [0, 0, 0, 0, 5, 0, 1],
    "on":  [0, 5, 0, 0, 0, 0, 0],
    "mat": [0, 0, 0, 0, 0, 0, 5],
    ".":   [6, 1, 0, 0, 0, 0, 0],
}

def softmax(z):
    z = np.array(z, float); e = np.exp(z - z.max()); return e / e.sum()

def generate(max_new_tokens=12, seed=1):
    rng = np.random.default_rng(seed)
    tokens, last = [], "<start>"
    for _ in range(max_new_tokens):
        p = softmax(table[last])
        nxt = vocab[rng.choice(len(vocab), p=p)]
        if nxt == "<eos>":                      # model-emitted stop token
            break
        tokens.append(nxt); last = nxt
    return " ".join(tokens)

for seed in range(4):
    print(seed, "->", generate(seed=seed))
```

Two stopping reasons exist in every API: the model emitted an **end-of-sequence** token (`end_turn`), or you hit your **`max_tokens`** limit and the text was cut (`max_tokens`). Always check which happened.

```quiz
? What does a language model output at each step?
- A single word chosen by the model
+ A probability for every token in its vocabulary
- A full sentence
> The model produces scores for all vocabulary tokens; a separate decoding step chooses one.

? Why do we subtract the maximum logit before exponentiating in softmax?
- It makes the model more accurate
+ It avoids numeric overflow without changing the result
- It sorts the tokens
> softmax(z) equals softmax(z - c) for any constant c; subtracting the max keeps the exponentials small.

? A model has perplexity 4 on a text. Roughly what does that mean?
+ On average it is as uncertain as picking between 4 equally likely tokens
- It made 4 mistakes
- The text has 4 words
> Perplexity is the effective branching factor per token; lower means better prediction.

? Why must you resend the conversation history on every API call?
- To help the model reason better
+ Because the model is stateless; the "memory" is just the text in the prompt
- Because the provider deletes your account
> LLM APIs hold no hidden session for the model. Context you do not send is context it does not have.
```

:::problem Why can an LLM state a false fact with confidence? {level=easy tags="fundamentals,hallucination"}
Explain in terms of how generation works, and give one engineering mitigation.

:::hint Hint
Think about what the model optimises during training and what it has when it answers.
:::

:::solution Model answer
The model was trained to assign high probability to **plausible continuations**, not to verify truth. At each step it samples from a distribution over tokens; if the true fact was rare or absent in training, a fluent wrong answer can still be high-probability, and nothing in the loop checks it. Mitigations: **ground** the answer in retrieved sources (RAG) with citations, let it call tools for facts, ask it to say "I don't know" and evaluate that behaviour, and verify with a second check (code, schema, a judge) before showing the result.
:::
:::

:::keypoints
- An LLM maps text to a probability distribution over the next token; generation repeats that step.
- Logits → softmax → probabilities. Work in log space; perplexity = exp(average negative logprob).
- Training minimises cross-entropy: make real text more probable.
- A chat is flattened into one text with role markers; APIs are stateless.
- Generation stops on an end token or `max_tokens`; always check why.
:::

:::resources
- [Karpathy: Neural Networks, Zero to Hero](https://karpathy.ai/zero-to-hero.html) — starts with exactly this bigram model (makemore) and builds up to GPT.
- [Karpathy: Let's build GPT from scratch (video)](https://www.youtube.com/watch?v=kCc8FmEb1nY) — the Transformer in code, step by step.
- [Hugging Face LLM Course: how Transformers work](https://huggingface.co/learn/llm-course) — hands-on chapters on decoding and models.
- [3Blue1Brown: neural networks](https://www.3blue1brown.com/topics/neural-networks) — beautiful visual intuition for networks and Transformers.
:::
