---
title: Why Convolutional Networks? Locality, Weight Sharing, Receptive Fields
level: intermediate
time: 40
summary: Why a fully connected network is a poor fit for images, and the three ideas that make CNNs work: local connections, shared weights and stacked layers. Parameter counts compared, translation equivariance, and the receptive field.
---

In the last module a network learned digits from 64 numbers. Real photos are 224 × 224 × 3 = **150,528** numbers. Feeding them to a fully connected network is a poor idea. CNNs fix it with three simple observations about images.

## The problem with fully connected layers

Connect every input pixel to every unit of a hidden layer with 1,000 units:

```python run title="Parameters of a fully connected layer on a photo" level=easy
inputs = 224 * 224 * 3
hidden = 1000
params = inputs * hidden
print("inputs:", inputs, "  hidden units:", hidden)
print("weights in ONE layer:", f"{params:,}", f"= {params * 4 / 1e6:.0f} MB in float32")
print("a 10x larger image would need", f"{(2240 * 2240 * 3) * hidden:,}", "weights")
```

Half a billion weights for one layer, which is far too many to train on a limited data set (it would overfit), and no way to reuse what is learned. It also ignores the **structure** of images: a cat in the top-left corner needs separate weights from a cat in the bottom-right.

## Three ideas

:::flow What makes a CNN
Local connectivity | A unit looks only at a small patch (for example 3 × 3 pixels), not the whole image. Useful patterns (edges, corners, textures) are local.
Weight sharing | The same small set of weights (a filter) is slid over the whole image. An edge detector that works in one place works everywhere. Far fewer parameters.
Stacking layers | Early layers find edges; the next layers combine them into corners and textures; later ones into parts and whole objects. Depth builds a hierarchy.
:::

Each layer applies **many filters** (for example 64). Every filter produces one **feature map**: a picture showing where that pattern was found. A convolutional layer turns an image of `C_in` channels into one of `C_out` channels. (You met the maths in the convolution lesson; here the **filter weights are learned**.)

## Parameter count: the difference

```python run title="Conv layer versus fully connected layer" level=easy
cin, cout, k = 3, 64, 3
conv_params = cin * cout * k * k + cout                         # a bank of 64 filters of 3 x 3 x 3, plus biases
print("a conv layer with 64 filters of 3x3:", conv_params, "parameters")
print("it works on ANY image size: 32x32, 224x224, 1080p ... the same", conv_params, "weights")

h = w = 224
out_pixels = h * w * cout
fc_params = (h * w * cin) * out_pixels
print("a fully connected layer producing the same output size would need", f"{fc_params:,}", "parameters")
print("ratio:", f"{fc_params / conv_params:,.0f}", "times more")
```

A conv layer has **1,792 parameters**; the equivalent fully connected layer has **trillions**. And the conv layer's weights do not depend on the image size.

## Translation equivariance

Because the same filter slides everywhere, if the cat moves 10 pixels to the right, the feature maps move 10 pixels to the right as well. This property is **translation equivariance**: `conv(shift(x)) = shift(conv(x))`. Pooling and the final global average then add (approximate) **translation invariance** ("there is a cat somewhere").

```python run title="Equivariance: shift the input, the output shifts" level=intermediate
import numpy as np
from scipy.signal import correlate2d

rng = np.random.default_rng(0)
img = np.zeros((20, 20)); img[5:9, 4:8] = rng.random((4, 4))             # a small "object"
kernel = rng.normal(size=(3, 3))
shifted = np.roll(img, (3, 5), axis=(0, 1))                              # the object moved 3 down and 5 right

out = correlate2d(img, kernel, mode="same")
out_shifted = correlate2d(shifted, kernel, mode="same")
print("filter(shifted input) == shifted(filter output):", bool(np.allclose(out_shifted, np.roll(out, (3, 5), axis=(0, 1)))))
print("a fully connected layer has no such property: each weight belongs to one fixed pixel position")
```

(The check is exact here because the object is far from the borders; padding effects break it slightly at the edges.)

## The receptive field

One output unit depends on a patch of the input: its **receptive field**. A single 3 × 3 convolution sees 3 × 3 pixels. Stack another 3 × 3 convolution and each unit sees 5 × 5 pixels of the original. Stride and pooling make it grow much faster.

:::formula Receptive field growth
r_{\text{new}} = r + (k_{\text{eff}} - 1)\cdot j, \qquad j_{\text{new}} = j\cdot s
:::

`j` is the **jump** (distance between neighbouring outputs, measured in input pixels) and `s` the stride. Experiment with layer stacks:

```viz algo=receptive title="How far does one output unit see?"
```

Two 3 × 3 layers see the same area as one 5 × 5 layer but use fewer parameters (`2 × 9 = 18` versus `25` per channel pair) and add an extra non-linearity. That is why VGG replaced large kernels by **stacks of 3 × 3 convolutions**.

The receptive field must be large enough to cover the object (or the context needed to decide). Tricks to enlarge it cheaply: strides and pooling, **dilated convolutions**, larger kernels (7 × 7 in ConvNeXt), attention (transformers see the whole image from the first layer).

## A typical CNN, in a picture

```viz algo=arch title="A small image classifier" dir=right
img   Image | 224 x 224 x 3 [img] @0,0
c1    Conv + ReLU | 64 filters, 112 x 112 [conv] @1,0
p1    Pool | 56 x 56 [pool] @2,0
c2    Conv + ReLU | 128 filters, 56 x 56 [conv] @3,0
p2    Pool | 28 x 28 [pool] @4,0
gap   Global average pool | 1 x 1 x 128 [pool] @5,0
fc    Linear + softmax | 1000 classes [fc] @6,0
--
img -> c1 : edges, colours
c1 -> p1
p1 -> c2 : textures, parts
c2 -> p2
p2 -> gap : whole objects
gap -> fc
```

Along the network, the **spatial size shrinks** (224 → 112 → 56 → 28) while the **number of channels grows** (3 → 64 → 128). We trade "where" for "what". At the end, a **global average pool** turns each channel into one number, and a linear layer gives the class scores.

## What CNNs are good and bad at

- Good at **local patterns and textures**, with built-in locality. This **inductive bias** makes them data-efficient on images.
- Weaker at **long-range relations** (relations between far-apart parts), which transformers handle with attention.
- Not **rotation or scale invariant** by themselves: they learn it from data augmentation.
- Famous finding: ImageNet CNNs are often **biased towards texture** over shape (an elephant-skin textured cat looks like an elephant). Training on stylised or augmented data helps.

:::interview Questions you may get
- "Why use convolutions for images instead of fully connected layers?" Local connectivity and weight sharing reduce parameters enormously, exploit the 2-D structure, and give translation equivariance.
- "What is the receptive field and how do you increase it?" The input region that affects one unit; grow it with depth, strides/pooling, dilation or larger kernels.
- "Why stacks of 3×3 convolutions instead of one large kernel?" Same receptive field with fewer parameters and more non-linearity.
- "What is the difference between equivariance and invariance?" Equivariance: the output shifts when the input shifts. Invariance: the output does not change. Convolution is equivariant; pooling adds invariance.
- "Why does the number of channels increase with depth?" Spatial resolution falls, so channels carry richer, more abstract features.
:::

```quiz
? What does weight sharing in a conv layer mean?
+ The same filter weights are applied at every position of the image
- All layers share the same weights
- Weights are shared between classes
> It keeps the parameter count small and gives translation equivariance.

? Two stacked 3x3 convolutions (stride 1) have a receptive field of...
- 3 x 3
+ 5 x 5
- 9 x 9
> r = 3 + (3 - 1) × 1 = 5.

? Which property does a convolution layer have?
+ Translation equivariance
- Rotation invariance
- Scale invariance
> Rotation and scale invariance must be learned, for example with augmentation.

? As we go deeper in a typical CNN, how do spatial size and channel count change?
+ The spatial size falls and the channel count rises
- Both rise
- Both fall
> We trade "where" for "what".
```

:::problem A colleague proposes a 5-layer fully connected network for 256×256 RGB images. Give three concrete reasons to use a CNN instead. {level=easy tags="cnn,motivation"}
Use numbers.

:::solution Model answer
(1) **Parameters**: the first layer alone would have 196,608 inputs × hidden units (for 1,000 units, about 200 million weights); a conv layer with 64 3×3 filters has under 2,000 and works for any size. (2) **Generalisation**: sharing the weights across positions means a pattern learned in one place is detected everywhere, so far less data is needed; the fully connected layer must relearn each pattern at each position. (3) **Structure**: convolutions use pixel neighbourhoods and give translation equivariance, so a shifted object gives a shifted response, while the fully connected net treats pixels as an unordered list. It also needs a fixed input size.
:::
:::

:::keypoints
- Fully connected layers on images are huge and ignore structure. CNNs use local connections, shared filters and stacked layers.
- A conv layer has `C_in·C_out·k²` weights, independent of the image size, and is translation equivariant.
- Receptive field grows by `(k_eff−1)·jump` per layer; strides and dilation grow it fast; 3×3 stacks beat large kernels.
- Space shrinks and channels grow with depth; a global average pool and a linear layer produce the class scores.
:::

:::resources
- [CS231n: convolutional networks](https://cs231n.github.io/convolutional-networks/) — the clearest explanation of conv layers and shapes.
- [Araujo et al.: Computing Receptive Fields of Convolutional Neural Networks (Distill)](https://distill.pub/2019/computing-receptive-fields/) — the receptive field formula with pictures.
- [Geirhos et al.: ImageNet-trained CNNs are biased towards texture](https://arxiv.org/abs/1811.12231) — the texture bias paper.
:::
