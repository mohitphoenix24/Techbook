---
title: Making Filters Fast — Separable, Integral Image, FFT
level: intermediate
time: 35
summary: A big kernel is slow. Learn three ways to speed it up: separable kernels (two small passes), the integral image (a box filter in constant time), and the FFT (multiply in the frequency domain). Includes the integral image used by Viola–Jones.
---

In the last lessons a `k × k` filter cost about `k²` multiplications per pixel. For a 31 × 31 blur on a 4K picture that is about 8 billion operations. Real systems need to be much faster. This lesson shows the three tricks interviewers expect you to know.

## Trick 1: separable kernels

Some 2-D kernels are the **product of a column and a row**. The Gaussian is one. Instead of one pass with a `k × k` kernel, do **two passes with a `k × 1` and a `1 × k` kernel**. The result is identical. The cost drops from `k²` to `2k` per pixel.

| Kernel size k | Direct `k²` | Separable `2k` | Speed-up |
|---|---|---|---|
| 3 | 9 | 6 | 1.5× |
| 9 | 81 | 18 | 4.5× |
| 31 | 961 | 62 | 15× |

```python run title="A separable filter gives the same result" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("camera").astype(np.float32)
g1 = cv2.getGaussianKernel(15, 3.0)                 # a column vector (15 x 1)
full = g1 @ g1.T                                    # the 15 x 15 kernel = column x row

a = cv2.filter2D(img, -1, full, borderType=cv2.BORDER_REFLECT_101)                  # one 2-D pass
b = cv2.sepFilter2D(img, -1, g1, g1, borderType=cv2.BORDER_REFLECT_101)             # two 1-D passes
print("2-D kernel multiplications per pixel:", full.size, "  separable:", 2 * len(g1))
print("largest difference:", float(np.abs(a - b).max()))
```

How do you know whether a kernel is separable? Its matrix has **rank 1**. A rank-1 matrix is an outer product of two vectors. In NumPy: `np.linalg.matrix_rank(K) == 1`. Sobel is separable too: `[1 2 1]ᵀ × [-1 0 1]`. Any kernel can be approximated by a few separable ones using the **SVD**.

```python run title="Is this kernel separable?" level=intermediate
import numpy as np

sobel_x = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], float)
laplacian = np.array([[0, 1, 0], [1, -4, 1], [0, 1, 0]], float)
print("rank of Sobel x   :", np.linalg.matrix_rank(sobel_x), "-> separable")
print("rank of Laplacian :", np.linalg.matrix_rank(laplacian), "-> not separable (but = sum of two separable kernels)")
u, s, vt = np.linalg.svd(sobel_x)
col, row = u[:, 0] * np.sqrt(s[0]), vt[0] * np.sqrt(s[0])
print("rebuilt from one column x one row:", bool(np.allclose(np.outer(col, row), sobel_x)))
```

Deep learning uses the same idea: **depthwise separable convolutions** (MobileNet) split a convolution into a per-channel spatial filter and a 1 × 1 mixing step, to cut computation by 8 to 9 times.

## Trick 2: the integral image (box filter in constant time)

A **box filter** (average over a rectangle) needs the sum of all pixels in a rectangle. Adding them one by one costs `k²`. The **integral image** (also called summed-area table) makes it **4 lookups, however big the rectangle**.

Build a table `S` where `S[y, x]` is the sum of **all pixels above and to the left** of `(x, y)`. Then, for any rectangle:

:::formula Sum of a rectangle from the integral image
\text{sum} = S[y_2, x_2] - S[y_1, x_2] - S[y_2, x_1] + S[y_1, x_1]
:::

(Add the big area, subtract the two strips, add back the corner that was subtracted twice.)

```python run title="Integral image: rectangle sums in O(1)" level=intermediate
import cv2
import numpy as np
import cvlab

img = cvlab.image("camera", size=(200, 200), gray=True)

S = img.astype(np.int64).cumsum(axis=0).cumsum(axis=1)       # the integral image
S = np.pad(S, ((1, 0), (1, 0)))                              # add a zero row and column, so S[0, :] = 0

def rect_sum(y1, x1, y2, x2):                                # rows y1..y2-1, columns x1..x2-1
    return S[y2, x2] - S[y1, x2] - S[y2, x1] + S[y1, x1]

y1, x1, y2, x2 = 30, 40, 130, 170
print("integral image answer :", int(rect_sum(y1, x1, y2, x2)))
print("direct sum answer     :", int(img[y1:y2, x1:x2].sum()))
print("OpenCV's integral     :", int(cv2.integral(img)[y2, x2] - cv2.integral(img)[y1, x2] - cv2.integral(img)[y2, x1] + cv2.integral(img)[y1, x1]))
```

Where is the integral image used?

- **Fast box blur** and local mean (adaptive threshold uses it).
- **Viola–Jones face detector**: Haar features are differences of rectangle sums, so each feature costs a few lookups. This made real-time face detection possible in 2001.
- **SURF** and many "fast" features.
- Local statistics (variance in a window) with the integral of squares.

## Trick 3: the Fourier transform

The **convolution theorem** says: *convolution in the picture domain equals multiplication in the frequency domain.* So you can:

1. FFT the picture.
2. FFT the kernel (padded to the picture's size).
3. Multiply them, element by element.
4. Inverse FFT.

An FFT costs `N log N` for `N` pixels, so the total cost does **not depend on the kernel size**. For a huge kernel (say 101 × 101) it wins clearly. For small kernels, direct convolution is faster.

```python run title="Convolution through the FFT" level=advanced
import cv2
import numpy as np
import cvlab

img = cvlab.image("camera", size=(128, 128), gray=True).astype(np.float64)
k = cv2.getGaussianKernel(21, 4.0)
kernel = (k @ k.T)

# FFT route (circular convolution: the picture wraps around at the borders)
H, W = img.shape
kpad = np.zeros_like(img)
kpad[:21, :21] = kernel
kpad = np.roll(kpad, (-10, -10), axis=(0, 1))                  # move the kernel centre to (0, 0)
fft_result = np.real(np.fft.ifft2(np.fft.fft2(img) * np.fft.fft2(kpad)))

direct = cv2.filter2D(img, -1, kernel, borderType=cv2.BORDER_WRAP)
print("largest difference (wrap border):", float(np.abs(fft_result - direct).max()))
```

The FFT route gives **circular** convolution (the picture wraps), so it matches the `BORDER_WRAP` mode. Pad the picture if you want other borders. The FFT also shows what a filter really does to each frequency, which is the next-but-two lesson.

## Other speed-ups you will hear about

- **Recursive (IIR) Gaussian**: approximates the Gaussian with a feedback filter whose cost does not grow with σ.
- **SIMD and multi-core**: OpenCV uses vector instructions and threads. That is why `cv2.GaussianBlur` is much faster than your NumPy loops.
- **Image pyramids**: blur on a smaller picture and scale up.
- **Fixed-point and hardware**: camera chips (ISPs) and FPGAs do fixed kernels in hardware at full video rate. GPUs run a thread per pixel.
- **cuDNN / Winograd**: neural-network libraries speed up small (3 × 3) convolutions with special algebra.

:::interview Questions you may get
- "How do you speed up a large Gaussian blur?" Separable passes, cost 2k instead of k². Or downsample, blur, upsample. Or an IIR approximation. For huge kernels, the FFT.
- "What is an integral image and what is it used for?" A table of cumulative sums. Any rectangle sum takes four lookups. Used in Viola–Jones, box filters, adaptive thresholds.
- "State the convolution theorem." Convolution in space is multiplication in frequency.
- "When is the FFT faster than direct convolution?" For large kernels. The cost is independent of kernel size.
:::

```quiz
? A 2-D Gaussian kernel of width 21 is applied as two 1-D passes. How many multiplications per pixel?
- 441
+ 42
- 21
> 2 × 21 = 42, instead of 21 × 21 = 441.

? How many table lookups does a rectangle sum need with an integral image?
- Depends on the rectangle size
+ Four
- One
> S[y2,x2] − S[y1,x2] − S[y2,x1] + S[y1,x1].

? How can you test that a kernel is separable?
+ Its matrix has rank 1
- It adds up to 1
- It is symmetric
> A rank-1 matrix is the outer product of a column and a row.

? Why did the integral image matter for Viola–Jones?
- It removes noise
+ Haar features are rectangle sums, so each feature costs a few lookups, giving real-time detection
- It stores colours
> This was the speed trick behind the first practical face detector.
```

:::problem Compute the mean of every 15×15 window of a 4K image as cheaply as you can. What is the cost per pixel? {level=medium tags="integral-image,efficiency"}
Compare the options.

:::solution Model answer
Direct: 225 additions per pixel. Separable box (two passes of 15): 30 additions. Integral image: build once with two cumulative sums (about 2 additions per pixel), then 4 lookups and 3 additions per window, i.e. a small constant **independent of window size**. For local **variance**, also build an integral image of squared values: var = mean(x²) − mean(x)². Watch the dtype: sums of a 4K image need `int64` or `float64` to avoid overflow.
:::
:::

:::keypoints
- Separable kernels (rank 1) turn a `k²` filter into two `k` passes. Gaussian and Sobel are separable.
- The integral image gives any rectangle sum in four lookups: fast box filters, adaptive thresholds, Viola–Jones.
- Convolution in space = multiplication in frequency. The FFT cost does not depend on kernel size.
- Real systems also use SIMD, threads, GPUs, IIR filters and hardware pipelines.
:::

:::resources
- [Viola and Jones: Rapid Object Detection using a Boosted Cascade of Simple Features](https://www.cs.cmu.edu/~efros/courses/LBMV07/Papers/viola-cvpr-01.pdf) — the paper that introduced the integral image for vision.
- [OpenCV: sepFilter2D and integral](https://docs.opencv.org/4.x/d4/d86/group__imgproc__filter.html) — the functions.
:::
