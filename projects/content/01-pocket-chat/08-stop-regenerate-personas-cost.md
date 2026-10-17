---
title: Stop, Regenerate, personas and cost
level: easy
time: 30
summary: The four small features that make a chat feel finished: stopping safely, trying again, steering behaviour with system prompts, and showing what each reply cost.
tags: system prompt, persona, regenerate, cost
---

Streaming and history make a chat work. These four features make it feel *good*. Each one is small in code, but each hides a decision that is worth understanding.

## 1. Stop

You have already met every piece of Stop, spread over three lessons:

:::flow Stop, end to end
Click | the Stop button calls abort() on the AbortController
Drop | the browser closes the connection
Cancel | Starlette cancels the server's generator at its current await
Save | the `finally` block saves the partial text with stopped = true
Show | the UI marks the reply "Stopped. This is a partial answer."
:::

Stopping matters for **money** as well as patience. When the server stops reading, the real provider stream is closed too, so the model stops generating tokens you would otherwise pay for. (With the Anthropic SDK, leaving the `async with ... stream` block closes the connection.)

## 2. Regenerate

"Try again" means: forget the last answer and answer the last question once more. There are three places to get this right.

**In the request.** The body carries `regenerate: true` and no message:

```python src="pocket-chat/backend/app/schemas.py" region="chat-request" title="backend/app/schemas.py"
```

**In the route.** Delete the previous assistant message, then check there is a user message left to answer:

```python src="pocket-chat/backend/app/routes/chat.py" region="endpoint" title="backend/app/routes/chat.py"
```

**In the store.** `delete_last_assistant_message` only deletes if the last message really is an assistant message, so pressing Regenerate twice quickly cannot delete the user's question. When the previous try ended in an *error*, there is no assistant message to delete and the user message is simply answered again.

:::note Different answer every time?
Regenerating gives a different answer only if the model's output varies between calls. Older models exposed `temperature` for this. The Claude 5.5 models do not accept a non-default `temperature`, so variation comes from the model itself. If you need more variety, change the instructions (for example: "give a different angle than before") rather than a sampling knob.
:::

## 3. Personas are system prompts

A **system prompt** tells the model who it is and how to behave, and it comes before the conversation. A persona is nothing more than a named system prompt:

```python src="pocket-chat/backend/app/personas.py" title="backend/app/personas.py"
```

The browser sends only a persona **id** (`"tutor"`), never the prompt text. That is deliberate: a prompt the browser can set is a prompt the user can rewrite. The server looks the id up, and an unknown id falls back to the default instead of erroring.

### Writing a good system prompt

| Do | Example |
|---|---|
| say the **role** in one line | "You are a patient tutor." |
| give **rules**, not wishes | "Do not give the answer straight away. Ask one question." |
| set the **format** | "Answer in at most three sentences." |
| say what to do when unsure | "If you are not sure, say so." |
| keep it **short and stable** | long, unchanging prefixes can be cached to save money |

Avoid shouting (ALL CAPS and "NEVER EVER"): current models follow clear, calm instructions well, and exaggerated emphasis tends to over-trigger. Test a persona with 5 to 10 real questions before you trust it; Project 5 turns that habit into an automatic eval.

:::tip Persona per conversation
The conversation row stores its `persona`, and opening an old chat restores it in the picker. If you let users change persona mid-chat, remember that earlier assistant messages were written in the old voice; the model will see them and may imitate them.
:::

## 4. Tokens and cost, per reply

Every `StreamDone` carries `usage`. The route multiplies it by the model's price and sends the result in the `usage` event, and the store keeps it on the message. The multiplication lives in a single, tiny, pure function. Run it:

```python run src="pocket-chat/backend/app/pricing.py" region="cost" title="backend/app/pricing.py: cost_usd" level=easy
PRICES = {
    "claude-opus-5-5": (4.00, 20.00),
    "claude-sonnet-5-5": (2.00, 10.00),
    "claude-haiku-5-5": (0.10, 0.50),
}
DEFAULT_PRICE = PRICES["claude-sonnet-5-5"]

# A conversation where each turn resends all earlier text: input grows, output stays small.
total = 0.0
for turn, (tokens_in, tokens_out) in enumerate([(300, 120), (520, 150), (790, 130), (1050, 200)], start=1):
    c = cost_usd("claude-sonnet-5-5", tokens_in, tokens_out)
    total += c
    print(f"turn {turn}: {tokens_in:>5} in, {tokens_out:>4} out -> ${c:.5f}")
print(f"conversation total: ${total:.5f}")
print("same conversation on Haiku 5.5:", f"${sum(cost_usd('claude-haiku-5-5', i, o) for i, o in [(300,120),(520,150),(790,130),(1050,200)]):.5f}")
```

Two honest caveats:

- Prices change. Keep them in one table (`PRICES`), check the provider's pricing page, and update it. Better still, make them configurable.
- The **mock** model has no real price. We value its (estimated) tokens at Sonnet prices so the interface shows something realistic; the badge in the footer says *Offline demo mode*.

The UI formats small amounts sensibly. A tenth of a cent should not show as `$0.00`:

```tsx src="pocket-chat/frontend/src/components/MessageBubble.tsx" region="format-cost" title="frontend/src/components/MessageBubble.tsx"
```

![A stopped reply with its partial text, the Regenerate action and usage under each answer](assets/img/pocket-chat-stopped.png)

:::keypoints
- Stop is `abort()` on the client; the server cancels the generator and saves the partial reply. It also stops you paying for tokens nobody will read.
- Regenerate sends `regenerate: true`, deletes only a trailing assistant message, and re-answers the last user message.
- A persona is a named system prompt; the browser sends an id, the server owns the text.
- Good system prompts: a one-line role, concrete rules, a format, and what to do when unsure.
- Cost = tokens × price, in one pure function; format tiny amounts so they do not round to zero.
:::

```quiz
? Why does the request contain a persona id and not the system prompt text?
- IDs are shorter to send
+ A prompt the browser controls is a prompt the user can rewrite; the server should own it
- The API does not accept long prompts
> Keeping the instructions on the server means users cannot override your rules by editing a request.
? When the previous attempt ended with an error, what does Regenerate do?
- It deletes the user's question
+ There is no assistant message to delete, so it simply answers the last user message again
- It fails with a 500
> delete_last_assistant_message only deletes when the last message is an assistant message.
? Why does stopping a reply save you money with a real model?
- Stopped replies are free
+ Closing the stream stops the provider from generating tokens that nobody will read
- It cancels the whole conversation
> You pay for output tokens as they are generated; ending the request early stops the meter.
```

:::exercise A fifth persona
Add a persona called `translator` that answers in Hindi and then repeats the answer in English, in two short paragraphs. Add it to `PERSONAS` only. Without editing any other backend file, confirm that it appears in the picker (`GET /api/personas`) and that `tests/test_conversations.py` still passes. Then write a test that checks the mock still streams with this persona.
:::
