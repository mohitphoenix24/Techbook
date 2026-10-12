---
title: Review Sentiment & Aspect Dashboard
level: intermediate
time: 60
icon: chart
cover: #22c55e,#0ea5e9
tags: nlp, sentiment, pandas, matplotlib, monitoring
summary: Turn thousands of product reviews into insight — train a sentiment classifier, extract what customers talk about (battery, camera, price…), track sentiment over time, detect a sudden problem, and build a one-page dashboard.
---

A product team gets thousands of reviews a week. Nobody can read them all — but they need to know: *Are customers happy? What exactly do they complain about? Did something break last week?* In this project you'll build the analytics pipeline that answers those questions, ending in a dashboard and an automatic alert.

:::def Sentiment analysis
Classifying text by the opinion it expresses — positive, negative (or neutral) — often with a score.
:::

:::def Aspect-based sentiment
Going one level deeper: finding **what** a review talks about (battery, camera, price, delivery…) and the sentiment **about each aspect**. "Great camera but the battery dies by noon" is positive on camera, negative on battery.
:::

:::flow Pipeline
Reviews | text, date, stars
Sentiment model | TF-IDF + Logistic Regression
Aspects | which topics each review mentions
Trends | weekly sentiment per aspect
Alerts | detect sudden drops
Dashboard | one-page summary
:::

## Step 1 — The reviews

We simulate 12 weeks of phone reviews — including a **hidden incident**: a software update in week 8 that hurts battery life. Let's see if our pipeline finds it.

```python run shared title="Step 1 · generate reviews"
import numpy as np
import pandas as pd

rng = np.random.default_rng(0)
PHRASES = {
    "battery": (["battery lasts all day", "battery life is excellent", "charges really fast"],
                ["battery drains too fast", "battery dies by noon", "battery life got worse after the update"]),
    "camera": (["the camera is stunning", "photos look sharp", "night mode is amazing"],
               ["camera photos are blurry", "the camera app keeps crashing", "low light pictures are noisy"]),
    "screen": (["the screen is bright and smooth", "display colours are gorgeous", "screen looks great outdoors"],
               ["the screen scratches easily", "display has a weird tint", "screen is hard to read in sunlight"]),
    "price": (["great value for money", "worth every penny", "price is fair for what you get"],
              ["way too expensive", "overpriced for the features", "not worth the price"]),
    "delivery": (["delivery was quick", "arrived a day early", "well packaged and fast shipping"],
                 ["delivery took two weeks", "box arrived damaged", "courier lost my package"]),
}
OPENERS = ["Honestly,", "Overall", "After a month,", "", "I think", "Wow,"]

rows = []
start = pd.Timestamp("2026-07-06")
for week in range(12):
    for _ in range(rng.integers(55, 75)):
        aspects = rng.choice(list(PHRASES), size=rng.integers(1, 3), replace=False)
        parts, score = [], 0
        for a in aspects:
            p_pos = 0.72
            if a == "battery" and week >= 8:
                p_pos = 0.25                                   # 🔥 the hidden incident
            positive = rng.random() < p_pos
            parts.append(rng.choice(PHRASES[a][0] if positive else PHRASES[a][1]))
            score += 1 if positive else -1
        text = f"{rng.choice(OPENERS)} {' and '.join(parts)}.".strip().capitalize()
        stars = int(np.clip(3 + score + rng.integers(-1, 2), 1, 5))
        rows.append({"date": start + pd.Timedelta(days=int(week * 7 + rng.integers(0, 7))), "text": text, "stars": stars})

reviews = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)
print(len(reviews), "reviews from", reviews.date.min().date(), "to", reviews.date.max().date())
reviews.sample(5, random_state=1)
```

## Step 2 — Train a sentiment classifier

Star ratings give us free labels: 4–5 stars → positive, 1–2 → negative (3 stars is ambiguous, so we leave it out of training).

```python run shared title="Step 2 · sentiment model"
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.metrics import classification_report

labelled = reviews[reviews.stars != 3].copy()
labelled["positive"] = (labelled.stars >= 4).astype(int)
X_tr, X_te, y_tr, y_te = train_test_split(labelled.text, labelled.positive, test_size=0.25, random_state=0, stratify=labelled.positive)

sentiment_model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True), LogisticRegression(max_iter=2000, C=5))
sentiment_model.fit(X_tr, y_tr)
print(classification_report(y_te, sentiment_model.predict(X_te), target_names=["negative", "positive"], digits=3))

reviews["p_positive"] = sentiment_model.predict_proba(reviews.text)[:, 1]
reviews["sentiment"] = np.where(reviews.p_positive >= 0.5, "positive", "negative")
```

:::tip Weak supervision
Using star ratings as labels is **weak supervision**: cheap, noisy labels that are good enough to train a useful model. The same trick works with thumbs up/down, refunds, or support-ticket outcomes.
:::

## Step 3 — Find the aspects

```python run shared title="Step 3 · aspect extraction"
import re

ASPECT_KEYWORDS = {
    "battery": ["battery", "charge", "charges", "drains"],
    "camera": ["camera", "photo", "photos", "pictures", "night mode"],
    "screen": ["screen", "display"],
    "price": ["price", "expensive", "value", "overpriced", "worth"],
    "delivery": ["delivery", "arrived", "shipping", "courier", "package", "packaged"],
}

def aspect_sentiments(text):
    """Split the review into clauses, tag each clause with its aspect, and score each clause separately."""
    out = {}
    for clause in re.split(r"\band\b|,|\bbut\b", text.lower()):
        for aspect, words in ASPECT_KEYWORDS.items():
            if any(w in clause for w in words):
                out[aspect] = float(sentiment_model.predict_proba([clause])[0, 1])
    return out

print(aspect_sentiments("Great camera but the battery dies by noon"))

records = [{"date": d, "aspect": a, "p_positive": p}
           for d, t in zip(reviews.date, reviews.text) for a, p in aspect_sentiments(t).items()]
aspects = pd.DataFrame(records)
aspects["week"] = aspects.date.dt.to_period("W").dt.start_time
print(aspects.groupby("aspect").p_positive.agg(["count", "mean"]).round(2).sort_values("mean"))
```

## Step 4 — Trends and automatic alerts

```python run shared title="Step 4 · weekly trends + anomaly alert"
weekly = aspects.pivot_table(index="week", columns="aspect", values="p_positive", aggfunc="mean")
print(weekly.round(2).tail(6))

alerts = []
for aspect in weekly.columns:
    series = weekly[aspect]
    baseline = series.rolling(4, min_periods=3).mean().shift(1)       # average of the previous 4 weeks
    drop = baseline - series
    for week, d in drop.items():
        if d > 0.2:
            alerts.append((week.date(), aspect, round(float(series[week]), 2), round(float(baseline[week]), 2)))

print("\n🚨 ALERTS")
for week, aspect, now, before in alerts[:5]:
    print(f"  week of {week}: '{aspect}' sentiment fell to {now:.0%} (previous 4-week average {before:.0%})")
```

The battery alerts start exactly in the week of the hidden update. You may also see one or two smaller alerts for other aspects: with only ~50 mentions per aspect per week, random noise alone can move the share by 20 points. Real systems tune the threshold (or use a statistical test) to balance missed incidents against false alarms — the same precision/recall trade-off as any classifier.

## Step 5 — Evidence: show me the reviews

Numbers raise questions; example reviews answer them.

```python run shared title="Step 5 · drill down"
first_alert_week = pd.Timestamp(alerts[0][0]) if alerts else weekly.index[-1]
recent_battery = reviews[(reviews.date >= first_alert_week) & reviews.text.str.contains("battery", case=False)]
negative = recent_battery.sort_values("p_positive").head(6)
print(f"Most negative battery reviews since {first_alert_week.date()}:")
for _, r in negative.iterrows():
    print(f"  {r.date.date()}  ★{r.stars}  {r.text}")

from collections import Counter
words = Counter(w for t in negative.text for w in re.findall(r"[a-z]+", t.lower()) if len(w) > 3)
print("\nrecurring words:", [w for w, _ in words.most_common(8)])
```

## Step 6 — The dashboard

```python run shared title="Step 6 · one-page dashboard"
import matplotlib.pyplot as plt

fig = plt.figure(figsize=(12, 7.5))
grid = fig.add_gridspec(2, 3, hspace=0.45, wspace=0.3)

ax1 = fig.add_subplot(grid[0, 0])
counts = reviews.sentiment.value_counts()
ax1.pie(counts, labels=counts.index, autopct="%1.0f%%", colors=["#22c55e", "#ef4444"], startangle=90)
ax1.set_title("Overall sentiment")

ax2 = fig.add_subplot(grid[0, 1:])
for aspect in weekly.columns:
    ax2.plot(weekly.index, weekly[aspect], marker="o", markersize=3, linewidth=2.5 if aspect == "battery" else 1.2, label=aspect)
for week, aspect, *_ in alerts[:1]:
    ax2.axvline(pd.Timestamp(week), color="red", linestyle="--", alpha=0.6)
    ax2.annotate("battery alert", (pd.Timestamp(week), 0.15), color="red", fontsize=9)
ax2.set(title="Weekly positive share by aspect", ylim=(0, 1))
ax2.legend(fontsize=7, ncols=5, loc="lower left")
ax2.tick_params(axis="x", labelsize=7, rotation=20)

ax3 = fig.add_subplot(grid[1, 0:2])
summary = aspects.groupby("aspect").p_positive.agg(["mean", "count"]).sort_values("mean")
bars = ax3.barh(summary.index, summary["mean"], color=["#ef4444" if m < 0.5 else "#22c55e" for m in summary["mean"]])
ax3.bar_label(bars, labels=[f"{m:.0%} positive · {c} mentions" for m, c in zip(summary["mean"], summary["count"])], padding=4, fontsize=8)
ax3.set(xlim=(0, 1.25), title="Sentiment by aspect (all weeks)")

ax4 = fig.add_subplot(grid[1, 2])
weekly_n = reviews.set_index("date").resample("W").size()
ax4.bar(weekly_n.index, weekly_n.values, width=5, color="#94a3b8")
ax4.set_title("Reviews per week")
ax4.tick_params(axis="x", labelsize=6, rotation=45)

fig.suptitle("Phone reviews — customer sentiment dashboard", fontsize=14, fontweight="bold")
plt.show()
```

## Step 7 — LLM-powered aspect analysis (run locally)

Keyword lists miss phrasings like "it barely survives my commute". An LLM with **structured outputs** extracts aspects and sentiment from any wording — and can summarise the week's complaints for the team.

```python local title="Aspect extraction with Claude + Pydantic"
from typing import Literal
from pydantic import BaseModel, Field
import anthropic

class AspectOpinion(BaseModel):
    aspect: Literal["battery", "camera", "screen", "price", "delivery", "software", "other"]
    sentiment: Literal["positive", "negative", "neutral"]
    evidence: str = Field(description="The exact words from the review that show this opinion")

class ReviewAnalysis(BaseModel):
    opinions: list[AspectOpinion]

client = anthropic.Anthropic()

def analyse(review: str) -> ReviewAnalysis:
    response = client.messages.parse(
        model="claude-haiku-4-5",
        max_tokens=1024,
        messages=[{"role": "user", "content": f"Extract every product aspect opinion from this review.\n<review>{review}</review>"}],
        output_format=ReviewAnalysis,
    )
    return response.parsed_output

print(analyse("Gorgeous display, but since the update it barely survives my commute and the price stings."))

def weekly_summary(texts: list[str]) -> str:
    joined = "\n".join(f"- {t}" for t in texts[:200])
    r = client.messages.create(
        model="claude-opus-5-5", max_tokens=1024,
        messages=[{"role": "user", "content": f"These are this week's negative reviews:\n{joined}\n\n"
                   "Summarise the top 3 issues for the product team, with approximate counts and one quote each."}],
    )
    return r.content[0].text
```

:::tip Cost-aware design
Run the cheap classifier on **every** review in real time; send only **negative or uncertain** reviews (or a weekly sample) to an LLM for detailed aspect extraction and summaries. Use the **Batch API** for big nightly jobs at half price.
:::

:::exercise Extensions
1. Add a **neutral** class using 3-star reviews and retrain as a 3-class model.
2. Replace the 0.2 threshold with a statistical rule (e.g. more than 2 standard deviations below the 4-week mean).
3. Track sentiment **per product version** instead of per week.
4. Export the weekly table to CSV and the dashboard to `dashboard.png` with `fig.savefig`.
:::

:::keypoints
- Star ratings provide **weak labels** to train a fast sentiment classifier.
- **Aspect-based** analysis splits reviews into clauses and scores each topic separately.
- Weekly aggregation + a rolling baseline turns sentiment into **alerts** for real problems.
- Always pair numbers with **example reviews** as evidence.
- LLMs + structured outputs handle open-ended phrasing and summaries; use them selectively for cost.
:::
