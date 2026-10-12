---
title: Movie Recommender with Embeddings
level: intermediate
time: 60
icon: film
cover: #e11d48,#7c3aed
tags: recommender, matrix-factorization, embeddings, numpy
summary: Build a Netflix-style recommender — baselines, matrix factorization trained with SGD, honest train/test evaluation, top-N recommendations, "because you liked…" similar items, and a look at the learned movie embeddings.
---

Recommendation systems decide much of what we watch, buy and read. The classic technique — **matrix factorization** — learns an **embedding** for every user and every item from ratings alone, so that a user's predicted rating for a movie is the dot product of their two vectors. It's the same embedding idea behind semantic search, applied to taste.

:::def Collaborative filtering
Recommending items based on the behaviour of **many users** ("people who liked what you liked also liked…"), without needing to know anything about the items' content.
:::

:::def Matrix factorization
Approximating the big, mostly-empty users × items rating matrix as the product of two thin matrices: user factors **P** (users × k) and item factors **Q** (items × k). Predicted rating = `global_mean + user_bias + item_bias + P[u] · Q[i]`.
:::

:::flow The plan
Ratings | sparse users × movies
Baselines | global mean, biases
Matrix factorization | SGD on observed ratings
Evaluate | RMSE on held-out ratings
Recommend | top-N unseen movies
Explain | similar movies via embeddings
:::

## Step 1 — A ratings dataset

Real datasets (like MovieLens) work the same way. Here we simulate users with hidden genre tastes so we can check the model recovers sensible structure.

```python run shared title="Step 1 · simulate ratings"
import numpy as np
import pandas as pd

rng = np.random.default_rng(7)
GENRES = ["action", "comedy", "romance", "sci-fi", "horror"]
MOVIES = [
    ("Steel Fury", "action"), ("Last Stand", "action"), ("Rapid Strike", "action"), ("Iron Pursuit", "action"),
    ("Laugh Track", "comedy"), ("The Mix-Up", "comedy"), ("Office Chaos", "comedy"), ("Wedding Crashers 3", "comedy"),
    ("Paris Again", "romance"), ("Letters to June", "romance"), ("Summer Hearts", "romance"), ("The Proposal Plan", "romance"),
    ("Orbit", "sci-fi"), ("Neural Dawn", "sci-fi"), ("Mars Colony", "sci-fi"), ("Quantum Shift", "sci-fi"),
    ("The Cellar", "horror"), ("Night Visitor", "horror"), ("Hollow Woods", "horror"), ("Mirror Room", "horror"),
]
n_users, n_items = 300, len(MOVIES)
genre_idx = np.array([GENRES.index(g) for _, g in MOVIES])
taste = rng.normal(0, 1.2, (n_users, len(GENRES)))           # hidden: how much each user likes each genre
quality = rng.normal(0, 0.4, n_items)                          # some movies are just better
true = 3.4 + taste[:, genre_idx] * 0.8 + quality

rows = []
for u in range(n_users):
    seen = rng.choice(n_items, size=rng.integers(8, 13), replace=False)   # each user rates only a few movies
    for i in seen:
        rows.append((u, i, float(np.clip(np.round(true[u, i] + rng.normal(0, 0.5)), 1, 5))))
ratings = pd.DataFrame(rows, columns=["user", "item", "rating"])
print(ratings.shape[0], "ratings |", f"matrix is {ratings.shape[0] / (n_users * n_items):.0%} filled")
print(ratings["rating"].value_counts().sort_index().to_dict())
ratings.head()
```

## Step 2 — Split, and the baselines to beat

```python run shared title="Step 2 · train/test split + baselines"
shuffled = ratings.sample(frac=1, random_state=0)
cut = int(0.8 * len(shuffled))
train, test = shuffled.iloc[:cut], shuffled.iloc[cut:]

def rmse(pred, actual):
    return float(np.sqrt(np.mean((np.asarray(pred) - np.asarray(actual)) ** 2)))

mu = train["rating"].mean()
print(f"baseline 1 — always predict the global mean ({mu:.2f}): RMSE {rmse(np.full(len(test), mu), test.rating):.3f}")

# baseline 2: mean + user bias + item bias (regularized averages)
lam = 5
item_bias = (train.groupby("item")["rating"].sum() - mu * train.groupby("item").size()) / (train.groupby("item").size() + lam)
resid = train["rating"] - mu - train["item"].map(item_bias).fillna(0)
user_bias = resid.groupby(train["user"]).sum() / (train.groupby("user").size() + lam)
pred_b = mu + test["user"].map(user_bias).fillna(0) + test["item"].map(item_bias).fillna(0)
print(f"baseline 2 — mean + user/item biases:          RMSE {rmse(pred_b, test.rating):.3f}")
```

:::def RMSE (root mean squared error)
The typical size of a prediction error, in rating stars. An RMSE of 0.8 means predictions are usually within about one star. Lower is better.
:::

## Step 3 — Matrix factorization with SGD

```python run shared title="Step 3 · train the model"
class MatrixFactorization:
    def __init__(self, n_users, n_items, k=4, lr=0.02, reg=0.1, seed=0):
        r = np.random.default_rng(seed)
        self.P = r.normal(0, 0.1, (n_users, k))      # user embeddings
        self.Q = r.normal(0, 0.1, (n_items, k))      # item embeddings
        self.bu, self.bi = np.zeros(n_users), np.zeros(n_items)
        self.lr, self.reg, self.rng = lr, reg, r

    def predict(self, u, i):
        return self.mu + self.bu[u] + self.bi[i] + np.sum(self.P[u] * self.Q[i], axis=-1)

    def fit(self, train, test=None, epochs=40):
        self.mu = train["rating"].mean()
        U, I, R = train["user"].to_numpy(), train["item"].to_numpy(), train["rating"].to_numpy()
        history = []
        for epoch in range(epochs):
            for idx in self.rng.permutation(len(R)):              # stochastic: one rating at a time
                u, i = U[idx], I[idx]
                err = R[idx] - self.predict(u, i)
                self.bu[u] += self.lr * (err - self.reg * self.bu[u])
                self.bi[i] += self.lr * (err - self.reg * self.bi[i])
                pu = self.P[u].copy()
                self.P[u] += self.lr * (err * self.Q[i] - self.reg * self.P[u])
                self.Q[i] += self.lr * (err * pu - self.reg * self.Q[i])
            tr = rmse(self.predict(U, I), R)
            te = rmse(self.predict(test["user"].to_numpy(), test["item"].to_numpy()), test["rating"]) if test is not None else None
            history.append((tr, te))
        return history

mf = MatrixFactorization(n_users, n_items)
history = mf.fit(train, test)
for e in [0, 9, 19, 39]:
    print(f"epoch {e + 1:2d}: train RMSE {history[e][0]:.3f} | test RMSE {history[e][1]:.3f}")
```

:::formula SGD update for one rating r(u, i)
e = r − r̂(u, i)
b_u += lr·(e − λ·b_u)       b_i += lr·(e − λ·b_i)
P_u += lr·(e·Q_i − λ·P_u)    Q_i += lr·(e·P_u − λ·Q_i)
:::

## Step 4 — Compare and visualise training

```python run shared title="Step 4 · results"
import matplotlib.pyplot as plt

h = np.array(history)
fig, ax = plt.subplots(figsize=(7, 3.6))
ax.plot(h[:, 0], label="train")
ax.plot(h[:, 1], label="test")
ax.axhline(rmse(pred_b, test.rating), color="gray", linestyle="--", label="bias baseline (test)")
ax.set(title="Matrix factorization training", xlabel="epoch", ylabel="RMSE")
ax.legend()
plt.show()
print(f"test RMSE — global mean: {rmse(np.full(len(test), mu), test.rating):.3f} | biases: {rmse(pred_b, test.rating):.3f} | MF: {history[-1][1]:.3f}")
```

## Step 5 — Recommend movies to a user

```python run shared title="Step 5 · top-N recommendations"
def recommend(user, n=5):
    seen = set(ratings.loc[ratings.user == user, "item"])
    scores = mf.predict(np.full(n_items, user), np.arange(n_items))
    ranked = [i for i in np.argsort(-scores) if i not in seen][:n]
    return [(MOVIES[i][0], MOVIES[i][1], round(float(scores[i]), 2)) for i in ranked]

for user in [3, 42]:
    liked = ratings[(ratings.user == user) & (ratings.rating >= 4)]
    print(f"\nUser {user} rated highly: {[MOVIES[i][0] + ' (' + MOVIES[i][1] + ')' for i in liked.item]}")
    print(f"   true favourite genre: {GENRES[int(np.argmax(taste[user]))]}")
    for title, genre, score in recommend(user):
        print(f"   → {title:<20} {genre:<8} predicted {score}")
```

## Step 6 — "Because you liked…": similar movies

The item embeddings `Q` place similar movies near each other — learned purely from who rated what.

```python run shared title="Step 6 · item-to-item similarity"
Qn = mf.Q / np.linalg.norm(mf.Q, axis=1, keepdims=True)
sim = Qn @ Qn.T

def similar(title, n=3):
    i = [m[0] for m in MOVIES].index(title)
    order = [j for j in np.argsort(-sim[i]) if j != i][:n]
    return [(MOVIES[j][0], MOVIES[j][1], round(float(sim[i, j]), 2)) for j in order]

for title in ["Orbit", "Laugh Track", "The Cellar"]:
    print(f"Because you liked {title} ({MOVIES[[m[0] for m in MOVIES].index(title)][1]}):", similar(title))

same_genre = np.mean([MOVIES[j][1] == MOVIES[i][1] for i in range(n_items) for j in np.argsort(-sim[i])[1:4]])
print(f"\n{same_genre:.0%} of top-3 similar movies share the genre — the model was never told genres!")
```

## Step 7 — Look at the learned embedding space

```python run shared title="Step 7 · plot item embeddings"
from sklearn.decomposition import PCA

xy = PCA(n_components=2, random_state=0).fit_transform(mf.Q)
fig, ax = plt.subplots(figsize=(7, 5.5))
for g, color in zip(GENRES, ["#ef4444", "#f59e0b", "#ec4899", "#3b82f6", "#10b981"]):
    pts = xy[genre_idx == GENRES.index(g)]
    ax.scatter(pts[:, 0], pts[:, 1], s=80, color=color, label=g)
for (title, _), (x, y) in zip(MOVIES, xy):
    ax.annotate(title, (x, y), fontsize=7, xytext=(4, 3), textcoords="offset points")
ax.set(title="Movie embeddings learned from ratings (PCA to 2-D)")
ax.legend()
plt.show()
```

## Step 8 — Explain recommendations with an LLM (run locally)

Embeddings are great at *finding* items but bad at *explaining* them. A common pattern: the recommender picks, an LLM writes the friendly explanation.

```python local title="LLM-written explanations"
import anthropic

client = anthropic.Anthropic()

def explain(user):
    liked = [MOVIES[i][0] for i in ratings[(ratings.user == user) & (ratings.rating >= 4)].item]
    recs = [title for title, _, _ in recommend(user, n=3)]
    response = client.messages.create(
        model="claude-haiku-4-5", max_tokens=300,
        messages=[{"role": "user", "content": (
            f"A viewer enjoyed: {', '.join(liked)}. We recommend: {', '.join(recs)}. "
            "Write one short, friendly sentence per recommendation explaining why they might enjoy it. "
            "Don't invent plot details beyond the titles and genres.")}],
    )
    return response.content[0].text

print(explain(42))
```

:::tip Real-world recommenders
Production systems combine **collaborative** signals (this project) with **content** features (genres, text embeddings of descriptions, images) to handle the **cold-start** problem — new users or new items with no ratings yet — and they evaluate with ranking metrics (precision@k, NDCG) plus online A/B tests.
:::

:::exercise Extensions
1. Try `k = 2, 4, 16, 32` factors and plot test RMSE — when does it start to overfit?
2. Implement **precision@5**: for each test user, how many of the top-5 recommendations did they actually rate ≥ 4?
3. Cold start: for a brand-new user who rates just 2 movies, fit only their `P[u]` and `bu[u]` (keep `Q` fixed) and recommend.
4. Use text embeddings of movie descriptions (from Project 4's search engine) as extra item features.
:::

:::keypoints
- **Collaborative filtering** learns from user behaviour; **matrix factorization** gives each user and item an **embedding**.
- Prediction = global mean + user bias + item bias + `P[u] · Q[i]`, trained with **SGD + regularization**.
- Always beat **baselines** (global mean, biases) on a held-out **test** set.
- Item embeddings give "similar items" for free — and cluster by genre without being told.
- Combine with content features and LLM explanations in real products.
:::
