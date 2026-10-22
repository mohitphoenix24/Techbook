---
title: How a Camera Makes Numbers
level: easy
time: 35
summary: From light to pixels. The lens, the sensor, the Bayer pattern, exposure, noise, gamma, white balance, dynamic range, and why rolling-shutter cameras bend fast things. Knowing the camera explains most "weird" image problems.
---

Every image you will ever process was made by a camera. If you understand what the camera did, many strange problems (noise, colour fringes, blur, bent lines) stop being strange. This lesson follows the light from the world to the numbers.

:::analogy
A camera sensor is a field of tiny buckets in the rain. Each bucket is a pixel. The rain is light (photons). Open the shutter, wait, close it, and measure how much water is in each bucket. A bright area fills its bucket fast. A dark area collects only a few drops. The number you store is the water level.
:::

## The path of light

:::flow From light to a file
Light from the scene | Sunlight bounces off objects. Some of it travels toward the camera.
Lens | Bends the light so each point of the scene lands on one point of the sensor. Focus decides which distance is sharp.
Aperture | A hole that sets how much light gets in. A big hole means more light but a smaller region in focus.
Shutter | Decides for how long the sensor collects light (the exposure time).
Sensor (CMOS) | Each pixel turns light into an electric charge. More light, more charge.
Colour filter (Bayer) | Each pixel sees only red, green or blue light.
Analog-to-digital converter | Turns the charge into a number (for example 0–4095 for 12 bits). ISO sets the amplification.
Image processor (ISP) | Demosaics, reduces noise, fixes white balance, applies gamma, sharpens, compresses to JPEG.
:::

## The Bayer pattern and demosaicing

A sensor pixel cannot tell colours apart. It only counts light. So the maker puts a tiny colour filter on each pixel in a repeating pattern: 2 green, 1 red, 1 blue in every 2 × 2 block. Green gets double because our eyes are most sensitive to it.

That means each pixel knows **one** of its three colours. The other two are **guessed** from the neighbours. This guess is called **demosaicing**. Try it, and look at the zoomed patch.

```viz algo=bayer title="One colour per pixel, then guess the rest"
```

You can do the same in OpenCV. Many industrial cameras give you the raw Bayer image, and you convert it yourself.

```python run title="Make a Bayer mosaic and demosaic it" level=intermediate
import cv2
import numpy as np
import cvlab

rgb = cvlab.image("cat")
h, w = rgb.shape[0] // 2 * 2, rgb.shape[1] // 2 * 2
rgb = rgb[:h, :w]

# keep one colour per pixel in an RGGB layout (what the sensor records)
raw = np.zeros((h, w), np.uint8)
raw[0::2, 0::2] = rgb[0::2, 0::2, 0]     # red   on even rows, even columns
raw[0::2, 1::2] = rgb[0::2, 1::2, 1]     # green
raw[1::2, 0::2] = rgb[1::2, 0::2, 1]     # green
raw[1::2, 1::2] = rgb[1::2, 1::2, 2]     # blue

out = cv2.cvtColor(raw, cv2.COLOR_BAYER_BG2RGB)      # OpenCV names Bayer codes by the second-row layout
error = np.abs(out.astype(int) - rgb.astype(int)).mean()
print("raw shape (one number per pixel):", raw.shape)
print("mean error after demosaicing:", round(float(error), 2), "grey levels")
cvlab.show(raw, "Raw sensor data", out, "Demosaiced", rgb, "True picture")
```

The error is small but not zero. The missing colours were **estimated**, not measured. This is why a single-chip colour camera is a little less sharp than its pixel count suggests.

## Exposure: three knobs

| Knob | What it does | Price you pay |
|---|---|---|
| **Exposure time** (shutter speed) | Longer means more light | Motion blur |
| **Aperture** | Bigger hole means more light | Less of the scene in focus |
| **ISO / gain** | Amplifies the signal | Amplifies the noise too |

For machine vision, the usual advice: **use short exposure to freeze motion, add light (a lamp) to compensate, and keep gain low.** A good light is often cheaper than a clever algorithm.

## Noise: why dark images are grainy

Light comes in drops (photons). In a dark area, a pixel catches only a few. Random luck matters a lot: one pixel gets 8 photons, its neighbour gets 12, though they see the same scene. This is **shot noise**. It follows a Poisson distribution: the noise size is about the square root of the number of photons. So a pixel with 100 photons has noise of about 10 (10%), and a pixel with 10,000 has about 100 (1%). **More light means a cleaner picture.**

```python run title="Simulate a camera in dim light" level=intermediate
import numpy as np
import cvlab

rng = np.random.default_rng(0)
img = cvlab.image("camera").astype(np.float64) / 255.0      # the "true" brightness, 0..1

def photograph(true_img, max_photons):
    photons = rng.poisson(true_img * max_photons)             # random count of photons per pixel
    return np.clip(photons / max_photons, 0, 1)

shots = {n: photograph(img, n) for n in (5, 30, 200, 5000)}
for n, s in shots.items():
    noise = float(np.std(s - img))
    print(f"up to {n:5d} photons per pixel -> noise level {noise:.3f}")
cvlab.show(*shots.values(), titles=[f"{n} photons" for n in shots])
```

This is why night photos are noisy, why phones take many frames and merge them, and why a good light matters in a factory.

## Gamma: why 128 is not "half as bright"

Cameras do not store brightness linearly. They store it with a curve called **gamma** (about `value = light^(1/2.2)`). Why? Our eyes see differences in dark areas better than in bright areas. A curve gives more of the 256 numbers to the dark tones, so the picture looks smooth with only 8 bits.

The side effect: if you want to do real physics (blur, average, add up light), you should first convert back to linear light. Many tools quietly skip this. Play with the curve:

```viz algo=gamma title="Brightening with a gamma curve"
```

## White balance

A white sheet of paper looks white to you under sunlight, a bulb or a tube light. A camera does not do that for free. Under a yellow bulb the paper looks yellow to the sensor. **White balance** multiplies the channels so that "white things" come out with equal R, G and B. The simplest method is the **grey-world assumption**: on average the world is grey, so scale each channel until the three averages match.

```python run title="Grey-world white balance" level=intermediate
import numpy as np
import cvlab

img = cvlab.image("coffee").astype(np.float64)
warm = img * np.array([1.25, 1.0, 0.7])                  # pretend a yellow lamp lit the scene
warm = np.clip(warm, 0, 255)

means = warm.reshape(-1, 3).mean(axis=0)
gain = means.mean() / means                              # make the three averages equal
fixed = np.clip(warm * gain, 0, 255)

print("channel averages before:", means.round(1))
print("channel averages after :", fixed.reshape(-1, 3).mean(axis=0).round(1))
cvlab.show(img.astype(np.uint8), "True colours", warm.astype(np.uint8), "Under a yellow lamp", fixed.astype(np.uint8), "Grey-world fix")
```

Grey-world fails on scenes that really are one colour (a green field). Better methods use the brightest pixels or a learned model, and robots often use a **grey card** in the scene for exact calibration.

## Dynamic range and HDR

A sensor can only measure a limited range of brightness. Point it at a window from inside a room, and it either shows the room (window turns pure white) or the outside (room turns black). This is **limited dynamic range**. **HDR** (high dynamic range) takes several shots with different exposure times and merges them. Phones do it automatically.

## Global shutter and rolling shutter

- **Global shutter**: all pixels collect light at the **same** time. A fast-moving object is only blurred. Used in robots and machine vision.
- **Rolling shutter**: the sensor is read **row by row**, so the bottom row is captured a little later than the top row. Fast things lean or wobble (a spinning propeller looks bent). Most phone cameras are rolling shutter.

For a robot arm that moves while it takes a picture, this difference can decide whether your 3D measurements are right. When you buy a camera for robotics, ask for **global shutter**.

:::interview Questions you may get
- "Why is a low-light image noisy?" Fewer photons mean larger relative shot noise (noise grows as the square root of the count, so signal-to-noise grows as the square root too).
- "What is demosaicing?" Estimating the two missing colours at each pixel of a Bayer sensor.
- "Global versus rolling shutter, and which for a moving robot?" Global. Rolling shutter skews fast-moving objects.
- "How would you reduce motion blur?" Shorter exposure, more light, global shutter, or a faster-moving strobe light.
:::

```quiz
? Why does a colour camera sensor have more green pixels than red or blue?
- Green light is stronger
+ Human eyes are most sensitive to green, so green carries most of the brightness detail
- Green is easier to measure
> The Bayer pattern is 50% green, 25% red, 25% blue.

? You double the ISO in a dark scene. What happens?
- Less noise
+ The picture gets brighter, but the noise is amplified as well
- The image gets sharper
> Gain amplifies signal and noise together. Adding real light is better.

? A fast propeller looks bent in a phone video. What is the cause?
+ Rolling shutter: rows are captured at slightly different times
- Lens distortion
- JPEG compression
> Global-shutter sensors avoid this.

? Why do cameras apply gamma?
- To make pictures darker
+ To give more of the 256 levels to dark tones, where the eye is more sensitive
- To remove noise
> The curve is roughly value = light^(1/2.2).
```

:::keypoints
- A camera counts photons per pixel. More light means a cleaner picture.
- A Bayer sensor records one colour per pixel. Demosaicing guesses the rest.
- Exposure time, aperture and gain trade light against blur, focus depth and noise.
- Gamma stores brightness non-linearly. White balance fixes the colour of the light.
- Choose a global-shutter camera for fast-moving robots. Add light before adding algorithms.
:::

:::resources
- [Cambridge in Colour: camera sensors and Bayer demosaicing](https://www.cambridgeincolour.com/tutorials/camera-sensors.htm) — clear pictures of how sensors work.
- [OpenCV: HDR imaging tutorial](https://docs.opencv.org/4.x/d2/df0/tutorial_py_hdr.html) — merge exposures in code.
- [Szeliski, Computer Vision: Algorithms and Applications, chapter 2 (image formation)](https://szeliski.org/Book/) — the full theory.
:::
