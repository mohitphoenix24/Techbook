---
title: Matching Features — Brute Force, Ratio Test, FLANN
level: intermediate
time: 35
summary: Find which keypoint in picture A corresponds to which in picture B. Nearest neighbour search, why plain nearest neighbour gives many wrong matches, Lowe's ratio test, cross-check, FLANN for speed, evaluating matches with ground truth, and learned matchers.
---

You have keypoints and descriptors in picture A and picture B. Now: **which keypoint in A is the same real-world point as which keypoint in B?** This is **feature matching**.

## Nearest neighbour

The simple rule: for each descriptor in A, find the descriptor in B with the **smallest distance**. This is **brute-force matching**: compare every descriptor in A with every descriptor in B (`N × M` distances).

```python run title="Brute-force nearest neighbour matching" level=easy
import cv2
import numpy as np
import cvlab

a, b, H = cvlab.warped_pair("coffee")
ga, gb = [cv2.cvtColor(x, cv2.COLOR_RGB2GRAY) for x in (a, b)]
sift = cv2.SIFT_create()
ka, da = sift.detectAndCompute(ga, None)
kb, db = sift.detectAndCompute(gb, None)

bf = cv2.BFMatcher(cv2.NORM_L2, crossCheck=False)
matches = bf.match(da, db)                                  # one best match per descriptor of A
matches = sorted(matches, key=lambda m: m.distance)

def n_correct(ms):
    src = np.float32([ka[m.queryIdx].pt for m in ms]); dst = np.float32([kb[m.trainIdx].pt for m in ms])
    err = np.linalg.norm(cv2.perspectiveTransform(src[None], H)[0] - dst, axis=1)
    return int((err < 3).sum())

print("matches:", len(matches), " correct:", n_correct(matches), " precision:", round(n_correct(matches) / len(matches), 2))
print("best 50 only: correct", n_correct(matches[:50]), "of 50")
```

Many matches are wrong. Why? Some keypoints in A **do not exist in B** at all (they left the picture, or the detector missed them). The matcher still returns the "closest" descriptor, which is a wrong match. And on repetitive textures (windows, tiles), several candidates look the same.

## Lowe's ratio test

David Lowe's clever fix: look at the **two** best matches for a descriptor, with distances `d1 ≤ d2`.

- If the match is **right**, the best one is much closer than the second best: `d1 ≪ d2`.
- If the match is **wrong or ambiguous**, there are several similar candidates: `d1 ≈ d2`.

So **keep the match only if `d1 / d2 < 0.75`** (0.7–0.8 are typical). Lowe measured that this removes about 90% of the false matches while losing only about 5% of the correct ones.

```python run title="The ratio test removes ambiguous matches" level=easy
import cv2
import numpy as np
import cvlab

a, b, H = cvlab.warped_pair("coffee")
ga, gb = [cv2.cvtColor(x, cv2.COLOR_RGB2GRAY) for x in (a, b)]
sift = cv2.SIFT_create()
ka, da = sift.detectAndCompute(ga, None)
kb, db = sift.detectAndCompute(gb, None)

knn = cv2.BFMatcher(cv2.NORM_L2).knnMatch(da, db, k=2)           # the two best candidates for each descriptor

def correct(m):
    p = np.float32([[ka[m.queryIdx].pt]]); q = np.float32(kb[m.trainIdx].pt)
    return np.linalg.norm(cv2.perspectiveTransform(p, H)[0, 0] - q) < 3

print("ratio threshold   kept   correct   precision")
for ratio in (1.0, 0.9, 0.8, 0.7, 0.6):
    kept = [m for m, n in knn if m.distance < ratio * n.distance]
    ok = sum(correct(m) for m in kept)
    print(f"{ratio:14.1f} {len(kept):6d} {ok:9d} {ok / max(len(kept), 1):10.2f}")
```

Lower ratios give fewer matches but a higher share of correct ones. You choose the balance: RANSAC (the next lesson) can handle some wrong matches, but not too many.

## Cross-check (mutual nearest neighbours)

Another filter: keep a match `(i in A, j in B)` only if **`i` is the best match of `j` and `j` is the best match of `i`**. Both must agree. In OpenCV: `BFMatcher(crossCheck=True)`. It is stricter and simple; the ratio test usually works better, and they can be combined.

## Speed: FLANN and approximate search

Brute force costs `N × M`. With 10,000 keypoints per picture that is 100 million distances. **FLANN** (Fast Library for Approximate Nearest Neighbours) builds a search structure and finds **approximate** nearest neighbours much faster:

- For float descriptors (SIFT): **KD-trees** (several randomised trees).
- For binary descriptors (ORB): **LSH** (locality-sensitive hashing).

Approximate means it may miss the true nearest neighbour sometimes, which is usually acceptable.

```python run title="FLANN matcher with the ratio test" level=intermediate
import cv2
import numpy as np
import cvlab

a, b, H = cvlab.warped_pair("coffee")
ga, gb = [cv2.cvtColor(x, cv2.COLOR_RGB2GRAY) for x in (a, b)]
sift = cv2.SIFT_create()
ka, da = sift.detectAndCompute(ga, None)
kb, db = sift.detectAndCompute(gb, None)

FLANN_INDEX_KDTREE = 1
flann = cv2.FlannBasedMatcher(dict(algorithm=FLANN_INDEX_KDTREE, trees=5), dict(checks=50))       # checks = how hard to search
knn = flann.knnMatch(da, db, k=2)
good = [m for m, n in knn if m.distance < 0.75 * n.distance]
brute = [m for m, n in cv2.BFMatcher(cv2.NORM_L2).knnMatch(da, db, k=2) if m.distance < 0.75 * n.distance]
print("FLANN good matches:", len(good), "   brute-force good matches:", len(brute))
vis = cv2.drawMatches(a, ka, b, kb, good[:30], None, matchColor=(255, 0, 0), flags=cv2.DrawMatchesFlags_NOT_DRAW_SINGLE_POINTS)
cvlab.show(vis, "FLANN matches")
```

For binary descriptors use an LSH index: `dict(algorithm=6, table_number=6, key_size=12, multi_probe_level=1)`.

## Check matches with geometry

Even after the ratio test, a few wrong matches remain. The next lesson shows how **geometry** (RANSAC) removes them. The principle: correct matches obey one consistent transformation; wrong ones are random.

## Learned matching

Modern systems replace both steps with neural networks:

- **SuperPoint**: a CNN that detects keypoints and describes them.
- **SuperGlue / LightGlue**: a **graph neural network / transformer** that looks at all the keypoints of both pictures at once and decides the matches, using context. Much better with large viewpoint change.
- **LoFTR / DKM**: **detector-free** dense matching: no keypoints, matches directly from features.

They need a GPU (or a good phone chip), but they are far more robust. For interviews: know the classical pipeline well, and mention these as the modern answer.

:::interview Questions you may get
- "What is the ratio test and why does it work?" Compare the best and second-best descriptor distance; a true match is much closer than the next candidate. Threshold about 0.75.
- "How do you match binary descriptors?" Hamming distance, brute force or LSH.
- "What does cross-check do?" Keeps only mutual nearest neighbours.
- "How do you speed up matching for large feature sets?" Approximate nearest neighbours (FLANN, KD-trees or LSH), or a vocabulary tree.
- "How do you evaluate matching?" With ground-truth geometry: the fraction of matches consistent with the known transform.
:::

```quiz
? What does Lowe's ratio test compare?
- The size of two keypoints
+ The distance to the best match and the distance to the second-best match
- The brightness of two pictures
> A small ratio means the best match is unique.

? Why are there many wrong matches with plain nearest neighbour?
+ Some keypoints have no counterpart in the other image, but the matcher still returns something
- The descriptors are too long
- The images are too big
> The ratio test and geometric checks handle this.

? What index does FLANN use for SIFT descriptors?
+ KD-trees
- LSH
- A hash of colours
> LSH is for binary descriptors.

? Which modern approach decides matches using context from all keypoints of both images?
- BFMatcher
+ SuperGlue or LightGlue
- Harris
> They use attention (transformers or graph networks) to match globally.
```

:::problem You match two photos and get 200 matches, but only 60 are correct. A colleague says "just lower the ratio threshold to 0.5". What are the trade-offs and what else would you do? {level=medium tags="matching,ratio-test,ransac"}
Think about what you lose and what comes next in the pipeline.

:::solution Model answer
Lowering the ratio to 0.5 increases precision but removes many true matches too, which can leave too few for a stable estimate, especially for weak textures. A better approach is to keep a moderate ratio (0.7–0.8) and filter with geometry: estimate the transformation with RANSAC (homography or fundamental matrix) and keep the inliers. Also spread keypoints evenly, check for repeated patterns, and compute a final refinement on the inliers. Tune the threshold to the downstream goal: panoramas can tolerate some false matches thanks to RANSAC.
:::
:::

:::keypoints
- Matching pairs descriptors by nearest neighbour: L2 for SIFT, Hamming for binary.
- Lowe's ratio test (best/second best < ~0.75) removes ambiguous matches. Cross-check keeps mutual matches.
- FLANN gives fast approximate matching (KD-trees for floats, LSH for bits).
- Wrong matches remain; geometry (RANSAC) cleans them. Learned matchers (SuperGlue, LightGlue, LoFTR) are stronger.
:::

:::resources
- [OpenCV: feature matching tutorial](https://docs.opencv.org/4.x/dc/dc3/tutorial_py_matcher.html) — brute force and FLANN with code.
- [LightGlue: Local Feature Matching at Light Speed](https://arxiv.org/abs/2306.13643) — a modern learned matcher.
- [SuperGlue: Learning Feature Matching with Graph Neural Networks](https://arxiv.org/abs/1911.11763) — the learned matcher that started the trend.
:::
