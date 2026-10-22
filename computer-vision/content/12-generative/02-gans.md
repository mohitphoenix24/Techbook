---
title: GANs: The Forger and the Detective
level: advanced
time: 45
summary: Generative adversarial networks. The two-player game, the losses, why training is hard (mode collapse, instability), DCGAN, StyleGAN, conditional GANs, image-to-image translation (pix2pix, CycleGAN), and the adversarial and perceptual losses still used inside other models.
---

A **GAN** (Goodfellow et al., 2014) learns to generate images through a **game** between two networks.

:::analogy
A **forger** (the generator, G) paints fake banknotes. A **detective** (the discriminator, D) looks at a mix of real and fake notes and says which are fake. Each time the detective catches a fake, the forger learns what gave it away and improves. Each time the forger improves, the detective has to look harder. In the end, the fakes are so good that the detective can only guess.
:::

## The two networks

- **Generator `G(z)`**: takes random noise `z` and outputs an image. (Upsampling layers: transposed convolutions or upsample + conv.)
- **Discriminator `D(x)`**: takes an image and outputs the probability that it is **real**. (An ordinary CNN classifier.)

:::formula The GAN objective
`min_G max_D  E_x[ log D(x) ] + E_z[ log(1 − D(G(z))) ]`
D tries to give high scores to real images and low scores to fakes; G tries to make D score fakes high. In practice G minimises the "non-saturating" loss `−log D(G(z))`, which gives stronger gradients early on.
:::

Training alternates: one step for D (real batch label 1, fake batch label 0), one step for G (make the fake batch be called real).

```python local check title="A GAN learning a 1-D distribution (a mixture of two bumps)"
import torch
from torch import nn

torch.manual_seed(0)
def real_batch(n):                                                    # target: half the points near -2, half near +2
    c = (torch.rand(n, 1) < 0.5).float()
    return c * (2 + 0.3 * torch.randn(n, 1)) + (1 - c) * (-2 + 0.3 * torch.randn(n, 1))

G = nn.Sequential(nn.Linear(4, 32), nn.ReLU(), nn.Linear(32, 32), nn.ReLU(), nn.Linear(32, 1))
D = nn.Sequential(nn.Linear(1, 32), nn.LeakyReLU(0.2), nn.Linear(32, 32), nn.LeakyReLU(0.2), nn.Linear(32, 1))
gopt = torch.optim.Adam(G.parameters(), lr=1e-3, betas=(0.5, 0.999))
dopt = torch.optim.Adam(D.parameters(), lr=1e-3, betas=(0.5, 0.999))
bce = nn.BCEWithLogitsLoss()
ones, zeros = torch.ones(128, 1), torch.zeros(128, 1)

for step in range(3000):
    # 1. train the detective
    x = real_batch(128); fake = G(torch.randn(128, 4)).detach()       # detach: do not update G in this step
    dloss = bce(D(x), ones) + bce(D(fake), zeros)
    dopt.zero_grad(); dloss.backward(); dopt.step()
    # 2. train the forger: wants D to say "real" for fakes (non-saturating loss)
    gloss = bce(D(G(torch.randn(128, 4))), ones)
    gopt.zero_grad(); gloss.backward(); gopt.step()

with torch.no_grad():
    s = G(torch.randn(5000, 4)).squeeze()
print(f"fake samples: {float((s > 0).float().mean()):.2f} of them in the right bump (target 0.50)")
print(f"left bump mean {float(s[s < 0].mean()):.2f} (target -2.0), right bump mean {float(s[s > 0].mean()):.2f} (target 2.0)")
print(f"last losses: D {dloss.item():.2f}, G {gloss.item():.2f}  (D near 1.39 = 2*log2 means it cannot tell them apart)")
```

## Why GANs are hard to train

| Problem | What happens | Fixes |
|---|---|---|
| **Mode collapse** | G produces only a few kinds of image (a single digit) that fool D | Minibatch discrimination, unrolled GANs, Wasserstein loss, diversity loss, more modes in data |
| **Unstable training** | D wins and G gets no useful gradient, or both oscillate | Balanced learning rates, two-time-scale update (TTUR), spectral normalisation, gradient penalty, R1 penalty |
| **Vanishing gradients** | Saturating loss when D is perfect | Non-saturating loss, WGAN |
| **No likelihood and no good loss curve** | You cannot tell progress from the loss | Look at samples and use FID |
| **Sensitive to hyper-parameters** | Small changes break training | Use proven recipes (DCGAN guidelines, StyleGAN2 code) |

**Wasserstein GAN (WGAN)** replaces the probability with a distance-like score (the critic is Lipschitz-limited, by weight clipping or a **gradient penalty**), giving a loss that correlates with sample quality and trains more smoothly.

## A short family tree

- **DCGAN (2015)**: the stable recipe for convolutional GANs: strided convolutions, batch norm, ReLU/LeakyReLU, no fully connected layers.
- **Conditional GAN (cGAN)**: give G and D a **label or other input** (a class, a sketch) so you control what is generated.
- **pix2pix (2016)**: paired image-to-image translation (sketch → photo, day → night, map → satellite). A conditional GAN with a **U-Net generator**, a **PatchGAN discriminator** (judges every 70×70 patch real or fake) and an **L1 loss** to the ground truth.
- **CycleGAN (2017)**: **unpaired** translation (horse ↔ zebra). Two generators and a **cycle-consistency loss**: translating there and back must return the original image.
- **Progressive GAN, BigGAN**: grow resolution gradually; scale up with large batches and class conditioning.
- **StyleGAN / StyleGAN2 / StyleGAN3 (NVIDIA)**: a mapping network turns `z` into a style vector `w` that controls each layer through adaptive normalisation. Gives photo-realistic faces, smooth latent interpolation and **disentangled** control of coarse (pose) to fine (colour) attributes; the basis of "this person does not exist".
- **GAN inversion and editing**: find the latent `w` of a real photo and change attributes.
- **Super-resolution and restoration**: SRGAN, ESRGAN, Real-ESRGAN, GFPGAN use adversarial plus perceptual losses to create sharp textures.

## Where GANs still matter

Diffusion models (next lessons) have taken over general image generation, because they train stably and cover the data distribution better. But GAN ideas remain **everywhere**:

- The **adversarial loss** sharpens the autoencoders used in Stable Diffusion (VQGAN-style training).
- **Perceptual loss** (LPIPS: distance between deep features rather than pixels) is used in super-resolution, VAEs and image editing.
- GANs are **fast** (one forward pass) so they are used where latency matters: real-time super-resolution, video upscaling, face enhancement, and **distilled one-step diffusion** (adversarial distillation, e.g. SDXL-Turbo).
- **Domain adaptation and synthetic-to-real** translation (CycleGAN) for training data in robotics and autonomous driving, with care about artefacts.

## Hints for using generated images as training data

Generated images can help with rare classes or domain gaps, but: they may carry subtle artefacts that the model learns to detect instead of the real feature; they can **hallucinate** wrong details; check the real validation set (never test on synthetic data only); mix with real data; check diversity (a collapsed GAN adds nothing).

:::interview Questions you may get
- "Explain how a GAN is trained." Alternate: D learns to separate real from fake, G learns to fool D; the generator gradient flows through D.
- "What is mode collapse?" G produces a small subset of the real variety; the fixes include WGAN, minibatch features, and diversity terms.
- "How do pix2pix and CycleGAN differ?" pix2pix needs paired data (conditional GAN + L1); CycleGAN is unpaired, using cycle-consistency.
- "Why are GANs hard to evaluate?" The loss does not reflect quality; use FID/precision–recall and visual inspection.
- "Why did diffusion overtake GANs?" Stable training, better coverage of modes, easy conditioning (text) and strong quality; cost is slower sampling.
- "What is a PatchGAN?" A discriminator that outputs a real/fake score for each local patch, focusing on high-frequency texture.
:::

```quiz
? What does the discriminator output?
+ The probability that an input image is real
- The next pixel
- The class label
> It is a binary classifier.

? What is mode collapse?
+ The generator produces only a narrow set of outputs
- The discriminator stops training
- The loss becomes negative
> Lack of diversity.

? What is the cycle-consistency loss in CycleGAN?
+ Translating to the other domain and back should return the original image
- The two generators must share weights
- The discriminator must output 0.5
> It allows unpaired training.

? What does a perceptual loss (LPIPS) compare?
+ Deep-network features of two images
- Their file sizes
- Their histograms only
> Better aligned with human perception than raw pixel difference.
```

:::problem Your GAN's discriminator loss goes to nearly 0 within a few hundred steps and the generator's samples are noise. What is happening and what would you try? {level=medium tags="gan,debugging"}
Think about balance between the two players.

:::solution Model answer
The discriminator is winning too easily, so it gives the generator saturated, uninformative gradients. Try: the non-saturating generator loss; lower the discriminator's learning rate or train G more often; spectral normalisation or a gradient penalty (R1/WGAN-GP); add noise or augmentation to D's inputs (DiffAugment/ADA); check that real and fake batches are normalised the same way; use a proven architecture (DCGAN/StyleGAN2) and watch the samples every few hundred steps.
:::
:::

:::keypoints
- GAN: generator (noise → image) versus discriminator (real or fake); alternate updates with the non-saturating loss.
- Hard to train (mode collapse, instability); WGAN, spectral norm, gradient penalties and augmentation help.
- Conditional GANs, pix2pix (paired), CycleGAN (unpaired) and StyleGAN (style-based, disentangled) are the key variants.
- Diffusion has replaced GANs for general generation, but adversarial and perceptual losses live on in autoencoders, super-resolution and fast distilled generators.
:::

:::resources
- [Goodfellow et al.: Generative Adversarial Networks](https://arxiv.org/abs/1406.2661) — the original paper.
- [Isola et al.: Image-to-Image Translation with Conditional Adversarial Networks (pix2pix)](https://arxiv.org/abs/1611.07004) — paired translation.
- [Zhu et al.: Unpaired Image-to-Image Translation using Cycle-Consistent Adversarial Networks (CycleGAN)](https://arxiv.org/abs/1703.10593) — unpaired translation.
- [Karras et al.: A Style-Based Generator Architecture for GANs (StyleGAN)](https://arxiv.org/abs/1812.04948) — style-based generation.
:::
