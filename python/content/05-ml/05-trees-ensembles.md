---
title: Decision Trees & Ensembles
level: intermediate
time: 30
summary: Trees ask yes/no questions; forests and gradient boosting combine hundreds of them. These are still the best models for tabular data — learn how they work, how to tune them and how to explain them.
---

For **tables** of numbers and categories — churn, fraud, pricing, risk — tree-based models usually beat neural networks, train in seconds, and need little preprocessing. Every ML engineer should know them well.

## Decision trees

:::def Decision tree
A model that makes predictions by asking a sequence of **yes/no questions** about the features ("is income > 50k?"), following the branches until it reaches a **leaf** that gives the answer.
:::

:::analogy
A decision tree is a game of **20 Questions**. A good player asks the question that splits the possibilities most evenly first. The tree-building algorithm does exactly that: at each step it picks the question that best separates the classes.
:::

```python run level=easy
from sklearn.datasets import load_iris
from sklearn.tree import DecisionTreeClassifier, export_text

iris = load_iris()
tree = DecisionTreeClassifier(max_depth=2, random_state=0).fit(iris.data, iris.target)
print(export_text(tree, feature_names=list(iris.feature_names)))
print("predicted species for a flower with petal length 5.0, width 1.8:",
      iris.target_names[tree.predict([[6.0, 3.0, 5.0, 1.8]])[0]])
```

You can **read** this model — that is a big advantage of trees.

### How a split is chosen: impurity

:::def Gini impurity
A measure of how **mixed** a group is: 0 when all examples have the same class, higher when classes are mixed. The tree chooses the split that reduces impurity the most.
:::

```python run level=intermediate
import numpy as np

def gini(labels):
    _, counts = np.unique(labels, return_counts=True)
    p = counts / counts.sum()
    return 1 - np.sum(p ** 2)

print("pure group    ", gini([1, 1, 1, 1]))
print("50/50 group   ", gini([0, 0, 1, 1]))
print("mostly one    ", round(gini([0, 1, 1, 1]), 3))

# Try every threshold on one feature and keep the best split
x = np.array([1, 2, 3, 4, 5, 6, 7, 8])
y = np.array([0, 0, 0, 1, 0, 1, 1, 1])
best = None
for t in x[:-1] + 0.5:
    left, right = y[x < t], y[x >= t]
    weighted = (len(left) * gini(left) + len(right) * gini(right)) / len(y)
    if best is None or weighted < best[1]:
        best = (t, weighted)
    print(f"split x < {t}: impurity {weighted:.3f}")
print("best threshold:", best[0])
```

### Trees overfit easily

```python run level=intermediate
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.tree import DecisionTreeClassifier

X, y = load_breast_cancer(return_X_y=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, random_state=0, stratify=y)

print("max_depth  train   test   leaves")
for depth in [1, 2, 3, 5, 8, None]:
    t = DecisionTreeClassifier(max_depth=depth, random_state=0).fit(X_tr, y_tr)
    print(f"{str(depth):>9}  {t.score(X_tr, y_tr):.3f}  {t.score(X_te, y_te):.3f}   {t.get_n_leaves()}")
```

An unlimited tree gets **100% on training data** by memorising it. Limit it with `max_depth`, `min_samples_leaf` or `max_leaf_nodes`.

## Ensembles: many trees are better than one

:::def Ensemble
A model made of many models whose predictions are **combined** (averaged or voted). Errors of individual models cancel out, so the ensemble is more accurate and more stable.
:::

:::analogy
Ask one person to guess the number of sweets in a jar and they might be way off. Average the guesses of 500 people and you get remarkably close. That's the "wisdom of crowds" — the idea behind ensembles.
:::

### Random forest (bagging)

:::def Random forest
An ensemble of decision trees, each trained on a **random sample** of the rows and considering a **random subset** of features at each split. Predictions are averaged/voted. Robust, hard to overfit, works well with default settings.
:::

### Gradient boosting

:::def Gradient boosting
An ensemble that builds trees **one after another**, where each new small tree tries to fix the **errors** of the trees before it. XGBoost, LightGBM, CatBoost and scikit-learn's `HistGradientBoosting` are popular versions — often the winners on tabular data.
:::

```python run level=intermediate
import time
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import cross_val_score
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier, ExtraTreesClassifier

X, y = load_breast_cancer(return_X_y=True)
models = {
    "single tree": DecisionTreeClassifier(random_state=0),
    "random forest": RandomForestClassifier(n_estimators=300, random_state=0),
    "extra trees": ExtraTreesClassifier(n_estimators=300, random_state=0),
    "gradient boosting": HistGradientBoostingClassifier(random_state=0),
}
for name, m in models.items():
    t = time.perf_counter()
    s = cross_val_score(m, X, y, cv=5)
    print(f"{name:<18} {s.mean():.3f} ± {s.std():.3f}   ({time.perf_counter() - t:.1f}s)")
```

### Boosting from scratch (regression)

Seeing boosting by hand makes it click: each round fits a tiny tree to the **residuals** (what is still wrong).

```python run level=advanced
import numpy as np
import matplotlib.pyplot as plt
from sklearn.tree import DecisionTreeRegressor

rng = np.random.default_rng(0)
x = np.sort(rng.uniform(0, 6, 120)).reshape(-1, 1)
y = np.sin(x).ravel() + rng.normal(0, 0.15, 120)

pred = np.full_like(y, y.mean())          # start with the average
lr = 0.3
fig, ax = plt.subplots(figsize=(7, 4))
ax.scatter(x, y, s=10, color="gray")
for round_ in range(1, 31):
    residual = y - pred                                   # what is still wrong
    stump = DecisionTreeRegressor(max_depth=2).fit(x, residual)
    pred += lr * stump.predict(x)                         # take a small step toward fixing it
    if round_ in (1, 3, 10, 30):
        ax.plot(x, pred, linewidth=2, label=f"after {round_} trees (MSE {np.mean((y - pred) ** 2):.3f})")
ax.set(title="Gradient boosting: each tree fixes the previous errors")
ax.legend(fontsize=8)
plt.show()
```

## Tuning tree ensembles

| Hyperparameter | Effect |
|---|---|
| `n_estimators` (forest) | more trees = more stable (diminishing returns) |
| `max_depth` / `max_leaf_nodes` | tree size — the main overfitting control |
| `min_samples_leaf` | each leaf needs at least this many examples |
| `learning_rate` (boosting) | smaller = more careful, needs more trees |
| `max_iter` (HistGB) / `n_estimators` | number of boosting rounds |
| `early_stopping` (HistGB) | stop when validation score stops improving |

```python run level=advanced
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import RandomizedSearchCV, train_test_split
from sklearn.ensemble import HistGradientBoostingClassifier
from scipy.stats import loguniform, randint

X, y = load_breast_cancer(return_X_y=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

search = RandomizedSearchCV(
    HistGradientBoostingClassifier(random_state=0),
    {"learning_rate": loguniform(0.01, 0.3), "max_leaf_nodes": randint(4, 40), "min_samples_leaf": randint(5, 40)},
    n_iter=12, cv=4, random_state=0,
)
search.fit(X_tr, y_tr)
print({k: (round(v, 3) if isinstance(v, float) else v) for k, v in search.best_params_.items()})
print(f"CV {search.best_score_:.3f} | test {search.score(X_te, y_te):.3f}")
```

## Explaining predictions: feature importance

```python run level=intermediate
import numpy as np
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance

data = load_breast_cancer()
X_tr, X_te, y_tr, y_te = train_test_split(data.data, data.target, test_size=0.3, random_state=0, stratify=data.target)
forest = RandomForestClassifier(n_estimators=300, random_state=0).fit(X_tr, y_tr)

print("Built-in (impurity) importance — top 5:")
for i in np.argsort(forest.feature_importances_)[::-1][:5]:
    print(f"  {data.feature_names[i]:<25} {forest.feature_importances_[i]:.3f}")

perm = permutation_importance(forest, X_te, y_te, n_repeats=10, random_state=0)
print("Permutation importance on test data — top 5:")
for i in np.argsort(perm.importances_mean)[::-1][:5]:
    print(f"  {data.feature_names[i]:<25} {perm.importances_mean[i]:.3f}")
```

:::def Permutation importance
Shuffle one feature's column and see how much the model's score drops. A big drop means the model relies on that feature. More reliable than built-in impurity importance, and works for any model.
:::

:::tip Going further
**SHAP** values explain individual predictions ("this customer's churn risk is high mainly because of low activity"). `pip install shap` — it works with all tree ensembles.
:::

## When to use what

| Situation | Try |
|---|---|
| Tabular data, want strong accuracy fast | `HistGradientBoostingClassifier`, LightGBM, XGBoost |
| Want robustness with almost no tuning | `RandomForestClassifier` |
| Need an explainable, auditable rule set | a shallow `DecisionTreeClassifier` |
| Images, audio, raw text | neural networks / pretrained models |
| Text features + tabular features together | embeddings from a language model **as extra columns** for a boosted model |

:::ai
In AI products, boosted trees often handle the **structured** side: predicting which users will churn, routing requests to a cheap or expensive model based on features, ranking search results (learning-to-rank), or detecting fraud — while LLMs handle the language.
:::

## Check yourself

```quiz
? An unlimited-depth tree scores 100% on train and 91% on test. What should you do?
+ Limit its depth/leaf size, or use a forest/boosting
- Make it deeper
- Remove the test set
> Classic overfitting: the tree memorised the training data.

? How does gradient boosting build its ensemble?
+ Sequentially — each new tree corrects the previous trees' errors
- In parallel on random samples, then votes
- By training one very deep tree
> That sequential error-fixing is the "boosting".

? What does a random forest add to plain bagging?
+ A random subset of features at each split
- Sequential training
- A neural network
> Random feature subsets make the trees more different, so their errors cancel better.

? Permutation importance measures…
+ How much the score drops when a feature's values are shuffled
- How often a feature is used in splits
- The correlation of a feature with the label
> It works for any model.
```

:::exercise Forest vs boosting on wine
Load `load_wine`, compare `RandomForestClassifier(n_estimators=200)` and `HistGradientBoostingClassifier()` with 5-fold `cross_val_score`, then fit the better one on all data and print its 3 most important features (use `feature_importances_` for the forest, or permutation importance for either).
:::

:::solution
```python run
import numpy as np
from sklearn.datasets import load_wine
from sklearn.model_selection import cross_val_score
from sklearn.ensemble import RandomForestClassifier, HistGradientBoostingClassifier
from sklearn.inspection import permutation_importance

data = load_wine()
X, y = data.data, data.target
candidates = {"forest": RandomForestClassifier(n_estimators=200, random_state=0),
              "boosting": HistGradientBoostingClassifier(random_state=0)}
scores = {name: cross_val_score(m, X, y, cv=5).mean() for name, m in candidates.items()}
print({k: round(v, 3) for k, v in scores.items()})

best_name = max(scores, key=scores.get)
best = candidates[best_name].fit(X, y)
imp = permutation_importance(best, X, y, n_repeats=5, random_state=0).importances_mean
for i in np.argsort(imp)[::-1][:3]:
    print(f"{data.feature_names[i]:<30} {imp[i]:.3f}")
```
:::

:::keypoints
- Decision trees split data with yes/no questions chosen to reduce impurity; easy to read, easy to overfit.
- **Random forests** average many randomized trees; **gradient boosting** adds trees that fix earlier errors.
- Control overfitting with depth, leaf size, learning rate and early stopping.
- Explain models with **permutation importance** (and SHAP).
- For tabular data, boosted trees are usually the strongest first choice.
:::
