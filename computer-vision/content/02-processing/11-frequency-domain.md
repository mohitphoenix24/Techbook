---
title: The Frequency View — Fourier Transform for Images
level: intermediate
time: 40
summary: A picture is a sum of waves. Slow waves are the big shapes, fast waves are edges and detail. Learn the 2-D Fourier transform, read a spectrum, build low-pass and high-pass filters, remove periodic noise with a notch, and see why blur, JPEG and aliasing all make sense in this view.
---

So far we looked at pictures as **pixels in space**. There is a second way to see the same picture: as a **mixture of waves**. This view is called the **frequency domain**. It answers questions that are hard in space, such as "what is the repeating pattern in this image?" and "what does blurring really remove?"

## Waves, slow and fast

Take one row of pixels. Brightness goes up and down along the row. A **slow** change (a gentle gradient) is a **low frequency**. A **fast** change (a stripe pattern, an edge, noise) is a **high frequency**.

Joseph Fourier's big idea: **any signal is a sum of sine waves of different frequencies.** The **Fourier transform** finds how much of each frequency there is.

```python run title="Build a signal from three waves" level=easy
import numpy as np

x = np.arange(64)
slow = np.sin(2 * np.pi * 1 * x / 64)                # 1 wave across the row
medium = 0.5 * np.sin(2 * np.pi * 5 * x / 64)        # 5 waves
fast = 0.25 * np.sin(2 * np.pi * 20 * x / 64)        # 20 waves
signal = slow + medium + fast

spectrum = np.abs(np.fft.rfft(signal)) / (len(x) / 2)    # how strong is each frequency
peaks = np.argsort(spectrum)[-3:][::-1]
print("strongest frequencies (waves per row):", sorted(peaks.tolist()))
print("their strengths:", np.round(spectrum[sorted(peaks.tolist())], 2), " (the ingredients were 1, 0.5 and 0.25)")
```

The FFT recovered the recipe: one wave of strength 1, five waves of strength 0.5 and twenty waves of strength 0.25.

## The 2-D spectrum

For a picture the waves run in 2-D (they can be stripes at any angle). The 2-D FFT gives a **spectrum image** of the same size:

- The **centre** is the slowest frequency (the average brightness).
- **Moving outwards** means faster frequencies.
- The **direction** from the centre is the direction of the waves. The **brightness** of a spot says how strong that wave is.

Natural pictures have most of their energy near the centre (smooth areas) and a weaker cloud outside (edges and texture). We draw the **logarithm** of the strength, because the centre is huge.

```python run title="The spectrum of a photo" level=intermediate
import numpy as np
import cvlab

img = cvlab.image("camera", size=(256, 256), gray=True).astype(np.float64)
F = np.fft.fftshift(np.fft.fft2(img))                 # shift so that the slowest frequency is in the centre
log_spectrum = np.log1p(np.abs(F))
print("spectrum shape:", F.shape, " dtype:", F.dtype, "(complex numbers: strength AND phase)")
print("DC term / (pixels) = average brightness:", round(float(np.abs(F[128, 128]) / img.size), 1), " vs img.mean():", round(float(img.mean()), 1))

stripes = np.tile(np.sin(2 * np.pi * 16 * np.arange(256) / 256), (256, 1))      # vertical stripes, 16 waves
Fs = np.log1p(np.abs(np.fft.fftshift(np.fft.fft2(stripes))))
cvlab.show(img.astype(np.uint8), "Photo", log_spectrum, "Spectrum", stripes, "Stripes", Fs, "Spectrum of stripes: 2 dots")
```

Stripes give just **two dots**, left and right of the centre. The distance from the centre is the stripe frequency. That is the 2-D picture of "a pure wave".

:::note Strength and phase
Each frequency also has a **phase**: where the wave starts. The spectrum image shows only the strength. The phase holds the **structure** (where edges are). If you keep a photo's phase and replace its strength with another photo's, you still see the first photo. Phase matters more than strength for recognising shapes.
:::

## Filtering in the frequency domain

Because we know which frequencies are slow and fast, we can **edit** them:

- **Low-pass**: keep the centre, remove the outside → **blur**. Fine detail is gone, big shapes stay.
- **High-pass**: remove the centre, keep the outside → **edges only**.
- **Band-pass**: keep a ring → one range of detail.

Try it. Draw a ring or a disc and see what survives:

```viz algo=fourier title="Low-pass, high-pass and band-pass on a photo"
```

```python run title="Low-pass and high-pass with the FFT" level=intermediate
import numpy as np
import cvlab

img = cvlab.image("camera", size=(256, 256), gray=True).astype(np.float64)
F = np.fft.fftshift(np.fft.fft2(img))
yy, xx = np.mgrid[-128:128, -128:128]
dist = np.hypot(xx, yy)

def apply(mask):
    return np.real(np.fft.ifft2(np.fft.ifftshift(F * mask)))

low = apply(dist <= 20)
high = apply(dist > 20)
print("energy kept by the low 20 frequencies:", round(float((np.abs(F[dist <= 20]) ** 2).sum() / (np.abs(F) ** 2).sum()), 3))
print("low + high rebuilds the picture:", bool(np.allclose(low + high, img)))
cvlab.show(img.astype(np.uint8), "Original", np.clip(low, 0, 255).astype(np.uint8), "Low frequencies: blur", np.clip(high * 3 + 128, 0, 255).astype(np.uint8), "High frequencies: edges (x3)")
```

Most of the picture's energy sits in the **lowest** frequencies. That is why a picture is still recognisable when you blur it. It is also the core reason **compression works**: JPEG keeps the strong low frequencies and throws away the weak high ones (it uses a close cousin of the FFT, the DCT).

## Why blur is a low-pass filter

The convolution theorem says blurring in space equals **multiplying** the spectrum by the Fourier transform of the kernel. The transform of a Gaussian is another Gaussian: a smooth bell around the centre. So a Gaussian blur **fades out** high frequencies gently. A box blur has a sinc-shaped spectrum with ripples, which lets some high frequencies leak back. And an **ideal** low-pass filter (a hard circle) causes **ringing**, ripples around edges, which is the reason we prefer smooth Gaussian filters.

```python run title="Ideal low-pass rings; Gaussian does not" level=advanced
import numpy as np
import cvlab

img = np.zeros((128, 128)); img[40:90, 40:90] = 255                      # a white square
F = np.fft.fftshift(np.fft.fft2(img))
yy, xx = np.mgrid[-64:64, -64:64]
d = np.hypot(xx, yy)
ideal = np.real(np.fft.ifft2(np.fft.ifftshift(F * (d <= 12))))
gauss = np.real(np.fft.ifft2(np.fft.ifftshift(F * np.exp(-(d ** 2) / (2 * 8 ** 2)))))
print("ideal low-pass: values below 0 (ringing):", round(float(ideal.min()), 1), "  Gaussian minimum:", round(float(gauss.min()), 1))
cvlab.show(img.astype(np.uint8), "Square", np.clip(ideal, 0, 255).astype(np.uint8), "Ideal low-pass: ripples", np.clip(gauss, 0, 255).astype(np.uint8), "Gaussian: clean")
```

## Removing periodic noise with a notch filter

A repeating pattern (a scanner's stripes, a screen's moiré, electrical interference) appears as **a few bright dots** in the spectrum. Remove just those dots and the stripes vanish, while everything else stays. This is a **notch filter**, and it is hard to do in the pixel domain.

```python run title="Remove stripes with a notch filter" level=intermediate
import numpy as np
import cvlab

clean = cvlab.image("camera", size=(256, 256), gray=True).astype(np.float64)
x = np.arange(256)
stripes = 40 * np.sin(2 * np.pi * 32 * x / 256)                          # 32 waves across the picture
noisy = clean + stripes[None, :]

F = np.fft.fftshift(np.fft.fft2(noisy))
mag = np.abs(F)
mag_no_centre = mag.copy(); mag_no_centre[118:139, 118:139] = 0           # ignore the low-frequency middle
peak = tuple(int(v) for v in np.unravel_index(mag_no_centre.argmax(), mag.shape))
print("strongest non-central spot at (row, col):", peak, " -> offset from the centre:", (peak[0] - 128, peak[1] - 128))

mask = np.ones_like(mag)
for dy, dx in [(peak[0] - 128, peak[1] - 128), (128 - peak[0], 128 - peak[1])]:
    mask[128 + dy - 3:128 + dy + 4, 128 + dx - 3:128 + dx + 4] = 0       # cut the two dots
restored = np.real(np.fft.ifft2(np.fft.ifftshift(F * mask)))
err = lambda a: float(np.sqrt(np.mean((a - clean) ** 2)))
print("RMS error  noisy:", round(err(noisy), 1), "  restored:", round(err(restored), 1))
cvlab.show(np.clip(noisy, 0, 255).astype(np.uint8), "Stripes added", np.log1p(mag), "Spectrum: two bright dots", np.clip(restored, 0, 255).astype(np.uint8), "Stripes removed")
```

## Where the frequency view shows up later

- **Sampling and aliasing**: frequencies above half the sampling rate fold back as false patterns.
- **JPEG and video codecs**: transform, then quantise the high frequencies.
- **Deconvolution**: undoing a blur means dividing by the kernel's spectrum.
- **CNN training**: networks learn low frequencies first (spectral bias), and some defects such as checkerboard artefacts in generators come from frequency effects of up-sampling.
- **Fast convolution**: multiply spectra (the previous lesson).

:::interview Questions you may get
- "What does the 2-D Fourier transform of an image show?" How much of each spatial frequency and orientation: centre = slow changes, outside = fast changes (edges, noise).
- "Why is a Gaussian blur a low-pass filter?" Its spectrum is a Gaussian, which suppresses high frequencies smoothly.
- "How would you remove a repeating stripe pattern?" FFT, find the bright dots, mask them (notch), inverse FFT.
- "What carries more information about the structure, strength or phase?" Phase.
- "Why does an ideal low-pass filter cause ringing?" A hard cutoff in frequency is a sinc in space, which has ripples.
:::

```quiz
? Where are the slow (low) frequencies in a centred spectrum?
+ At the centre
- At the corners
- On the top row
> Distance from the centre is the frequency; the centre is the average brightness.

? What does a high-pass filter keep?
- The average brightness
+ Edges and fine detail
- Only colours
> It removes the slow variations.

? A picture has regular stripes from a scanner. How do they look in the spectrum?
- A uniform glow
+ A pair of bright dots away from the centre
- Nothing special
> Each pure wave is a symmetric pair of dots.

? Why is ringing visible with an ideal (hard-edged) low-pass filter?
+ Its sharp cutoff in frequency corresponds to a sinc kernel with ripples in space
- The picture is too small
- The FFT is inexact
> A smooth (Gaussian) cutoff avoids ringing.
```

:::problem A photographer scans old printed photos and gets a regular dot grid (moiré) over each one. How would you remove it, and what would you check afterwards? {level=hard tags="fft,denoising"}
Think about how a repeating pattern looks in the spectrum.

:::solution Model answer
Take the FFT of each channel. The halftone dots appear as a regular lattice of bright peaks away from the centre. Build a mask that attenuates small neighbourhoods around those peaks (smooth Gaussian notches, not hard holes, to avoid ringing), apply it, and invert. Check: that real fine texture is not removed (compare a zoom), that no new ripples appear, and that the colour balance is unchanged. A simpler alternative is to blur lightly then sharpen; a modern alternative is a trained descreening network.
:::
:::

:::keypoints
- A picture is a sum of waves. Slow waves are big shapes; fast waves are edges and noise.
- In the centred spectrum, the centre is slow and the outside is fast. Repeating patterns are bright dots.
- Low-pass blurs, high-pass keeps edges. Gaussian filters are smooth in both domains; hard cutoffs ring.
- Notch filters remove periodic noise. Phase carries structure.
- This view explains blur, JPEG, aliasing and fast convolution.
:::

:::resources
- [3Blue1Brown: But what is the Fourier Transform?](https://www.youtube.com/watch?v=spUNpyF58BY) — the best intuition video.
- [OpenCV: Fourier transform tutorial](https://docs.opencv.org/4.x/de/dbc/tutorial_py_fourier_transform.html) — code for the 2-D FFT and filters.
:::
