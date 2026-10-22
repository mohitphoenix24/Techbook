---
title: Autoencoders and VAEs
level: advanced
time: 45
summary: Compress an image to a small code and rebuild it. The autoencoder, why a plain one cannot generate, the variational autoencoder (the reparameterisation trick and the KL term), denoising and masked autoencoders, and VQ-VAE, the tokenizer behind modern image generators.
---

Generative models learn **what images look like** well enough to **make new ones**. We start with the simplest idea and build up to the pieces used inside Stable Diffusion.

## Autoencoder: squeeze, then rebuild

An **autoencoder** has two parts:

- an **encoder** that squeezes an image into a short vector, the **code** or **latent** `z` (for example 32 numbers instead of 784 pixels);
- a **decoder** that rebuilds the image from `z`.

Train it to make the output equal to the input (loss: pixel MSE). Because the code is small (a **bottleneck**), the network must keep only the important structure. Uses: compression, denoising, anomaly detection (bad reconstruction means "unusual"), features.

A **linear** autoencoder with MSE learns the same space as **PCA**. Non-linear layers make it more powerful. Below we use PCA as the autoencoder: it shows the bottleneck idea in a few lines and runs in the browser.

```python run title="A linear autoencoder (PCA): the code size decides the quality" level=intermediate shared
import numpy as np
from sklearn.datasets import load_digits
from sklearn.decomposition import PCA
import cvlab

X, y = load_digits(return_X_y=True)
X = X / 16.0
print("code size | pixel MSE | variance kept")
for k in (2, 5, 10, 20, 40):
    pca = PCA(k, random_state=0).fit(X)
    rec = pca.inverse_transform(pca.transform(X))                       # encode then decode
    print(f"{k:>9} | {np.mean((rec - X) ** 2):.4f}    | {pca.explained_variance_ratio_.sum():.1%}")

pca = PCA(10, random_state=0).fit(X)
sel = [np.where(y == d)[0][0] for d in range(10)]
rec = pca.inverse_transform(pca.transform(X[sel]))
big = lambda a: (np.kron(a.reshape(10, 8, 8).transpose(1, 0, 2).reshape(8, 80), np.ones((6, 6))) * 255).astype(np.uint8)
cvlab.show(big(X[sel]), "Originals (64 numbers each)", big(rec), "Rebuilt from a 10-number code")
```

### The problem: a plain autoencoder cannot generate

Pick a random code and decode it: you usually get **garbage**, because the codes of real images occupy scattered islands in the latent space, with gaps between. The decoder never learned what the gaps mean.

## Variational autoencoder (VAE)

A **VAE** (Kingma and Welling, 2013) fixes this by making the latent space **smooth and well-organised**:

1. The encoder outputs not one code but a **distribution**: a mean `μ` and a standard deviation `σ`. We **sample** `z = μ + σ·ε` with `ε ~ N(0, 1)`. This is the **reparameterisation trick**: the randomness is moved to `ε`, so gradients can flow through `μ` and `σ`.
2. The loss has two parts:

:::formula VAE loss (the negative ELBO)
`L = reconstruction error  +  β · KL( N(μ, σ²) ‖ N(0, 1) )`
The **KL term** pulls every image's distribution towards a standard normal. The codes therefore overlap and fill the space around the origin, so **sampling `z ~ N(0, 1)` and decoding gives a plausible image**.
:::

The two terms fight: reconstruction wants distinct, precise codes; KL wants them all alike. `β` balances them (β-VAE gives more disentangled but blurrier results). If KL wins completely, the decoder ignores the code and every sample looks the same: **posterior collapse**. Watch the KL value during training; it should not sit near zero. VAE images tend to be **blurry** because the reconstruction loss averages over possibilities.

```python local check title="A tiny VAE on digits: reparameterisation, KL, and sampling new images"
import numpy as np
import torch
from torch import nn
from sklearn.datasets import load_digits

torch.manual_seed(0)
X, y = load_digits(return_X_y=True)
X = torch.tensor(X / 16.0, dtype=torch.float32)

class VAE(nn.Module):
    def __init__(self, d=64, h=128, z=4):
        super().__init__()
        self.enc = nn.Sequential(nn.Linear(d, h), nn.ReLU())
        self.mu, self.logvar = nn.Linear(h, z), nn.Linear(h, z)
        self.dec = nn.Sequential(nn.Linear(z, h), nn.ReLU(), nn.Linear(h, d), nn.Sigmoid())
    def forward(self, x):
        h = self.enc(x)
        mu, logvar = self.mu(h), self.logvar(h)
        z = mu + torch.exp(0.5 * logvar) * torch.randn_like(mu)          # reparameterisation trick
        return self.dec(z), mu, logvar

def loss_fn(x, rec, mu, logvar, beta=0.05):                              # beta=1 with this loss scale collapses: the decoder ignores z (try it)
    recon = ((rec - x) ** 2).sum(1).mean()
    kl = (-0.5 * (1 + logvar - mu ** 2 - logvar.exp()).sum(1)).mean()    # closed form KL to N(0, I)
    return recon + beta * kl, recon.item(), kl.item()

m = VAE(); opt = torch.optim.Adam(m.parameters(), lr=2e-3)
for epoch in range(120):
    perm = torch.randperm(len(X))
    for i in range(0, len(X), 128):
        xb = X[perm[i:i + 128]]
        rec, mu, logvar = m(xb)
        loss, r, k = loss_fn(xb, rec, mu, logvar)
        opt.zero_grad(); loss.backward(); opt.step()
print(f"final reconstruction error per image: {r:.2f}   KL per image: {k:.2f} nats")

with torch.no_grad():
    new = m.dec(torch.randn(500, 4))                                       # sample codes from the prior and decode
    # does a digit classifier (trained on real digits) recognise the samples? compare with decoding random uniform noise
    from sklearn.linear_model import LogisticRegression
    clf = LogisticRegression(max_iter=3000).fit(X.numpy(), y)
    conf_gen = clf.predict_proba(new.numpy()).max(1).mean()
    conf_noise = clf.predict_proba(torch.rand(500, 64).numpy()).max(1).mean()
print(f"classifier confidence on VAE samples: {conf_gen:.2f}  vs on random noise images: {conf_noise:.2f}")
print("digits found among 500 samples:", np.bincount(clf.predict(new.numpy()), minlength=10).tolist(), "(varied, so not collapsed to one image)")
print("the samples are recognisable because the KL term made the latent space smooth around N(0, 1)")
```

## Other autoencoders

- **Denoising autoencoder**: feed a **corrupted** image, ask for the clean one. Learns robust features; the idea behind diffusion models.
- **Masked autoencoder (MAE)**: hide patches and predict them (last module).
- **Sparse and contractive** autoencoders add penalties for compact features.
- **VQ-VAE** (next section) for discrete codes.

## VQ-VAE and VQGAN: images as tokens

A **VQ-VAE** replaces the continuous code with a choice from a **codebook** of K learned vectors (for example K = 8192): each position of the encoder's small feature grid is **snapped to the nearest codebook entry**. An image becomes a **grid of integers** (for example 32 × 32 = 1024 tokens). Benefits:

- Sharp results; compact; an image is now a **sequence of tokens** so an autoregressive transformer can model it like text (**DALL·E 1, Parti, VQGAN + transformer**).
- Training the nearest-codebook step uses a **straight-through estimator** (copy gradients past the non-differentiable arg-min) and a **commitment loss**.
- **VQGAN** adds an adversarial (GAN) loss and a perceptual loss to make the reconstructions sharp, and is the "tokenizer" in many systems. The VAE inside **Stable Diffusion** is a related, continuous, GAN-trained autoencoder (see the diffusion lessons).

```python run title="Vector quantisation: snap each vector to the nearest codebook entry" level=intermediate
import numpy as np

rng = np.random.default_rng(0)
codebook = rng.normal(0, 1, (8, 4))                         # K = 8 codes, each a vector of 4 numbers
features = rng.normal(0, 1, (6, 4))                         # encoder outputs for 6 positions of a tiny image
dist = ((features[:, None, :] - codebook[None, :, :]) ** 2).sum(-1)
ids = dist.argmin(1)                                        # the discrete token for each position
quantised = codebook[ids]
print("token ids:", ids.tolist())
print("mean squared quantisation error:", round(float(((features - quantised) ** 2).mean()), 3))
print("bits needed per token:", int(np.log2(len(codebook))), " -> a 32x32 grid with K=8192 is 1024 tokens x 13 bits =", 1024 * 13, "bits")
```

## Why this matters for interviews and for real work

- **Anomaly detection**: train an autoencoder on normal images; defects reconstruct badly. (Caveat: very strong autoencoders reconstruct anything; check on real defects.)
- **Latent space tricks**: interpolate between two codes, do arithmetic, find directions.
- **Tokenizers for generation**: modern generators (Stable Diffusion, Sora-like video models, DALL·E) work in the **latent space of an autoencoder**, not in pixels, to save compute.

:::interview Questions you may get
- "What is the difference between an autoencoder and a VAE?" A VAE encodes to a distribution and adds a KL term so the latent space is smooth and sampleable; a plain autoencoder can only reconstruct.
- "What is the reparameterisation trick?" Writing `z = μ + σ ε` so that the sampling noise is independent of the parameters and backpropagation works.
- "What are the two terms of the VAE loss?" Reconstruction plus KL divergence to the prior; their balance is controlled by β.
- "Why are VAE samples blurry?" The reconstruction loss (MSE) averages over plausible outputs; adding adversarial or perceptual losses sharpens them.
- "What is VQ-VAE and why is it useful?" Discrete codebook latents, turning images into token sequences for transformers and compact latent spaces for diffusion.
- "How can an autoencoder detect defects?" Reconstruction error or feature distance is high for unseen patterns.
:::

```quiz
? Why can't you generate new images by decoding random codes of a plain autoencoder?
+ The latent space has gaps; the decoder never learned what random codes mean
- The decoder is too small
- It has no encoder
> A VAE's KL term fills the space.

? What does the KL term in the VAE loss do?
+ Pulls the encoded distributions towards N(0, 1), making the latent space smooth
- Improves the reconstruction
- Removes noise from images
> It regularises the latent space.

? What is the point of the reparameterisation trick?
+ Allow gradients to pass through a random sampling step
- Make the decoder faster
- Quantise the latent
> z = μ + σ ε.

? What does VQ-VAE output for an image?
+ A grid of discrete codebook indices
- A probability distribution over classes
- A bounding box
> Image tokens.
```

:::problem You trained an autoencoder on normal metal surfaces to find scratches, but it reconstructs scratches perfectly, so the anomaly score is useless. Why does this happen and what can you do? {level=medium tags="anomaly,autoencoder"}
Think about capacity and what the bottleneck allows.

:::solution Model answer
The network is too powerful or the bottleneck too wide: it learned a near-identity mapping (local texture copying), so it reconstructs anything, including scratches. Fixes: a tighter bottleneck, denoising or masking during training (so it must infer, not copy), a perceptual/feature-space loss, memory-augmented or VQ models, or move to feature-based anomaly methods such as PatchCore, PaDiM or student–teacher distillation, which work better on industrial surfaces (see the anomaly detection lesson). Evaluate with image-level AUROC and pixel-level maps on real defects.
:::
:::

:::keypoints
- An autoencoder compresses and rebuilds; the bottleneck forces useful features, but a plain one cannot generate.
- A VAE encodes a distribution, samples with the reparameterisation trick, and adds a KL term so that decoding `z ~ N(0, 1)` yields plausible, if blurry, images.
- VQ-VAE/VQGAN turn images into discrete tokens; diffusion models work in the latent space of such an autoencoder.
- Autoencoders are also used for denoising, anomaly detection and as tokenizers.
:::

:::resources
- [Kingma and Welling: Auto-Encoding Variational Bayes](https://arxiv.org/abs/1312.6114) — the VAE paper.
- [van den Oord et al.: Neural Discrete Representation Learning (VQ-VAE)](https://arxiv.org/abs/1711.00937) — discrete latents.
- [Esser et al.: Taming Transformers for High-Resolution Image Synthesis (VQGAN)](https://arxiv.org/abs/2012.09841) — VQ with an adversarial loss.
:::
