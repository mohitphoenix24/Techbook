---
title: Token Economics — Cost, Latency and Context Budgets
level: easy
time: 45
summary: How to predict what an LLM feature will cost and how fast it will feel. Price per token (input, output, cached), context windows as a budget, time to first token and tokens per second, rate limits in tokens per minute, with two simulators and the napkin-math habits that stop surprise bills.
---

You are about to ship an AI feature. Three questions decide whether it survives contact with finance and users: **How much does it cost? How fast does it feel? Will it fit in the context window?** All three are answered with token arithmetic.

## 1. Cost

:::def Price per million tokens
Providers bill separately for **input tokens** (everything you send: system prompt, history, retrieved documents, tool definitions) and **output tokens** (everything the model writes, including hidden reasoning). Prices are quoted per million tokens (MTok). Output costs several times more than input.
:::

:::formula Cost of one request
\text{cost} = \frac{n_{\text{in}}}{10^6}\,p_{\text{in}} + \frac{n_{\text{out}}}{10^6}\,p_{\text{out}}
:::

Cached input (prompt caching, next lessons) is billed at a small fraction of the normal input price, and batch requests at a discount. Example list prices from Anthropic's docs (October 2026), USD per MTok in / out: Haiku 5.5 **0.10 / 0.50**, Sonnet 5.5 **2 / 10**, Opus 5.5 **4 / 20**. Always check the live pricing page: they change.

```python run title="Cost of a request, and of a product" level=easy
PRICES = {                      # USD per million tokens: (input, output, cached-input read)
    "haiku":  (0.10, 0.50, 0.01),
    "sonnet": (2.00, 10.00, 0.20),
    "opus":   (4.00, 20.00, 0.40),
}

def request_cost(model, n_in, n_out, cached_in=0):
    p_in, p_out, p_cache = PRICES[model]
    fresh = n_in - cached_in
    return (fresh * p_in + cached_in * p_cache + n_out * p_out) / 1e6

# A support chatbot: 1,500-token system prompt + 800 tokens of retrieved docs + history, 250-token answer
n_in, n_out = 3_000, 250
for model in PRICES:
    c = request_cost(model, n_in, n_out)
    print(f"{model:7} ${c:.5f}/request   ${c * 1_000:,.2f} per 1,000 requests   ${c * 1_000_000:,.0f} per million requests")

# Same chatbot when the 1,500-token system prompt is served from cache
c = request_cost("sonnet", n_in, n_out, cached_in=1_500)
print(f"\nsonnet with 1,500 cached tokens: ${c:.5f}/request  ({(1 - c / request_cost('sonnet', n_in, n_out)):.0%} cheaper)")
```

### Where the tokens hide

Beginners count the question and the answer. The bill is dominated by what you did not type:

| Hidden input | Typical size | Fix |
|---|---|---|
| System prompt | 500–5,000 | cache it; trim it |
| Tool / function definitions | 200–5,000 | fewer tools, shorter descriptions, tool search |
| Conversation history | grows each turn | summarise or truncate (module 3) |
| Retrieved documents | 1,000–10,000 | rerank, fewer and smaller chunks |
| Few-shot examples | 500–3,000 | fewest that pass your eval; cache |
| **Reasoning / thinking** (output) | 100s–10,000s | lower effort for easy tasks |
| Images / PDF pages | ~1,000+ per page or image | resize; send only needed pages |

## 2. The context window as a budget

:::def Context window
The maximum number of tokens the model can handle in **one request, input and output together**. Frontier models now offer 200K to 1M+ tokens. A bigger window does not mean you should fill it: cost and latency grow with length, and accuracy on details can degrade (the "lost in the middle" effect).
:::

Plan the window like a budget: what is fixed (system prompt, tools), what grows (history), what you retrieve (documents), and what you reserve for the answer.

```viz algo=ctxbudget title="Context-window budget" window=200000
```

## 3. Latency

Latency has two parts you can feel separately:

:::def TTFT (time to first token)
How long until the first output token appears. Dominated by **queueing plus prefill**: processing your whole input. Longer prompts and bigger models mean longer TTFT.
:::

:::def TPS (tokens per second)
How fast tokens stream out after the first. Dominated by **decoding**, one token at a time. Typical hosted models stream somewhere around tens to a couple hundred tokens per second, depending on size and provider.
:::

:::formula Total latency (rough)
T \approx \text{TTFT} + \frac{n_{\text{out}}}{\text{TPS}}
:::

```python run title="Latency math: why streaming and short outputs matter" level=easy
def total_latency(ttft_s, out_tokens, tps):
    return ttft_s + out_tokens / tps

scenarios = [
    ("short classification label",       0.5,    5,  80),
    ("chat reply (200 tokens)",           0.6,  200,  80),
    ("long report (2,000 tokens)",        0.8, 2000,  80),
    ("reasoning model: 4,000 thinking + 300",  1.0, 4300,  80),
]
for name, ttft, n_out, tps in scenarios:
    t = total_latency(ttft, n_out, tps)
    print(f"{name:42} total {t:6.1f}s   first token at {ttft}s")
```

Design consequences:

- **Stream** so the user sees the first token in under a second even when the full answer takes 20 seconds.
- **Output length is your biggest latency lever.** Ask for terse answers and structured fields instead of prose when a program is the reader.
- **Reasoning tokens count as output time**, so use low effort for latency-sensitive paths.
- **Parallelise** independent calls (retrieval + classification) instead of chaining them.
- A **smaller model** is usually both faster and cheaper; use it for the steps that do not need the big one.

## 4. Rate limits are in tokens too

Providers limit **requests per minute (RPM)**, **input tokens per minute (ITPM)** and **output tokens per minute (OTPM)**. A feature that is fine at 10 users can hit a wall at 1,000.

```python run title="Will we hit the rate limit?" level=intermediate
def capacity_check(users, req_per_user_per_min, in_tokens, out_tokens, rpm, itpm, otpm):
    rps_total = users * req_per_user_per_min
    need = {"RPM": rps_total, "ITPM": rps_total * in_tokens, "OTPM": rps_total * out_tokens}
    limit = {"RPM": rpm, "ITPM": itpm, "OTPM": otpm}
    for k in need:
        flag = "OK " if need[k] <= limit[k] else "OVER"
        print(f"{flag} {k}: need {need[k]:>10,.0f} / limit {limit[k]:>10,}  ({need[k] / limit[k]:.0%})")

print("100 users, 1 request/min each:")
capacity_check(100, 1, 3_000, 300, rpm=1_000, itpm=400_000, otpm=80_000)
print("\n1,000 users:")
capacity_check(1_000, 1, 3_000, 300, rpm=1_000, itpm=400_000, otpm=80_000)
```

Cached input often does **not** count (or counts less) towards input-token limits, another reason to cache. When you outgrow limits: request a higher tier, add a queue with backoff (reliability lesson), batch the non-urgent work, spread across models or providers, or self-host.

## 5. Estimate before you build

Spend five minutes on a spreadsheet **before** writing code. Use the calculator: set requests per day, token sizes, cache hit rate and batch share, and compare model tiers.

```viz algo=cost title="Monthly cost calculator" requests=50000
```

A useful discipline is a **cost budget per user action** (for example "a support answer must cost under 2 cents"), enforced in tests and monitored in production.

## 6. Counting tokens exactly

Estimates (¼ word per token...) are fine for planning. For limits and billing, ask the provider.

```python local title="Exact token counts before sending (Claude)"
count = client.messages.count_tokens(
    model="claude-sonnet-5-5",
    system="You are a helpful assistant.",
    messages=[{"role": "user", "content": "Summarise the attached report."}],
)
print(count.input_tokens)
```

And always log the `usage` object from real responses: input, output, cache read, cache write. Dashboards built from these numbers catch regressions (a prompt change that doubles input size) within a day.

```quiz
? Which usually costs more per token?
- Input tokens
+ Output tokens
- They cost the same
> Output tokens are typically several times pricier and are generated one by one.

? A request sends 4,000 input tokens and gets 500 output tokens. At $2 / $10 per MTok, what does it cost?
- $0.0008
+ $0.013
- $0.13
> 4,000×$2/1M = $0.008 plus 500×$10/1M = $0.005, total $0.013.

? What most directly reduces time-to-first-token?
- Asking for a longer answer
+ A shorter prompt and a smaller model (plus streaming for perceived speed)
- Higher temperature
> TTFT is mostly prefill of the input; streaming improves what users perceive.

? Which hidden cost do teams forget?
- The word count of the question
+ System prompt, tool definitions, history, retrieved documents and reasoning tokens
- Internet bandwidth
> The user's question is often the smallest part of the request.
```

:::problem Estimate the monthly cost of a RAG chatbot for 20,000 daily users, 3 questions each, and name the three biggest levers. {level=medium tags="cost,estimation"}
Assume 3,500 input tokens and 300 output tokens per question, Sonnet-class pricing ($2 / $10 per MTok).

:::solution Model answer
Requests per month ≈ 20,000 × 3 × 30 = **1.8 M**. Per request: 3,500×$2/1M = $0.007 plus 300×$10/1M = $0.003 = **$0.010**. Monthly ≈ **$18,000**. Levers: (1) **prompt caching** the static system prompt and instructions (say 1,500 of the 3,500 tokens at 10% price) cuts input cost by ~38%; (2) **route** easy questions to a Haiku-class model (up to 20× cheaper per token); (3) **retrieve less**: rerank and send 3 chunks instead of 8; also cache frequent answers and cap output length. Always check quality with evals after each change.
:::
:::

:::keypoints
- Cost = input tokens × input price + output tokens × output price; output is several times pricier; cached input is far cheaper.
- Most tokens are hidden: system prompt, tools, history, retrieved context, reasoning.
- The context window is a budget shared by input and output; bigger is not automatically better.
- Latency ≈ time-to-first-token (input size, model size) + output tokens ÷ tokens-per-second; stream and shorten outputs.
- Rate limits are per minute in requests and tokens; plan capacity, cache, batch and queue.
- Log `usage` on every call and set a cost budget per user action.
:::

:::resources
- [Claude docs: Prompt caching](https://docs.claude.com/en/docs/build-with-claude/prompt-caching) — pricing multipliers and rules.
- [OpenAI: Latency optimization](https://platform.openai.com/docs/guides/latency-optimization) — seven principles that apply to any provider.
- [Artificial Analysis](https://artificialanalysis.ai) — compare price, speed and quality across providers.
- [Ray: LLM numbers every developer should know](https://github.com/ray-project/llm-numbers) — useful constants for napkin math.
- [Chip Huyen: Building a GenAI platform](https://huyenchip.com/2024/07/25/genai-platform.html) — where cost and latency sit in a full system.
- [Kipply: Transformer inference arithmetic](https://kipp.ly/transformer-inference-arithmetic/) — why decoding speed is what it is (advanced).
:::
