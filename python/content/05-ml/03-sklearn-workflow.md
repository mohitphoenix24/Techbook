---
title: The scikit-learn Workflow
level: intermediate
time: 30
summary: The standard ML toolkit. Learn the fit / predict / transform pattern, split data properly, build Pipelines that prevent leakage, and save models — the same steps for every algorithm.
---

**scikit-learn** (imported as `sklearn`) gives you dozens of ML algorithms behind **one consistent interface**. Learn the pattern once and you can try linear models, trees, SVMs or k-nearest-neighbours by changing a single line.

:::def Estimator
Any scikit-learn object that learns from data with `.fit()`. **Models** (predictors) also have `.predict()`; **transformers** (like scalers) have `.transform()`.
:::

:::syntax
```python
from sklearn.some_module import SomeModel

model = SomeModel(hyperparameter=value)   # 1. create (choose hyperparameters)
model.fit(X_train, y_train)               # 2. learn from training data
predictions = model.predict(X_test)       # 3. predict on new data
score = model.score(X_test, y_test)       # 4. evaluate
```
:::

## The whole workflow in 10 lines

```python run level=easy
from sklearn.datasets import load_iris
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier

X, y = load_iris(return_X_y=True)                     # 150 flowers, 4 measurements, 3 species
X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

model = KNeighborsClassifier(n_neighbors=5)
model.fit(X_train, y_train)
print("predictions:", model.predict(X_test[:8]))
print("true labels:", y_test[:8])
print(f"test accuracy: {model.score(X_test, y_test):.1%}")
```

:::def k-nearest neighbours (k-NN)
A simple model that predicts by looking at the **k most similar training examples** and taking a majority vote. It is exactly what a vector database does when it finds the nearest embeddings to a query.
:::

## Looking at the data first

```python run level=easy
from sklearn.datasets import load_iris
import pandas as pd

iris = load_iris(as_frame=True)
df = iris.frame
df["species"] = df["target"].map(dict(enumerate(iris.target_names)))
print(df.shape)
print(df["species"].value_counts())
df.groupby("species").mean(numeric_only=True).round(2)
```

## train_test_split

```python run level=easy
import numpy as np
from sklearn.model_selection import train_test_split

X = np.arange(20).reshape(10, 2)
y = np.array([0, 0, 0, 0, 0, 0, 0, 1, 1, 1])

X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.3, random_state=42, stratify=y)
print("train labels:", y_tr, "| test labels:", y_te)
```

- `test_size` — fraction held out for testing.
- `random_state` — a seed so the split is reproducible.
- `stratify=y` — keeps the **class proportions** the same in both parts (important for imbalanced data).

## Swapping models is one line

```python run level=intermediate
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC

X, y = load_breast_cancer(return_X_y=True)              # 569 tumours, 30 features, benign/malignant
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

models = {
    "LogisticRegression": LogisticRegression(max_iter=5000),
    "DecisionTree": DecisionTreeClassifier(random_state=0),
    "RandomForest": RandomForestClassifier(n_estimators=200, random_state=0),
    "kNN": KNeighborsClassifier(),
    "SVM": SVC(),
}
for name, model in models.items():
    model.fit(X_tr, y_tr)
    print(f"{name:<20} {model.score(X_te, y_te):.3f}")
```

## Preprocessing with transformers

:::def Transformer (scikit-learn)
An object that **learns** something from training data with `.fit()` (e.g. each column's mean and std) and then **changes** data with `.transform()`. `fit_transform()` does both at once. (Not to be confused with the Transformer neural network!)
:::

```python run level=intermediate
import numpy as np
from sklearn.preprocessing import StandardScaler

X_train = np.array([[1.0, 100], [2.0, 300], [3.0, 500]])
X_test = np.array([[2.5, 250]])

scaler = StandardScaler()
X_train_s = scaler.fit_transform(X_train)     # learn mean/std on TRAIN, then scale it
X_test_s = scaler.transform(X_test)           # reuse the SAME numbers on test — never fit on test!
print("learned means:", scaler.mean_, "stds:", scaler.scale_.round(2))
print(X_train_s.round(2))
print(X_test_s.round(2))
```

| Transformer | What it does |
|---|---|
| `StandardScaler` | mean 0, std 1 per column |
| `MinMaxScaler` | squash into [0, 1] |
| `OneHotEncoder` | categories → 0/1 columns |
| `SimpleImputer` | fill missing values |
| `TfidfVectorizer` | text → word-importance vectors |
| `PCA` | compress many features into a few |

## Pipelines: the professional way

:::def Pipeline
A chain of steps (transformers, then a final model) that behaves like one model. Calling `.fit()` fits every step **on the training data only**, in order — which makes data leakage impossible and keeps your code tidy.
:::

```python run level=intermediate
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import train_test_split
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

X, y = load_breast_cancer(return_X_y=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

pipe = make_pipeline(StandardScaler(), LogisticRegression())
pipe.fit(X_tr, y_tr)                       # scaler learns from train only, then model trains
print(f"accuracy: {pipe.score(X_te, y_te):.3f}")
print(pipe)
print("probabilities for 3 test cases:\n", pipe.predict_proba(X_te[:3]).round(3))
```

### Mixed column types: ColumnTransformer

Real tables mix numbers, categories and text. `ColumnTransformer` applies the right preprocessing to each column.

```python run level=advanced
import pandas as pd
import numpy as np
from sklearn.compose import ColumnTransformer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler
from sklearn.impute import SimpleImputer
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split

rng = np.random.default_rng(0)
n = 400
df = pd.DataFrame({
    "plan": rng.choice(["free", "pro", "team"], n),
    "country": rng.choice(["IN", "US", "UK", "DE"], n),
    "messages_per_day": rng.gamma(2, 10, n),
    "days_since_signup": rng.integers(1, 400, n).astype(float),
})
df.loc[rng.random(n) < 0.1, "messages_per_day"] = np.nan          # some missing values
churn_score = (df["plan"] == "free") * 1.2 - df["messages_per_day"].fillna(20) / 25 + rng.normal(0, 0.5, n)
df["churned"] = (churn_score > 0).astype(int)

X, y = df.drop(columns="churned"), df["churned"]
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

preprocess = ColumnTransformer([
    ("num", Pipeline([("impute", SimpleImputer(strategy="median")), ("scale", StandardScaler())]),
     ["messages_per_day", "days_since_signup"]),
    ("cat", OneHotEncoder(handle_unknown="ignore"), ["plan", "country"]),
])
model = Pipeline([("prep", preprocess), ("clf", RandomForestClassifier(n_estimators=200, random_state=0))])
model.fit(X_tr, y_tr)
print(f"churn model accuracy: {model.score(X_te, y_te):.3f}")
print(model.predict(pd.DataFrame([{"plan": "free", "country": "IN", "messages_per_day": 1.0, "days_since_signup": 30.0}])))
```

## Cross-validation

A single train/test split can be lucky or unlucky. **Cross-validation** averages over several splits.

:::def k-fold cross-validation
Split the training data into **k** parts ("folds"). Train k times, each time holding out a different fold for validation. Average the k scores for a more reliable estimate.
:::

```python run level=intermediate
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import cross_val_score
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.linear_model import LogisticRegression

X, y = load_breast_cancer(return_X_y=True)
pipe = make_pipeline(StandardScaler(), LogisticRegression())
scores = cross_val_score(pipe, X, y, cv=5)
print("fold scores:", scores.round(3))
print(f"mean {scores.mean():.3f} ± {scores.std():.3f}")
```

## Hyperparameter search

```python run level=advanced
from sklearn.datasets import load_breast_cancer
from sklearn.model_selection import GridSearchCV, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.svm import SVC

X, y = load_breast_cancer(return_X_y=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)

pipe = Pipeline([("scale", StandardScaler()), ("svm", SVC())])
grid = {"svm__C": [0.1, 1, 10], "svm__kernel": ["linear", "rbf"]}   # step__param naming
search = GridSearchCV(pipe, grid, cv=5, n_jobs=1)
search.fit(X_tr, y_tr)

print("best params:", search.best_params_)
print(f"best CV score: {search.best_score_:.3f}")
print(f"test score with best model: {search.score(X_te, y_te):.3f}")
```

:::tip
Use `GridSearchCV` for a few options, `RandomizedSearchCV` when the grid is large. Only look at the **test** score once, at the very end.
:::

## Regression works the same way

```python run level=intermediate
import numpy as np
from sklearn.datasets import load_diabetes
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LinearRegression, Ridge
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score

X, y = load_diabetes(return_X_y=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=0)

for model in [LinearRegression(), Ridge(alpha=1.0), GradientBoostingRegressor(random_state=0)]:
    pred = model.fit(X_tr, y_tr).predict(X_te)
    print(f"{type(model).__name__:<26} MAE={mean_absolute_error(y_te, pred):6.2f}  R²={r2_score(y_te, pred):.3f}")
```

## Saving and loading a trained model

```python run level=intermediate
import joblib
from sklearn.datasets import load_iris
from sklearn.linear_model import LogisticRegression

X, y = load_iris(return_X_y=True)
model = LogisticRegression(max_iter=1000).fit(X, y)

joblib.dump(model, "iris_model.joblib")          # save to disk
loaded = joblib.load("iris_model.joblib")        # later, in your API server...
print(loaded.predict([[5.1, 3.5, 1.4, 0.2]]))
```

:::warn Only load models you trust
`joblib` / `pickle` files can run arbitrary code when loaded. Never load model files from untrusted sources. (For neural networks, the `safetensors` format avoids this risk.)
:::

:::ai Classic ML + LLMs
A very common production pattern: turn text into **embeddings** with an embedding model, then train a fast, cheap scikit-learn `LogisticRegression` on those vectors for classification. You get LLM-quality understanding at a fraction of the cost per prediction.
:::

## Check yourself

```quiz
? Which call should you NEVER make on the test set?
+ scaler.fit(X_test)
- model.predict(X_test)
- scaler.transform(X_test)
> Fitting on test data leaks information. Only transform it with what was learned on train.

? What does `stratify=y` do in train_test_split?
+ Keeps the class proportions equal in train and test
- Sorts the data by label
- Removes rare classes
> Important when some classes are rare.

? Why use a Pipeline?
+ It chains preprocessing + model and fits each step only on training data, preventing leakage
- It makes models more accurate automatically
- It is required for every model
> It also makes saving and deploying a single object easy.

? 5-fold cross-validation trains the model how many times?
+ 5
- 1
- 25
> Once per fold, each time validating on a different fold.
```

:::exercise Wine classifier
Load `load_wine(return_X_y=True)`. Build a `Pipeline` of `StandardScaler` + `KNeighborsClassifier`, and use `GridSearchCV` with `n_neighbors` in `[1, 3, 5, 9, 15]` and 5-fold CV. Print the best `n_neighbors`, the best CV score and the test accuracy.
:::

:::solution
```python run
from sklearn.datasets import load_wine
from sklearn.model_selection import train_test_split, GridSearchCV
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import KNeighborsClassifier

X, y = load_wine(return_X_y=True)
X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.25, random_state=0, stratify=y)
pipe = Pipeline([("scale", StandardScaler()), ("knn", KNeighborsClassifier())])
search = GridSearchCV(pipe, {"knn__n_neighbors": [1, 3, 5, 9, 15]}, cv=5)
search.fit(X_tr, y_tr)
print("best k:", search.best_params_["knn__n_neighbors"])
print(f"best CV score: {search.best_score_:.3f}")
print(f"test accuracy: {search.score(X_te, y_te):.3f}")
```
:::

:::keypoints
- Every estimator: `fit` → `predict` / `transform` → `score`. Swap models freely.
- `train_test_split(..., stratify=y, random_state=...)` for honest, reproducible evaluation.
- Fit transformers on **training data only**; **Pipelines** and `ColumnTransformer` enforce this.
- Use **cross-validation** and `GridSearchCV` to compare models and tune hyperparameters.
- Save with `joblib.dump` — and only load files you trust.
:::
