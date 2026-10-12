---
title: What is Machine Learning?
level: easy
time: 20
summary: The core vocabulary of ML in plain English — features, labels, training, models, loss, overfitting — and how classic ML, deep learning and LLMs fit together.
---

In normal programming, **you** write the rules. In machine learning, you show the computer **examples**, and it **learns the rules** itself.

```text
Traditional programming:   rules + data      →  answers
Machine learning:          data + answers    →  rules (a "model")
```

:::analogy
Teaching a child to recognise dogs, you don't give them a rulebook ("four legs, fur, a tail…"). You point at many dogs and say "dog", and at cats and say "not a dog". After enough examples, they figure out the pattern. That is machine learning.
:::

## The core vocabulary

:::def Machine learning (ML)
Building programs that **learn patterns from data** instead of being explicitly programmed with rules.
:::

:::def Model
The thing that is learned: a function with adjustable numbers (**parameters**) that maps inputs to outputs. Training sets those numbers.
:::

:::def Features (X)
The **inputs** describing each example — e.g. a house's size, rooms and location; or an email's words. By convention, the feature table is called `X`.
:::

:::def Label / target (y)
The **answer** you want the model to predict for each example — the house price, or "spam / not spam". By convention it is called `y`.
:::

:::def Training
The process of adjusting a model's parameters so its predictions get closer to the true labels on the training data.
:::

:::def Inference (prediction)
Using a trained model on **new** inputs to get predictions. Calling an LLM API is inference.
:::

```python run level=easy
# A tiny dataset: features X and labels y
X = [  # [size_m2, rooms]
    [50, 1],
    [80, 2],
    [120, 3],
    [65, 2],
]
y = [150_000, 240_000, 360_000, 195_000]     # prices (the labels)

for features, label in zip(X, y):
    print(f"features={features}  ->  label={label:,}")

# A "model" with one parameter: price = w * size. Let's find w by trying values.
best_w, best_err = None, float("inf")
for w in range(1000, 5001, 100):
    err = sum((w * size - price) ** 2 for (size, _), price in zip(X, y))
    if err < best_err:
        best_w, best_err = w, err
print("learned w =", best_w, "→ prediction for 100 m²:", best_w * 100)
```

That brute-force search is a (very slow) form of training. Real algorithms find the best parameters much more cleverly — you will see **gradient descent** in the next lesson.

## Types of machine learning

| Type | Learns from | Example tasks |
|---|---|---|
| **Supervised** | examples **with** labels | spam detection, price prediction, sentiment |
| **Unsupervised** | examples **without** labels | customer segments, topic discovery, anomaly detection |
| **Self-supervised** | labels made **from the data itself** | LLM pretraining: predict the next word |
| **Reinforcement learning** | rewards from trial and error | game playing, robotics, RLHF for chatbots |

:::def Classification vs regression
Two kinds of supervised learning. **Classification** predicts a **category** (spam / not spam, which digit). **Regression** predicts a **number** (price, temperature, rating).
:::

:::def Self-supervised learning
Learning where the labels come for free from the data. An LLM reads "The cat sat on the ___" and the label is simply the real next word "mat". This is how models learn from trillions of words without human labelling.
:::

## The ML workflow

:::flow From data to a deployed model
Collect data | examples + labels
Clean & explore | fix, visualise
Split | train / validation / test
Train | fit the model
Evaluate | on unseen data
Tune | improve settings
Deploy | serve predictions
:::

## Train, validation and test sets

:::def Train / validation / test split
Splitting your data into three parts: **train** (the model learns from it), **validation** (you use it to choose settings and compare models), and **test** (touched **once** at the very end to estimate real-world performance).
:::

:::analogy
Train = the textbook exercises. Validation = practice exams. Test = the real final exam. If you study the final exam questions in advance, your score means nothing.
:::

```python run level=easy
import random

examples = list(range(100))          # pretend these are 100 labelled examples
random.Random(0).shuffle(examples)   # shuffle first!

train, val, test = examples[:70], examples[70:85], examples[85:]
print(len(train), "train |", len(val), "validation |", len(test), "test")
print("no overlap:", set(train).isdisjoint(test) and set(val).isdisjoint(test))
```

## Loss: measuring how wrong a model is

:::def Loss function
A formula that gives a single number measuring **how wrong** the model's predictions are. Training means making this number as small as possible. Mean squared error is common for regression; cross-entropy for classification.
:::

```python run level=easy
y_true = [3.0, 5.0, 2.5, 7.0]
good_pred = [2.8, 5.1, 2.4, 6.7]
bad_pred = [1.0, 7.5, 4.0, 3.0]

def mse(y, p):
    return sum((a - b) ** 2 for a, b in zip(y, p)) / len(y)

def mae(y, p):
    return sum(abs(a - b) for a, b in zip(y, p)) / len(y)

print(f"good model: MSE={mse(y_true, good_pred):.3f}  MAE={mae(y_true, good_pred):.3f}")
print(f"bad model:  MSE={mse(y_true, bad_pred):.3f}  MAE={mae(y_true, bad_pred):.3f}")
```

## Overfitting and underfitting

:::def Overfitting
The model learns the training data **too** well — including its noise and quirks — so it does great on training data but poorly on new data. Like memorising answers instead of understanding.
:::

:::def Underfitting
The model is too simple to capture the real pattern, so it does poorly on **both** training and new data.
:::

:::def Generalization
How well a model performs on **new, unseen** data. This is the only performance that really matters.
:::

```python run level=intermediate
import numpy as np
import matplotlib.pyplot as plt

rng = np.random.default_rng(1)
x = np.sort(rng.uniform(0, 1, 15))
y = np.sin(2 * np.pi * x) + rng.normal(0, 0.2, x.size)          # true pattern + noise
x_new = np.sort(rng.uniform(0, 1, 50))
y_new = np.sin(2 * np.pi * x_new) + rng.normal(0, 0.2, x_new.size)

grid = np.linspace(0, 1, 300)
fig, axes = plt.subplots(1, 3, figsize=(11, 3.4), sharey=True)
for ax, degree, name in zip(axes, [1, 4, 9], ["underfit", "good fit", "overfit"]):
    coefs = np.polyfit(x, y, degree)
    train_err = np.mean((np.polyval(coefs, x) - y) ** 2)
    test_err = np.mean((np.polyval(coefs, x_new) - y_new) ** 2)
    ax.scatter(x, y, s=20, color="black", label="training data")
    ax.plot(grid, np.clip(np.polyval(coefs, grid), -2, 2), color="#4f46e5")
    ax.set_title(f"{name} (degree {degree})\ntrain err {train_err:.3f} | new-data err {test_err:.2f}", fontsize=9)
    ax.set_ylim(-2, 2)
fig.tight_layout()
plt.show()
```

The degree-9 curve passes very close to every training point (tiny training error) but swings wildly between them — terrible on new data.

| | Training error | New-data error | Fix |
|---|---|---|---|
| Underfitting | high | high | more complex model, better features, train longer |
| Good fit | low | low | 🎉 |
| Overfitting | very low | high | more data, simpler model, regularization, early stopping |

## Parameters vs hyperparameters

:::def Parameters
Numbers the model **learns** during training (weights, biases). A big LLM has billions of them.
:::

:::def Hyperparameters
Settings **you choose** before training: learning rate, number of trees, layer sizes, number of epochs. You pick them using the validation set.
:::

## Classic ML, deep learning and LLMs

:::def Deep learning
Machine learning with **neural networks** that have many layers. It shines on unstructured data — images, audio, text — and learns its own features.
:::

:::def Large Language Model (LLM)
A very large deep-learning model (a Transformer) trained with self-supervised learning on huge amounts of text to predict the next token. Then usually fine-tuned to follow instructions and chat helpfully.
:::

```text
Artificial Intelligence
└── Machine Learning
    ├── Classic ML (linear models, trees, clustering)  ← great for tables
    └── Deep Learning (neural networks)                ← great for images, audio, text
        └── Transformers
            └── Large Language Models (Claude, GPT, Gemini, Llama)  ← Generative AI
```

| Problem | Good first choice |
|---|---|
| table of numbers/categories (churn, fraud, prices) | gradient-boosted trees (XGBoost, LightGBM, scikit-learn) |
| images, audio | pretrained deep networks (fine-tune) |
| text classification with lots of labels | fine-tuned small model or embeddings + logistic regression |
| text understanding/generation, few or no labels | an LLM with good prompts (+ RAG) |

:::ai
Even in the LLM era, classic ML matters: you will train **classifiers on embeddings**, use **clustering** to explore documents, evaluate with **precision/recall**, and reason about **overfitting** when fine-tuning. The concepts in this module carry straight into Gen-AI.
:::

## Check yourself

```quiz
? Predicting tomorrow's temperature in °C is…
- Classification
+ Regression
- Clustering
> The output is a number on a continuous scale.

? A model gets 99% accuracy on training data and 60% on new data. What is happening?
+ Overfitting
- Underfitting
- Perfect generalization
> A big gap between train and test performance is the classic sign.

? How is an LLM's pretraining usually labelled?
+ Self-supervised: the next token in the text is the label
- Humans label every sentence
- It has no objective
> The data labels itself.

? Which is a hyperparameter?
- A weight learned in a layer
+ The learning rate
- The model's prediction
> You choose hyperparameters; the model learns parameters.
```

:::keypoints
- ML learns rules from **examples**: features `X` → labels `y` via a **model** with learned **parameters**.
- Supervised (classification/regression), unsupervised, self-supervised (LLMs), reinforcement learning.
- Always split into **train / validation / test**; judge models on unseen data.
- A **loss function** measures error; training minimizes it.
- Watch for **overfitting** (memorizing) and **underfitting** (too simple).
:::
