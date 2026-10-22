---
title: Diffusion Models from Scratch
level: advanced
time: 60
summary: How diffusion models generate images. The forward process that adds noise, the network that learns to remove it, the training loss, sampling (DDPM and DDIM), noise schedules, three equivalent views (noise, score, velocity), and a tiny model you can train and sample from.
---

Today's best image and video generators (Stable Diffusion, DALL·E 3, Imagen, Flux, Sora-like models) are **diffusion models**. The idea is surprisingly simple, and this lesson builds it from the ground up.

:::analogy
Drop a blob of ink in a glass of water. It spreads until the water is uniformly grey: structure is **destroyed** slowly and easily. Now imagine a film of this played **backwards**: the ink gathers back into a blob. Diffusion models learn to play the film backwards. Forward (destroying) is easy and needs no learning. Backward (creating) is what the network learns, **one small step at a time**.
:::

## The forward process: add noise

Start from a real image `x₀`. At each step `t = 1 … T` (T is about 1000), add a **little Gaussian noise**:

`x_t = √(1 − β_t) · x_{t−1} + √β_t · ε`,   `ε ~ N(0, I)`

`β_t` is the **noise schedule** (small numbers such as 0.0001 growing to 0.02). After many steps the image is **pure noise**. A handy shortcut: with `ᾱ_t = ∏(1 − β_s)` we can jump **directly** to any step:

:::formula Jump to step t in one go
`x_t = √ᾱ_t · x₀ + √(1 − ᾱ_t) · ε`
`ᾱ_t` is the fraction of **signal** left (1 at the start, about 0 at the end); `1 − ᾱ_t` is the noise share.
:::

```python run title="The forward process on a real photo" level=intermediate shared
import numpy as np
import cv2
import cvlab

img = cv2.resize(cvlab.image("astronaut"), (160, 160)).astype(np.float32) / 127.5 - 1      # scale to [-1, 1] as diffusion models do
T = 1000
betas = np.linspace(1e-4, 0.02, T)                                                          # the linear schedule of DDPM
abar = np.cumprod(1 - betas)
rng = np.random.default_rng(0)
eps = rng.normal(0, 1, img.shape).astype(np.float32)

def noisy(t):
    return np.sqrt(abar[t]) * img + np.sqrt(1 - abar[t]) * eps

print(" step t | signal kept (abar) | signal-to-noise ratio")
for t in (0, 50, 200, 400, 600, 999):
    print(f"{t:>7} | {abar[t]:>18.4f} | {abar[t] / (1 - abar[t]):>12.4f}")
show = lambda a: ((np.clip(a, -1, 1) + 1) * 127.5).astype(np.uint8)
cvlab.show(show(noisy(0)), "t = 0 (clean)", show(noisy(100)), "t = 100", show(noisy(300)), "t = 300", show(noisy(600)), "t = 600", show(noisy(999)), "t = 999 (pure noise)")
print("a good schedule destroys the image gradually; the cosine schedule (Nichol & Dhariwal) wastes fewer steps in the almost-pure-noise end")
```

## The reverse process: a network that removes noise

If we could reverse each step, we could start from random noise and walk back to a clean image. We train a neural network `ε_θ(x_t, t)` (a **U-Net** or a **transformer**) to **predict the noise that was added**, given the noisy image and the step number `t`.

:::flow Training (one step)
Pick | A real image `x₀`, a random step `t`, and random noise `ε`.
Noise it | `x_t = √ᾱ_t · x₀ + √(1 − ᾱ_t) · ε`.
Predict | The network sees `(x_t, t)` and outputs `ε̂`.
Loss | `‖ε − ε̂‖²`: plain mean squared error. That's the whole objective.
:::

Why predicting the noise teaches generation: to find the noise in a noisy image, the network must know what a **clean image should look like**. Remove its estimate of the noise and you step towards a more realistic image.

:::flow Sampling (generating)
Start | Draw `x_T ~ N(0, I)`: an image of pure noise.
Loop | For `t = T … 1`: predict the noise, subtract a bit of it (`x_{t−1}` = a formula in `x_t` and `ε̂`), and (in DDPM) add a small amount of fresh noise.
Result | `x₀`: a new image that never existed. Different starting noise gives a different image.
:::

## A diffusion model you can train: noise a ring into a Gaussian, and back

Real images are huge, so here the "images" are **points on a circle of radius 2**. The model has to learn the ring shape from noisy points, then generate new points on the ring from pure noise. It uses exactly the algorithm above.

```python local check title="A complete DDPM in about 40 lines (2-D toy data)"
import math
import torch
from torch import nn

torch.manual_seed(0)
device = "cuda" if torch.cuda.is_available() else "cpu"

def data(n):                                                          # the "images": points on a ring of radius 2
    a = torch.rand(n) * 2 * math.pi
    return torch.stack([2 * a.cos(), 2 * a.sin()], 1) + 0.05 * torch.randn(n, 2)

T = 100
betas = torch.linspace(1e-4, 0.05, T, device=device)
alphas = 1 - betas
abar = torch.cumprod(alphas, 0)                                       # alpha-bar_t: how much signal is left at step t

class Eps(nn.Module):                                                 # predicts the noise from (x_t, t)
    def __init__(self, h=128):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(3, h), nn.SiLU(), nn.Linear(h, h), nn.SiLU(), nn.Linear(h, h), nn.SiLU(), nn.Linear(h, 2))
    def forward(self, x, t):
        return self.net(torch.cat([x, (t.float() / T)[:, None]], 1))

model = Eps().to(device)
opt = torch.optim.Adam(model.parameters(), lr=2e-3)
for step in range(4000):
    x0 = data(256).to(device)
    t = torch.randint(0, T, (256,), device=device)
    eps = torch.randn_like(x0)
    xt = abar[t].sqrt()[:, None] * x0 + (1 - abar[t]).sqrt()[:, None] * eps       # jump straight to step t
    loss = ((model(xt, t) - eps) ** 2).mean()                                       # learn to predict the added noise
    opt.zero_grad(); loss.backward(); opt.step()
print("final training loss:", round(loss.item(), 3))

@torch.no_grad()
def sample(n):
    x = torch.randn(n, 2, device=device)                                            # start from pure noise
    for t in reversed(range(T)):
        eps = model(x, torch.full((n,), t, device=device))
        x = (x - betas[t] / (1 - abar[t]).sqrt() * eps) / alphas[t].sqrt()          # remove the predicted noise
        if t > 0:
            x = x + betas[t].sqrt() * torch.randn_like(x)                           # DDPM adds a little fresh noise
    return x

s = sample(3000).cpu()
r = s.norm(dim=1)
print(f"radius of generated points: mean {r.mean():.2f}, std {r.std():.2f}  (data: 2.00, 0.05)")
print(f"angle coverage: {len(set((torch.atan2(s[:, 1], s[:, 0]) / (2 * math.pi) * 12).floor().long().tolist()))} of 12 sectors used")
```

The same code with images (a U-Net instead of the small MLP, `x0` an image batch) is a real diffusion model. Everything else in the next lessons is engineering on top: working in a **latent space**, **text conditioning**, **guidance**, faster **samplers**.

## Three ways to say the same thing

The network can be trained to predict different targets, which are equivalent up to a rescaling:

| Prediction target | Notes |
|---|---|
| **Noise ε** | The DDPM default |
| **Clean image x₀** | Easy to understand; problems at high noise |
| **Velocity v = √ᾱ·ε − √(1−ᾱ)·x₀** | Used in Imagen Video and SD 2.x; more stable at both ends |
| **Score ∇ log p(x_t)** | The "score-based" view: the network points towards more probable images; `score = −ε/√(1−ᾱ)`. The same model, seen through stochastic differential equations (Song et al.) |

**Flow matching / rectified flow** (Flux, Stable Diffusion 3) is a close cousin: it trains the network to predict the **velocity along a straight line** from noise to data, and sampling then solves an ODE with few steps. Simpler maths, straighter paths, fewer steps.

## Sampling: speed

DDPM needs hundreds of network calls per image. Better samplers reach good images in **20–50 steps**:

- **DDIM**: a deterministic version that can **skip steps** (use every 20th timestep). The same noise always gives the same image, and you can interpolate between latent noises.
- **DPM-Solver / DPM++**, **Euler/Heun**, **UniPC**: higher-order ODE solvers, 15–30 steps.
- **Distillation**: train a student to do in 1–4 steps what the teacher does in many (progressive distillation, consistency models, LCM, adversarial distillation as in SDXL-Turbo).

## Details worth knowing

- **Time conditioning**: `t` is turned into a sinusoidal embedding (like transformer positions) and fed to every block, so the network knows the noise level.
- **Noise schedules**: linear, cosine, "shifted" for high resolution (more noise at larger sizes, as signal-to-noise needs to be matched).
- **Loss weighting** across `t` (min-SNR weighting) speeds up training.
- **EMA** of the weights is used for sampling (a smoother model).
- **Likelihood**: diffusion models optimise a variational bound, similar to a hierarchical VAE with fixed encoder.
- **Compared with GANs**: more stable training, better diversity, easy conditioning, but slower sampling (many steps).
- **Compared with autoregressive image models** (e.g. image tokens with a transformer): diffusion generates all pixels in parallel and refines; autoregressive models create a token at a time. Recent models mix them.

:::interview Questions you may get
- "Explain diffusion models in simple terms." A fixed forward process adds noise step by step; a network learns to undo one step; sampling starts from noise and denoises repeatedly.
- "What is the training loss?" MSE between the true noise and the predicted noise for a random timestep: `‖ε − ε_θ(x_t, t)‖²`.
- "Why can we jump directly to step t?" Sums of Gaussians are Gaussian: `x_t = √ᾱ_t x₀ + √(1−ᾱ_t) ε`.
- "Why is sampling slow and how do you speed it up?" It needs many sequential network calls; use DDIM/DPM-Solver (20–50 steps), distillation (1–4 steps), or latent-space models.
- "What does the network input besides the image?" The timestep (noise level) and optional conditions (text, class, image).
- "How are diffusion models different from GANs and VAEs?" Stable MSE training, no adversarial game, good mode coverage; slow multi-step sampling.
:::

```quiz
? What does the network in a DDPM predict (in the standard formulation)?
+ The noise that was added to the clean image
- The class label
- The next token
> ε_θ(x_t, t).

? What is ᾱ_t?
+ The fraction of the original signal that remains at step t
- The learning rate
- The number of steps
> It shrinks from about 1 to about 0.

? Why can we sample the noisy image at step t directly from x₀?
+ Adding independent Gaussian noise repeatedly gives a Gaussian with known mean and variance
- The network stores every step
- Because T is small
> Closed form of the forward process.

? Which technique reduces the number of sampling steps?
+ DDIM or DPM-Solver, and distillation
- Increasing the noise
- Using a bigger batch
> Same model, fewer evaluations.
```

:::problem Your diffusion model produces images with a washed-out, grey average colour and cannot make very dark or very bright images. What could be wrong? {level=hard tags="diffusion,schedule,debugging"}
Think about the last step of the schedule.

:::solution Model answer
The noise schedule does not reach pure noise at the last step (the signal-to-noise ratio at T is not zero), so training never sees pure Gaussian noise, but sampling starts from pure noise: a train/test mismatch: during training the "noise" still contains a little of the image's average colour, which the model learns to use, but sampling from true noise has none, so the model cannot move the overall brightness far from the middle. The fix (Lin et al., "Common diffusion noise schedules and sample steps are flawed"): rescale the schedule to **zero terminal SNR**, use v-prediction (needed at zero SNR), and sample with trailing timesteps and an adjusted guidance rescale. Also check the data normalisation to [-1, 1].
:::
:::

:::keypoints
- Forward: add Gaussian noise gradually; closed form `x_t = √ᾱ_t x₀ + √(1−ᾱ_t) ε`.
- Train a network to predict the noise at a random step with plain MSE; sample by starting from noise and denoising step by step.
- ε-, x₀-, v- and score-prediction, and flow matching, are close relatives; schedules matter (zero terminal SNR).
- Speed: DDIM and ODE solvers (20–50 steps), distillation (1–4 steps), and working in latent space.
:::

:::resources
- [Ho et al.: Denoising Diffusion Probabilistic Models (DDPM)](https://arxiv.org/abs/2006.11239) — the paper that made diffusion practical.
- [Song et al.: Denoising Diffusion Implicit Models (DDIM)](https://arxiv.org/abs/2010.02502) — fast deterministic sampling.
- [Song et al.: Score-Based Generative Modeling through SDEs](https://arxiv.org/abs/2011.13456) — the score and SDE view.
- [Lilian Weng: What are Diffusion Models?](https://lilianweng.github.io/posts/2021-07-11-diffusion-models/) — a clear written explanation.
:::
