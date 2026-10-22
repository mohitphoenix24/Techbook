---
title: Evaluating Generative Models
level: advanced
time: 40
summary: How to tell if generated images are good. FID, Inception Score, precision and recall for quality versus diversity (with a runnable demo), CLIPScore for text alignment, LPIPS and PSNR/SSIM for reconstruction, human evaluation, and the pitfalls.
---

Evaluating generation is hard because there is **no single correct answer** for a given prompt. We measure three separate things:

| Quality | Diversity | Alignment |
|---|---|---|
| Do individual images look real? | Does the model cover the whole variety of the data, not just a few modes? | Does the image match the prompt or condition? |

## Fréchet Inception Distance (FID)

Compute deep features (usually the 2048-d pool layer of Inception-v3) for a set of **real** images and a set of **generated** images. Fit a **Gaussian** to each set (mean `μ` and covariance `Σ`) and measure the distance between the two Gaussians:

:::formula FID
`FID = ‖μ_r − μ_g‖² + Tr( Σ_r + Σ_g − 2 (Σ_r Σ_g)^{1/2} )`
**Lower is better**; 0 means the feature statistics match. Real-versus-real gives a small positive number that depends on the sample size.
:::

Needs **thousands** of images (10 k–50 k) to be stable; use the same count and the same pre-processing every time. The next demo uses simple PCA features on digits instead of Inception, so it runs in your browser, and also computes **precision and recall** for generative models (Kynkäänniemi et al.):

- **Precision**: what share of generated samples fall inside the region of the real data (quality, "realism").
- **Recall**: what share of real samples are covered by the generated distribution (diversity, "coverage").

```python run title="FID, precision and recall on degraded and mode-dropped sets" level=advanced
import numpy as np, cv2
from scipy import linalg
from sklearn.datasets import load_digits
from sklearn.decomposition import PCA
from sklearn.neighbors import NearestNeighbors

X, y = load_digits(return_X_y=True)
X = X / 16.0
rng = np.random.default_rng(0)
idx = rng.permutation(len(X)); real, fake_base = X[idx[:900]], X[idx[900:]]
ylab = y[idx[900:]]
feat = PCA(16, random_state=0).fit(real)                          # stand-in for the Inception feature extractor

def fid(a, b):
    fa, fb = feat.transform(a), feat.transform(b)
    ma, mb = fa.mean(0), fb.mean(0); ca, cb = np.cov(fa.T), np.cov(fb.T)
    covmean = linalg.sqrtm(ca @ cb).real
    return float(((ma - mb) ** 2).sum() + np.trace(ca + cb - 2 * covmean))

def pr(real, fake, k=3):
    fr, ff = feat.transform(real), feat.transform(fake)
    nr = NearestNeighbors(n_neighbors=k + 1).fit(fr); rr = nr.kneighbors(fr)[0][:, -1]        # radius of each real point's k-NN ball
    nf = NearestNeighbors(n_neighbors=k + 1).fit(ff); rf = nf.kneighbors(ff)[0][:, -1]
    dist_to_real = NearestNeighbors(n_neighbors=1).fit(fr).kneighbors(ff)[0][:, 0]
    precision = float(np.mean([(np.linalg.norm(fr - f, axis=1) <= rr).any() for f in ff]))
    recall = float(np.mean([(np.linalg.norm(ff - r, axis=1) <= rf).any() for r in fr]))
    return precision, recall

imgs = fake_base.reshape(-1, 8, 8)
tests = {
 "held-out real digits": fake_base,
 "slight noise": np.clip(fake_base + rng.normal(0, 0.1, fake_base.shape), 0, 1),
 "heavy noise": np.clip(fake_base + rng.normal(0, 0.4, fake_base.shape), 0, 1),
 "blurred": np.array([cv2.GaussianBlur(i, (3, 3), 1.0).ravel() for i in imgs]),
 "only digits 0-4 (mode dropping)": fake_base[ylab < 5],
 "only digit 1": fake_base[ylab == 1],
}
for name, f in tests.items():
    p, r = pr(real, f)
    print(f"{name:<34} n={len(f):>4}  FID {fid(real, f):7.2f}  precision {p:.2f}  recall {r:.2f}")
```

Read the table: **noise and blur** hurt precision (low quality) and FID; **dropping classes** keeps precision high (what it makes is fine) but recall falls (low diversity), and FID rises. A single FID number cannot tell you which failure you have, so also look at precision and recall. Also note how weak noise barely changed FID here: **the metric only sees what the feature extractor sees** (our 16 PCA components ignore small noise).

## Other metrics

| Metric | Measures | Notes |
|---|---|---|
| **Inception Score (IS)** | Confident and varied class predictions | Old; ignores real data; blind to intra-class variety |
| **FID / FD-DINOv2 / KID** | Distance between feature distributions | FD with DINOv2 features is increasingly preferred; KID is unbiased for small samples |
| **Precision / Recall / Density-Coverage** | Quality versus diversity | Use with FID |
| **CLIPScore** | Cosine similarity between the image and prompt embedding (CLIP) | Text alignment; weak for counting and relations |
| **PickScore, HPSv2, ImageReward** | Learned human-preference models | Correlate with human votes; can be gamed |
| **GenEval, T2I-CompBench, DPG-Bench** | Compositional prompts: counts, colours, positions | Uses detectors/VLMs to check |
| **LPIPS** | Deep-feature distance between two images | For reconstruction, super-resolution and perceptual similarity |
| **PSNR / SSIM** | Pixel-level and structural fidelity | For restoration and compression (not for generation: they prefer blur) |
| **Human evaluation** | Side-by-side preferences, Elo ranking (e.g. Arena) | The gold standard; expensive; needs many raters and clear instructions |

```python run title="PSNR rewards blur: why pixel metrics mislead for generation" level=intermediate
import numpy as np
import cv2
import cvlab

truth = cvlab.image("astronaut", gray=True)
sharp_but_shifted = np.roll(truth, 2, axis=1)                                     # sharp, realistic, but slightly misplaced detail
blurry = cv2.GaussianBlur(truth, (0, 0), 3)                                       # a washed-out average that has no sharp detail
psnr = lambda a, b: 10 * np.log10(255 ** 2 / np.mean((a.astype(float) - b.astype(float)) ** 2))
sharpness = lambda a: cv2.Laplacian(a, cv2.CV_64F).var()
print(f"shifted by 2 px: PSNR {psnr(sharp_but_shifted, truth):5.2f} dB, sharpness {sharpness(sharp_but_shifted):7.1f}")
print(f"blurred        : PSNR {psnr(blurry, truth):5.2f} dB, sharpness {sharpness(blurry):7.1f}")
print("the blurry image has the HIGHER PSNR though a person finds the shifted-but-sharp one more realistic; this is why generators are judged with FID, LPIPS and human studies")
cvlab.show(truth, "Reference", sharp_but_shifted, "Sharp, shifted (lower PSNR)", blurry, "Blurry (higher PSNR)")
```

## Pitfalls

- **FID is biased by sample size and pre-processing** (resizing method, JPEG compression, image count). Compare only numbers computed with the *same* code (for example `clean-fid`) and the same Inception weights.
- **FID uses ImageNet features**, which are weak on faces, medical or sketch domains; use domain features.
- **Memorisation**: a model that copies training images gets a great FID. Check nearest neighbours in the training set.
- **Text alignment** metrics are weak on counting, left/right, negation; use targeted benchmarks and human review.
- **Metric hacking**: optimising a preference model (PickScore) can yield oversaturated, similar-looking images. Keep human checks.
- **Prompt set matters**: evaluate on varied prompts, with several seeds each.
- **Conditional vs unconditional**: report CFG scale; FID usually improves at moderate guidance and worsens when it is too high, while CLIPScore keeps rising. Plot the **FID-versus-CLIPScore** trade-off curve.

## A practical evaluation plan

1. A fixed **prompt/test set** with several seeds per prompt.
2. **Automatic**: FID (or FD-DINOv2) on 10 k samples, CLIPScore, a compositional benchmark, precision/recall.
3. **Task-specific checks**: OCR accuracy for text, face/identity similarity for personalisation, detector recall for synthetic training data.
4. **Human side-by-side** on 100–300 prompts with at least 3 raters each, randomised order.
5. **Downstream usefulness** (when generating training data): accuracy gain on a real validation set.

:::interview Questions you may get
- "How is FID computed and what are its weaknesses?" Gaussians fitted to Inception features of real and generated images; Fréchet distance. Sample-size dependent, ImageNet-biased, blind to certain failures, hackable by memorisation.
- "How do you measure diversity versus quality?" Precision/recall (or density/coverage), alongside FID.
- "How would you evaluate text-to-image alignment?" CLIPScore, VQA-based or detector-based compositional benchmarks, human ratings.
- "Why is PSNR a poor metric for generative super-resolution?" It rewards blurry averages; use LPIPS, FID and human preference too.
- "How do you know a generative model is not memorising?" Nearest-neighbour search against the training set in feature space; membership checks.
:::

```quiz
? What does a lower FID mean?
+ The generated images' feature statistics are closer to the real images'
- The images are larger
- The model is smaller
> It compares means and covariances.

? Precision high, recall low means…
+ Realistic samples but too little variety (mode dropping)
- Poor quality but wide variety
- A perfect model
> Quality without coverage.

? Why is PSNR misleading for generated details?
+ It prefers blurry averages over sharp but slightly different details
- It needs a GPU
- It only works on grey images
> Pixel-wise comparison.

? What should you check if a model has a surprisingly excellent FID?
+ Memorisation of the training data
- The batch size only
- Colour space
> Search nearest training neighbours.
```

:::problem A team reports that their new image generator improves FID from 12 to 9, but users complain that all pictures look alike. What do you check? {level=medium tags="fid,diversity"}
Think about what FID hides.

:::solution Model answer
FID mixes quality and diversity and can improve through higher guidance or sharper but less varied images. Check precision/recall (recall should not drop), diversity across seeds for the same prompt (LPIPS/embedding spread), the guidance scale used for the FID evaluation versus production, memorisation, and the prompt set. Run a human side-by-side test on varied prompts, and plot FID versus CLIPScore across guidance values to choose a good operating point.
:::
:::

:::keypoints
- Evaluate quality, diversity and alignment separately: FID (or FD-DINOv2), precision/recall, CLIPScore and compositional benchmarks, human preference.
- FID compares Gaussian fits of deep features; it needs thousands of samples and consistent code and is blind to some failures.
- PSNR/SSIM suit restoration, not generation; LPIPS is a perceptual alternative.
- Watch for memorisation, metric hacking and guidance effects; always add human evaluation and downstream task tests.
:::

:::resources
- [Heusel et al.: GANs Trained by a Two Time-Scale Update Rule Converge to a Local Nash Equilibrium (FID)](https://arxiv.org/abs/1706.08500) — introduces FID.
- [Kynkäänniemi et al.: Improved Precision and Recall Metric for Assessing Generative Models](https://arxiv.org/abs/1904.06991) — precision and recall.
- [Zhang et al.: The Unreasonable Effectiveness of Deep Features as a Perceptual Metric (LPIPS)](https://arxiv.org/abs/1801.03924) — LPIPS.
- [Parmar et al.: On Aliased Resizing and Surprising Subtleties in GAN Evaluation (clean-fid)](https://arxiv.org/abs/2104.11222) — pitfalls of computing FID.
:::
