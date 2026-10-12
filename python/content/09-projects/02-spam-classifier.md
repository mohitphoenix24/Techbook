---
title: Spam Detector — Classic ML vs LLM
level: intermediate
time: 50
icon: mail
cover: #f43f5e,#f59e0b
tags: scikit-learn, nlp, classification, tf-idf
summary: Build a production-style SMS spam filter with TF-IDF and scikit-learn — evaluation, threshold tuning, explanations and a save/load predictor — then compare it with an LLM zero-shot classifier.
---

Spam filtering is the classic text-classification problem, and it teaches lessons every AI engineer needs: building a dataset, choosing features, measuring **precision vs recall**, tuning thresholds for the real cost of mistakes, and deciding when a cheap classic model beats an expensive LLM.

**What you'll build:** a scikit-learn pipeline that flags spam messages, explains its decisions, and is ready to save and serve.

:::flow The pipeline
Messages | labelled spam / ham
Vectorize | TF-IDF words + characters
Train | Naive Bayes / Logistic Regression
Evaluate | precision, recall, confusion
Tune threshold | for the cost of mistakes
Serve | predict() with explanations
:::

## Step 1 — The dataset

:::def Ham
The opposite of spam: a normal, wanted message.
:::

```python run shared title="Step 1 · build the dataset"
import random
import pandas as pd

spam = [
    "WINNER!! You have won a £1000 cash prize. Call 09061701461 to claim now",
    "Congratulations! You've been selected for a FREE iPhone. Click http://bit.ly/fr33 now",
    "URGENT: your account has been suspended. Verify at http://secure-login-update.com",
    "Get cheap loans approved in 5 minutes!!! No credit check. Reply YES",
    "You have 1 new voicemail. Call 0800-555-0199 to listen. Charges apply",
    "Claim your £500 Amazon gift card today only. Text GIFT to 80082",
    "Hot singles in your area want to meet you tonight! Click here",
    "Your parcel is on hold. Pay £1.99 customs fee: http://parcel-redelivery.info",
    "Exclusive offer: 90% OFF designer watches. Limited stock! Order now",
    "You are pre-approved for a credit card with £5000 limit. Apply now FREE",
    "FREE entry into our £250 weekly competition. Text WIN to 87121",
    "Earn £3000 per week working from home!!! No experience needed",
    "Your bank card has been blocked. Call immediately 0844 555 0123",
    "Congratulations you won a holiday to Ibiza! Call now to claim your prize",
    "Final notice: unpaid tax refund of £350. Claim at http://hmrc-refund-claim.co",
    "Lose 10kg in 2 weeks with this one weird trick. Buy now!",
    "Your mobile number won the £2,000,000 lottery! Send your bank details",
    "Act now! Limited time offer on cheap meds. Visit www.cheap-pharma-deals.net",
    "Your Netflix subscription failed. Update payment: http://netf1ix-billing.com",
    "Txt STOP to opt out. Win a brand new car! Enter now by texting CAR to 85555",
    "Crypto investment guaranteed 300% returns!!! Join our VIP group now",
    "Dear customer, your PayPal account is limited. Login at http://paypa1-secure.com",
    "SIX chances to win CASH! From £100 to £20,000 pounds txt CSH11 to 87575",
    "You have been chosen for a free cruise! Press 1 to claim your tickets",
    "Ringtone club: get the UK singles chart on your mobile each week. Txt now",
    "URGENT! We are trying to contact you. Last weekend's draw shows you won £900",
    "Get a FREE camera phone when you upgrade. Call our mobile update team free",
    "PRIVATE! Your 2026 account statement shows 800 un-redeemed bonus points. Call now",
    "Double your money in 24 hours guaranteed. Reply INVEST",
    "Your iCloud storage is full. Claim 1TB free at http://icloud-free-space.co",
]
ham = [
    "Hey, are we still meeting for lunch at 1?",
    "Can you send me the slides from today's meeting?",
    "I'll be home late tonight, don't wait for dinner",
    "Happy birthday! Hope you have an amazing day 🎉",
    "Did you finish the assignment for tomorrow?",
    "The train is delayed by 20 minutes, sorry!",
    "Mum says call her when you get a chance",
    "Thanks for your help with the move yesterday",
    "Ok see you at the gym at 6",
    "Can you pick up milk on your way back?",
    "Great job on the presentation today!",
    "Let's watch the match at my place on Saturday",
    "Your appointment with Dr. Rao is confirmed for Monday 10am",
    "I've pushed the fix to the repo, can you review the PR?",
    "What time does the cinema open?",
    "Running 5 minutes late, grab a table please",
    "Do you want pizza or curry tonight?",
    "The meeting moved to 3pm in room 204",
    "Your order from the bookshop has been dispatched and arrives Thursday",
    "Don't forget we have the dentist on Friday",
    "Lovely to see you today, let's do it again soon",
    "I won the office quiz today haha, free coffee for a week",
    "Call me when you're free, it's about the trip",
    "Can you share the wifi password again?",
    "The kids loved the park, thanks for the recommendation",
    "Reminder: team standup moved to 9:30 tomorrow",
    "Got the tickets! We're in row F",
    "Is the offer on the flat still available? Would like to view it",
    "Please call the bank about the mortgage paperwork when you can",
    "Free tonight? Fancy a walk by the river?",
    "Your verification code for Login is 482913. Do not share it",
    "Thanks for the birthday cash, I'll treat myself to a book",
]
df = pd.DataFrame({"text": spam + ham, "label": ["spam"] * len(spam) + ["ham"] * len(ham)})
df = df.sample(frac=1, random_state=0).reset_index(drop=True)
print(df["label"].value_counts())
print(df.head())
```

:::tip Real datasets
This small hand-made set keeps the page fast. For real work use a public corpus like the **UCI SMS Spam Collection** (~5,500 messages) or your own labelled data — the code below doesn't change. Note the tricky **ham** examples on purpose: "won the office quiz", "free tonight?", a real verification code.
:::

## Step 2 — Split and vectorize

```python run shared title="Step 2 · split + TF-IDF features"
from sklearn.model_selection import train_test_split
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.pipeline import FeatureUnion

X_train, X_test, y_train, y_test = train_test_split(
    df["text"], df["label"] == "spam", test_size=0.3, random_state=42, stratify=df["label"]
)

features = FeatureUnion([
    ("words", TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1)),
    ("chars", TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), sublinear_tf=True)),   # robust to "fr33", "paypa1"
])
Xtr = features.fit_transform(X_train)
print("train:", Xtr.shape[0], "messages,", Xtr.shape[1], "features | test:", len(X_test), "messages")
```

:::def Character n-grams
Overlapping chunks of 3–5 characters ("fre", "ree", "ree ", …). They catch misspellings and obfuscations spammers use ("fr33", "paypa1") that whole-word features miss.
:::

## Step 3 — Train and compare models

```python run shared title="Step 3 · train two models"
from sklearn.pipeline import make_pipeline
from sklearn.naive_bayes import ComplementNB
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import classification_report
from sklearn.base import clone

models = {
    "naive_bayes": make_pipeline(clone(features), ComplementNB()),
    "logreg": make_pipeline(clone(features), LogisticRegression(C=10, max_iter=2000, class_weight="balanced")),
}
for name, model in models.items():
    model.fit(X_train, y_train)
    print(f"===== {name} =====")
    print(classification_report(y_test, model.predict(X_test), target_names=["ham", "spam"], digits=3))
```

:::def Naive Bayes
A fast probabilistic classifier that multiplies how likely each word is in spam vs ham, assuming words are independent ("naive"). Surprisingly strong for text, and a classic spam filter.
:::

## Step 4 — Look at the mistakes

```python run shared title="Step 4 · confusion matrix + errors"
from sklearn.metrics import confusion_matrix

model = models["logreg"]
pred = model.predict(X_test)
print("confusion matrix [rows: true ham/spam, cols: predicted ham/spam]")
print(confusion_matrix(y_test, pred))

errors = pd.DataFrame({"text": X_test, "true_spam": y_test, "pred_spam": pred})
errors = errors[errors.true_spam != errors.pred_spam]
print(f"\n{len(errors)} mistakes:" if len(errors) else "\nno mistakes on this split")
for _, r in errors.iterrows():
    kind = "FALSE POSITIVE (ham flagged)" if r.pred_spam else "FALSE NEGATIVE (spam missed)"
    print(f"  {kind}: {r.text}")
```

## Step 5 — Tune the threshold for the real cost

For a spam filter, a **false positive** (a real message hidden in spam) is worse than a missed spam. So we want **high precision** — even at some cost to recall.

```python run shared title="Step 5 · choose a threshold"
import numpy as np
from sklearn.metrics import precision_score, recall_score
from sklearn.model_selection import cross_val_predict

# get honest probabilities for EVERY training message via cross-validation
proba_cv = cross_val_predict(clone(models["logreg"]), X_train, y_train, cv=4, method="predict_proba")[:, 1]
print("threshold  precision  recall")
for t in [0.3, 0.4, 0.5, 0.6, 0.7, 0.8]:
    p = (proba_cv >= t)
    print(f"   {t:.1f}       {precision_score(y_train, p, zero_division=0):.3f}     {recall_score(y_train, p):.3f}")

candidates = [t for t in np.arange(0.3, 0.95, 0.05) if precision_score(y_train, proba_cv >= t, zero_division=0) >= 0.99]
THRESHOLD = float(round(candidates[0], 2)) if candidates else 0.5
print("\nchosen threshold:", THRESHOLD)
```

## Step 6 — Explain the model

```python run shared title="Step 6 · what makes a message spammy?"
word_model = make_pipeline(TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True),
                           LogisticRegression(C=10, max_iter=2000, class_weight="balanced")).fit(X_train, y_train)
vec, clf = word_model.named_steps["tfidfvectorizer"], word_model.named_steps["logisticregression"]
terms = np.array(vec.get_feature_names_out())
order = np.argsort(clf.coef_[0])
print("most SPAM-like terms:", ", ".join(terms[order[-15:]][::-1]))
print("most HAM-like terms: ", ", ".join(terms[order[:15]]))

def explain(text, k=5):
    x = vec.transform([text])
    contrib = x.toarray()[0] * clf.coef_[0]
    top = np.argsort(-np.abs(contrib))[:k]
    return [(terms[i], round(float(contrib[i]), 2)) for i in top if contrib[i] != 0]

print("\nwhy is this spam?", explain("Claim your FREE prize now, call 0800 123"))
```

## Step 7 — A reusable predictor

```python run shared title="Step 7 · package it"
import joblib

final_model = make_pipeline(clone(features), LogisticRegression(C=10, max_iter=2000, class_weight="balanced"))
final_model.fit(df["text"], df["label"] == "spam")            # retrain on ALL data before shipping
joblib.dump({"model": final_model, "threshold": THRESHOLD}, "spam_model.joblib")

class SpamFilter:
    def __init__(self, path="spam_model.joblib"):
        bundle = joblib.load(path)
        self.model, self.threshold = bundle["model"], bundle["threshold"]

    def predict(self, texts):
        probs = self.model.predict_proba(list(texts))[:, 1]
        return [{"text": t, "spam_probability": round(float(p), 3), "is_spam": bool(p >= self.threshold)}
                for t, p in zip(texts, probs)]

sf = SpamFilter()
for r in sf.predict(["Are you coming to the party tonight?",
                     "WIN a FREE trip to Paris!!! Text PARIS to 80808 now",
                     "Your Amazon order has shipped",
                     "Your account is locked, verify at http://amaz0n-secure.co"]):
    print(f"{'🚫 SPAM' if r['is_spam'] else '✅ ham '}  p={r['spam_probability']:.2f}  {r['text']}")
```

## Step 8 — The LLM alternative (run locally)

An LLM can classify spam **zero-shot** — no training data at all:

```python local title="Zero-shot spam detection with Claude"
from typing import Literal
from pydantic import BaseModel, Field
import anthropic

class SpamVerdict(BaseModel):
    label: Literal["spam", "ham"]
    confidence: float = Field(ge=0, le=1)
    reason: str = Field(description="One short sentence")

client = anthropic.Anthropic()

def llm_classify(message: str) -> SpamVerdict:
    response = client.messages.parse(
        model="claude-haiku-4-5",            # a small, fast model is plenty for this task
        max_tokens=256,
        system="You classify SMS messages as spam (unsolicited, scam, phishing, marketing) or ham (normal personal/service messages).",
        messages=[{"role": "user", "content": f"<sms>{message}</sms>"}],
        output_format=SpamVerdict,
    )
    return response.parsed_output

print(llm_classify("Your verification code for Login is 482913. Do not share it"))
```

| | TF-IDF + Logistic Regression | LLM zero-shot |
|---|---|---|
| labelled data needed | yes (hundreds+) | none |
| cost per message | ~free | tokens per message |
| latency | < 1 ms | hundreds of ms |
| new spam styles | needs retraining | often handles them |
| explanations | feature weights | natural-language reasons |

:::tip Best of both
A common production design: the cheap classifier handles the clear cases (very high or very low probability) and only the **uncertain middle** goes to an LLM — or the LLM labels data to train the cheap model (distillation).
:::

:::exercise Extensions
1. Route only messages with spam probability between 0.3 and 0.7 to a (fake) `llm_classify` and count how many calls you'd save.
2. Add a feature for "contains a URL" or "contains a phone number" with a custom transformer.
3. Download the UCI SMS Spam Collection and retrain — compare the scores.
:::

:::keypoints
- Text classification = **vectorize** (TF-IDF words + char n-grams) → **classify** (Naive Bayes / Logistic Regression).
- Read the **confusion matrix and the actual mistakes**, not just accuracy.
- Choose the **threshold** from the business cost of errors (spam filters favour precision).
- Explain predictions with feature weights; package model + threshold together.
- LLMs classify zero-shot; classic models are cheaper and faster — combine them.
:::
