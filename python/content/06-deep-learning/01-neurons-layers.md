---
title: Neurons, Layers & Activations
level: intermediate
time: 28
summary: What a neural network actually is — artificial neurons, activation functions, layers and the forward pass — built up step by step in NumPy so nothing is magic.
---

Deep learning powers image recognition, speech, translation and every LLM. Under the hype, a neural network is a surprisingly simple thing: **lots of small weighted sums, each followed by a simple non-linear function, stacked in layers**. Let's build that up from one neuron.

## One artificial neuron

:::def Artificial neuron
A tiny function: multiply each input by a **weight**, add them up, add a **bias**, then pass the result through an **activation function**. `output = activation(w · x + b)`.
:::

:::formula A single neuron
z = w₁x₁ + w₂x₂ + … + wₙxₙ + b        (weighted sum)
a = f(z)                                (activation)
:::

```python run level=easy
import numpy as np

def neuron(x, w, b):
    z = np.dot(w, x) + b           # weighted sum
    return max(0.0, z)             # ReLU activation

# Should I take an umbrella? inputs: [cloudiness 0-1, rain forecast 0-1, already wet 0/1]
w = np.array([0.6, 1.5, -0.3])
b = -0.8
for x in [[0.1, 0.0, 0], [0.9, 0.8, 0], [0.5, 0.3, 1]]:
    print(x, "->", round(neuron(np.array(x), w, b), 3))
```

The weights say how much each input matters (rain forecast matters most); the bias shifts the threshold. **Learning** = finding good weights and biases automatically.

:::analogy
A neuron is like a **judge in a talent show** who weighs several criteria (singing, dancing, charisma) with personal importance weights, adds them up, and only buzzes if the total passes their threshold.
:::

## Activation functions

Without a non-linear activation, stacking layers is pointless — many linear steps collapse into one linear step. Activations let networks learn curves, corners and complicated shapes.

:::def Activation function
A simple non-linear function applied after each weighted sum. It lets the network model complex, non-linear patterns.
:::

| Activation | Formula | Range | Where it's used |
|---|---|---|---|
| **ReLU** | `max(0, z)` | [0, ∞) | default for hidden layers, CNNs |
| **GELU** | ≈ `z · Φ(z)` | ≈ (−0.17, ∞) | Transformers (GPT, BERT) |
| **SiLU / Swish** | `z · sigmoid(z)` | ≈ (−0.28, ∞) | LLaMA-style LLMs (in SwiGLU) |
| **Sigmoid** | `1 / (1 + e⁻ᶻ)` | (0, 1) | binary probabilities, gates |
| **Tanh** | `(eᶻ − e⁻ᶻ)/(eᶻ + e⁻ᶻ)` | (−1, 1) | RNNs |
| **Softmax** | `eᶻⁱ / Σ eᶻʲ` | (0,1), sums to 1 | final layer for classes / next token |

```python run level=easy
import numpy as np
import matplotlib.pyplot as plt

z = np.linspace(-4, 4, 200)
acts = {
    "ReLU": np.maximum(0, z),
    "GELU": 0.5 * z * (1 + np.tanh(np.sqrt(2 / np.pi) * (z + 0.044715 * z ** 3))),
    "SiLU": z / (1 + np.exp(-z)),
    "sigmoid": 1 / (1 + np.exp(-z)),
    "tanh": np.tanh(z),
}
fig, ax = plt.subplots(figsize=(7, 4))
for name, a in acts.items():
    ax.plot(z, a, linewidth=2, label=name)
ax.axhline(0, color="gray", linewidth=0.5)
ax.set(title="Activation functions", xlabel="z", ylim=(-1.5, 4))
ax.legend()
plt.show()
```

## A layer = many neurons at once

:::def Layer (dense / fully connected / linear)
A group of neurons that all receive the same inputs. With a weight **matrix** `W` (one column per neuron), the whole layer is one matrix multiplication: `a = f(x @ W + b)`.
:::

```python run level=intermediate
import numpy as np

rng = np.random.default_rng(0)
x = rng.normal(size=4)                 # 4 input features
W = rng.normal(size=(4, 3))            # 3 neurons, each with 4 weights
b = np.zeros(3)

loop_version = [max(0, x @ W[:, j] + b[j]) for j in range(3)]   # neuron by neuron
matrix_version = np.maximum(0, x @ W + b)                        # all at once
print(np.round(loop_version, 4))
print(matrix_version.round(4))
```

And a **batch** of inputs is just more rows: `X` with shape `(batch, features)` → `X @ W + b` with shape `(batch, neurons)`.

## Stacking layers: a neural network

:::def Multilayer perceptron (MLP)
A network of fully connected layers: an **input** layer, one or more **hidden** layers, and an **output** layer. "Deep" learning simply means many hidden layers.
:::

```text
 input (4)      hidden (8)      hidden (8)      output (3)
   x  ──W1──▶  ReLU(...)  ──W2──▶  ReLU(...)  ──W3──▶  softmax → probabilities
```

:::def Forward pass
Running inputs through the network layer by layer to get an output. Inference (using a model) is just a forward pass.
:::

```python run level=intermediate
import numpy as np

rng = np.random.default_rng(42)

def relu(z): return np.maximum(0, z)
def softmax(z):
    e = np.exp(z - z.max(axis=-1, keepdims=True))
    return e / e.sum(axis=-1, keepdims=True)

sizes = [4, 8, 8, 3]
params = [(rng.normal(0, np.sqrt(2 / m), (m, n)), np.zeros(n)) for m, n in zip(sizes[:-1], sizes[1:])]

def forward(X):
    a = X
    for i, (W, b) in enumerate(params):
        z = a @ W + b
        a = softmax(z) if i == len(params) - 1 else relu(z)
        print(f"layer {i + 1}: {W.shape[0]:>2} -> {W.shape[1]:>2}   output shape {a.shape}")
    return a

X = rng.normal(size=(5, 4))            # a batch of 5 examples
probs = forward(X)
print(probs.round(3))
print("each row sums to 1:", probs.sum(axis=1).round(6))
n_params = sum(W.size + b.size for W, b in params)
print("total parameters:", n_params)
```

An untrained network outputs random-ish probabilities. Training (next lesson) adjusts all those parameters.

### Counting parameters

```python run level=intermediate
def count_params(sizes):
    return sum(m * n + n for m, n in zip(sizes[:-1], sizes[1:]))

print("tiny MLP [4, 8, 8, 3]:         ", f"{count_params([4, 8, 8, 3]):,}")
print("MNIST MLP [784, 512, 256, 10]: ", f"{count_params([784, 512, 256, 10]):,}")
print("one GPT-style MLP block d=4096:", f"{count_params([4096, 4 * 4096, 4096]):,}")
```

That last line is just **one** feed-forward block of a large Transformer — LLMs have dozens of these layers, which is how they reach billions of parameters.

## Why depth helps: XOR

A single neuron draws one straight line. Some problems need more. The classic example is XOR ("one or the other, but not both"):

```python run level=intermediate
import numpy as np

X = np.array([[0, 0], [0, 1], [1, 0], [1, 1]])
y_xor = np.array([0, 1, 1, 0])

# No single line separates XOR — but two hidden ReLU neurons can, with these hand-picked weights:
W1 = np.array([[1, 1], [1, 1]])
b1 = np.array([0, -1])
W2 = np.array([1, -2])
hidden = np.maximum(0, X @ W1 + b1)       # neuron A = OR-ish, neuron B = AND
out = hidden @ W2

for x, h, o, t in zip(X, hidden, out, y_xor):
    print(f"x={x}  hidden={h}  output={o}  target={t}")
```

Hidden layers create **new features** (here: "at least one is on" and "both are on") that make the problem easy for the next layer. Deep networks learn useful features like this automatically.

:::def Universal approximation
A theorem saying a network with even one hidden layer (wide enough) can approximate almost any function. Deeper networks usually do it with far fewer neurons, by building features on top of features.
:::

## Weight initialization

Starting weights matter. All zeros → every neuron learns the same thing. Too large → activations explode. Too small → they vanish.

```python run level=advanced
import numpy as np

rng = np.random.default_rng(0)
X = rng.normal(size=(512, 256))

for name, scale in [("too small (0.01)", lambda n: 0.01), ("too large (1.0)", lambda n: 1.0), ("He init sqrt(2/n)", lambda n: np.sqrt(2 / n))]:
    a = X
    for layer in range(10):
        W = rng.normal(0, scale(a.shape[1]), (a.shape[1], 256))
        a = np.maximum(0, a @ W)
    print(f"{name:<20} activation std after 10 layers: {a.std():.3e}")
```

:::def He / Xavier initialization
Rules for the scale of random starting weights that keep signals a healthy size through many layers: **He** (`std = √(2/n_in)`) for ReLU, **Xavier/Glorot** (`std = √(1/n_in)`) for tanh/sigmoid. Frameworks apply them by default.
:::

:::ai
The MLP you just built is a core piece of every Transformer: after attention, each token's vector passes through an MLP (often called the **feed-forward network**) with a GELU or SwiGLU activation. About two-thirds of an LLM's parameters live in these MLPs.
:::

## Check yourself

```quiz
? What does a neuron compute?
+ activation(weighted sum of inputs + bias)
- The average of its inputs
- A random number
> z = w·x + b, then a = f(z).

? Why do we need non-linear activation functions?
+ Without them, stacked layers collapse into a single linear function
- They make computation faster
- They normalize the inputs
> Non-linearity is what lets deep networks model complex patterns.

? A dense layer with 100 inputs and 50 neurons has how many parameters?
+ 5,050 (100×50 weights + 50 biases)
- 150
- 5,000
> Every neuron has one weight per input, plus one bias.

? Which activation is typical in the final layer of a 10-class classifier?
+ Softmax
- ReLU
- Tanh
> Softmax turns 10 scores into 10 probabilities that sum to 1.
```

:::exercise Build a 2-layer forward pass
Create a network for inputs of size 3 → hidden layer of 5 (ReLU) → 2 outputs (softmax), with He-initialized weights from `np.random.default_rng(1)`. Run a batch of 4 random inputs through it and print the output probabilities and the predicted class for each.
:::

:::solution
```python run
import numpy as np

rng = np.random.default_rng(1)
W1, b1 = rng.normal(0, np.sqrt(2 / 3), (3, 5)), np.zeros(5)
W2, b2 = rng.normal(0, np.sqrt(2 / 5), (5, 2)), np.zeros(2)

def softmax(z):
    e = np.exp(z - z.max(axis=1, keepdims=True))
    return e / e.sum(axis=1, keepdims=True)

X = rng.normal(size=(4, 3))
h = np.maximum(0, X @ W1 + b1)
p = softmax(h @ W2 + b2)
print(p.round(3))
print("predicted classes:", p.argmax(axis=1))
```
:::

:::keypoints
- A neuron computes `f(w · x + b)`; a layer does it for many neurons at once: `f(X @ W + b)`.
- **Activations** (ReLU, GELU, SiLU, sigmoid, softmax) add the non-linearity that makes depth useful.
- Stacked layers = an **MLP**; running data through it = the **forward pass**.
- Hidden layers learn new features (XOR needs one).
- Good **initialization** (He/Xavier) keeps signals stable through deep networks.
:::
