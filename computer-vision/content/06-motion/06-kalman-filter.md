---
title: The Kalman Filter — Predict, Then Correct
level: advanced
time: 55
summary: How to combine a motion model with noisy measurements to get a better estimate than either alone. The predict and update steps, the Kalman gain, a constant-velocity tracker written from scratch, handling missed detections, tuning Q and R, and OpenCV's KalmanFilter.
---

A camera detects a ball in each frame, but the detections are **noisy**: the box jitters by a few pixels, and sometimes the ball is **missed**. Yet you know something about **how balls move**: smoothly, with a roughly constant speed. The **Kalman filter** (Rudolf Kálmán, 1960) combines **what you predict** from the motion model with **what you measure**, and weighs each by how much you trust it. It is used inside trackers, in navigation, in robot localisation, in sensor fusion and in visual-inertial odometry. In MOT, it is the "motion model" of SORT.

## The idea in one dimension

You estimate a number (a position) and you also keep track of **how uncertain you are** (a variance). Two Gaussians come together:

- **Prediction**: "Based on last time and the speed, I think the position is 10.0, with uncertainty σ² = 4."
- **Measurement**: "The detector says 12.0, with uncertainty σ² = 1."

The best combination is a **weighted average**, with weights inversely proportional to the variances. The more precise one gets more weight:

`new estimate = prediction + K · (measurement − prediction)`, with the **Kalman gain** `K = σ²_pred / (σ²_pred + σ²_meas)`.

Here `K = 4 / (4 + 1) = 0.8`, so the estimate is `10 + 0.8 × 2 = 11.6`, much closer to the (more precise) measurement. And the new uncertainty is **smaller than both**: `(1 − K) σ²_pred = 0.8`. **Combining information always reduces uncertainty.**

```python run title="1-D Kalman: estimating a constant from noisy readings" level=easy
import numpy as np

rng = np.random.default_rng(0)
true_value, meas_std = 5.0, 2.0
x, var = 0.0, 100.0                       # a very uncertain starting guess
print("step  measurement  estimate  uncertainty  gain")
for step in range(1, 9):
    z = true_value + rng.normal(0, meas_std)
    K = var / (var + meas_std ** 2)       # how much to trust the new measurement
    x = x + K * (z - x)
    var = (1 - K) * var
    print(f"{step:4d} {z:11.2f} {x:9.2f} {var:12.2f} {K:6.2f}")
```

The gain starts near 1 (trust the measurement, as the guess is poor) and falls as the estimate gets more certain. The estimate converges on the true value of 5.

## The full filter: predict and update

For a moving object the **state** is a vector, for example position and velocity `x = (px, py, vx, vy)`. Two matrices describe the world:

- **F** (state transition): how the state evolves in one step. For constant velocity: `px' = px + vx·dt`, and so on.
- **H** (measurement): what the sensor sees. A detector sees only the position, so `H` picks out `(px, py)`.

And two noise matrices: **Q** (process noise: how much the real motion can deviate from the model, for example due to acceleration) and **R** (measurement noise: how inaccurate the detector is). The filter keeps the state estimate `x` and its covariance `P` (the uncertainty) and repeats two steps:

:::flow One cycle of the Kalman filter
Predict the state | x⁻ = F x. Move the estimate forward with the motion model.
Predict the uncertainty | P⁻ = F P Fᵀ + Q. Uncertainty grows, because the model is not perfect.
Compute the gain | K = P⁻ Hᵀ (H P⁻ Hᵀ + R)⁻¹. Large when the prediction is uncertain and the measurement is precise.
Update the state | x = x⁻ + K (z − H x⁻). Correct the prediction by the innovation: the gap between measurement z and prediction.
Update the uncertainty | P = (I − K H) P⁻. It shrinks, because we gained information.
:::

If **no measurement** arrives (a missed detection), skip the last three steps: you only predict, and `P` keeps growing. That is how a tracker survives short occlusions.

Play with it. Change the noise levels and the missed-detection rate:

```viz algo=kalman title="A noisy track, filtered"
```

## A constant-velocity tracker from scratch

```python run title="Kalman filter for the ball in the synthetic video" level=advanced shared
import numpy as np
import cvlab

frames, tracks = cvlab.video(n=60)
truth = np.array([[(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] for b in tracks["ball"]])          # the true centre of the ball in each frame

rng = np.random.default_rng(1)
sigma = 6.0                                                                              # the detector jitters by ~6 px
meas = truth + rng.normal(0, sigma, truth.shape)
missing = rng.random(len(truth)) < 0.2                                                   # 20% of the detections are missed
meas_or_none = [None if m else z for z, m in zip(meas, missing)]

def kalman_track(measurements, sigma, q):
    dt = 1.0
    F = np.array([[1, 0, dt, 0], [0, 1, 0, dt], [0, 0, 1, 0], [0, 0, 0, 1]], float)       # constant velocity
    H = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], float)                                     # we measure the position only
    Q = q * np.array([[dt**4 / 4, 0, dt**3 / 2, 0], [0, dt**4 / 4, 0, dt**3 / 2], [dt**3 / 2, 0, dt**2, 0], [0, dt**3 / 2, 0, dt**2]])
    R = np.eye(2) * sigma ** 2
    first = next(z for z in measurements if z is not None)
    x = np.array([first[0], first[1], 0, 0], float)                                       # initial state: speed unknown
    P = np.diag([sigma ** 2, sigma ** 2, 100.0, 100.0])                                   # and very uncertain
    out = []
    for z in measurements:
        x = F @ x                                                                         # predict
        P = F @ P @ F.T + Q
        if z is not None:                                                                 # update, only if we have a measurement
            S = H @ P @ H.T + R
            K = P @ H.T @ np.linalg.inv(S)
            x = x + K @ (z - H @ x)
            P = (np.eye(4) - K @ H) @ P
        out.append(x.copy())
    return np.array(out)

est = kalman_track(meas_or_none, sigma, q=0.3)
rmse = lambda a, b: float(np.sqrt(np.mean(np.sum((a - b) ** 2, axis=1))))
has = ~missing
print(f"detections: {int(has.sum())} of {len(truth)} frames")
print("RMS position error   raw detections (only where they exist):", round(rmse(meas[has], truth[has]), 2), "px")
print("RMS position error   Kalman estimate (all frames):          ", round(rmse(est[:, :2], truth), 2), "px")
print("estimated speed at the end:", np.round(est[-1, 2:], 2), "px/frame   true speed:", np.round(truth[-1] - truth[-2], 2))
```

The filter has **lower error than the raw detections**, and it provides an estimate for **every** frame, including the missed ones. It also estimates the **velocity**, which we never measured directly: the filter infers it from the changes in position.

## Tuning Q and R

`R` comes from your detector: measure its jitter on a static object. `Q` is harder: it says how much the object's motion can deviate from "constant velocity". The effect is a trade-off:

- **Large Q / small R**: trust measurements → the estimate follows noise closely, little lag.
- **Small Q / large R**: trust the model → very smooth, but **lags behind** real manoeuvres (turns, stops).

```python run title="Effect of the process noise q" level=advanced shared
print("q        RMS error (px)")
for q in (0.001, 0.01, 0.1, 0.3, 1.0, 5.0, 30.0):
    e = kalman_track(meas_or_none, sigma, q)
    print(f"{q:7.3f} {rmse(e[:, :2], truth):10.2f}")
```

There is a sweet spot (here around `q` of 0.1–1). Too small a `q` makes the filter lag; too large lets the noise through. A well-tuned filter has **innovations** (`z − H x⁻`) that look like white noise with the covariance `S` that the filter predicts. Checking this (the **NIS/NEES** statistics) is the professional way to tune.

## OpenCV's KalmanFilter

```python run title="cv2.KalmanFilter" level=intermediate shared
import cv2

kf = cv2.KalmanFilter(4, 2)                                     # 4 state variables, 2 measured
kf.transitionMatrix = np.array([[1, 0, 1, 0], [0, 1, 0, 1], [0, 0, 1, 0], [0, 0, 0, 1]], np.float32)
kf.measurementMatrix = np.array([[1, 0, 0, 0], [0, 1, 0, 0]], np.float32)
kf.processNoiseCov = 0.3 * np.array([[.25, 0, .5, 0], [0, .25, 0, .5], [.5, 0, 1, 0], [0, .5, 0, 1]], np.float32)
kf.measurementNoiseCov = np.eye(2, dtype=np.float32) * sigma ** 2
first = next(z for z in meas_or_none if z is not None)
kf.statePost = np.array([[first[0]], [first[1]], [0], [0]], np.float32)
kf.errorCovPost = np.diag([sigma ** 2, sigma ** 2, 100, 100]).astype(np.float32)

out = []
for z in meas_or_none:
    pred = kf.predict()                                         # step 1: predict
    if z is not None:
        kf.correct(np.array(z, np.float32).reshape(2, 1))       # step 2: correct (skipped if we missed the detection)
    out.append(kf.statePost.ravel().copy())
out = np.array(out)
print("cv2.KalmanFilter RMS error:", round(rmse(out[:, :2], truth), 2), "px   (same filter as the NumPy version:", round(rmse(est[:, :2], truth), 2), "px)")
```

## Beyond the linear filter

- **Extended Kalman filter (EKF)**: linearise a non-linear model (a robot turning, a camera projection) around the current estimate at every step. The most used variant in robotics.
- **Unscented Kalman filter (UKF)**: pass a few chosen sample points ("sigma points") through the non-linear model; no Jacobians needed and usually more accurate.
- **Particle filter**: represent the distribution by many samples; handles multi-modal, non-Gaussian cases (global localisation, "where am I?" with several candidates).
- **Smoother (RTS)**: use future measurements too, for the best offline estimate.
- **Information filter, factor graphs, and batch optimisation** (as in bundle adjustment and GTSAM) are the optimisation view of the same problem.

## Where you will meet it

| System | Role of the Kalman filter |
|---|---|
| **SORT / DeepSORT / ByteTrack** | Predict each object's box in the next frame, for matching |
| **Visual-inertial odometry** (MSCKF, VINS) | Fuse IMU and camera |
| **GPS/IMU navigation**, drones | Fuse sensors for position and attitude |
| **Robot localisation** (EKF-SLAM, AMCL uses particles) | Estimate pose from odometry and landmarks |
| **Eye and hand tracking, AR** | Smooth pose and reduce jitter |

:::interview Questions you may get
- "Explain the Kalman filter." Alternate prediction with a motion model and correction with a measurement; the gain weights them by their uncertainties; covariance tracks the uncertainty.
- "What do Q and R mean?" Process noise (model uncertainty) and measurement noise (sensor uncertainty); their ratio decides how much the filter trusts measurements.
- "What happens when a detection is missing?" Skip the update; the state follows the prediction and the covariance grows.
- "What assumptions does the basic Kalman filter make?" Linear dynamics and measurement models, and Gaussian noise; it is optimal under those assumptions.
- "How do you track a robot that turns?" Use a non-linear model with an EKF/UKF, or an interacting multiple model (IMM) with several motion models.
- "Why does a tracker use a Kalman filter at all?" To predict where the object will be (for association), to smooth noisy detections and to bridge short occlusions.
:::

```quiz
? If the measurement noise R is much larger than the prediction uncertainty, the Kalman gain K is...
+ Small: the filter trusts the prediction more
- Large: the filter trusts the measurement more
- Always 0.5
> K = P⁻ / (P⁻ + R) in 1-D.

? What does the filter do when a measurement is missing?
- It stops
+ It performs only the predict step; the uncertainty grows
- It resets the state
> That lets trackers survive short occlusions.

? A tuned filter lags behind a sudden turn. Which change reduces the lag?
- Smaller Q
+ Larger Q (allow more acceleration) or a motion model that fits the turn
- Larger R
> Larger Q makes the filter trust new measurements more.

? Which variant handles a non-linear measurement or motion model by linearising?
+ Extended Kalman filter (EKF)
- The running average
- The median filter
> The UKF uses sigma points instead of linearisation.
```

:::problem A tracker's box jitters and also lags behind a fast-moving object. How do you use the Kalman filter's parameters to understand and fix this? {level=medium tags="kalman,tuning,tracking"}
Think about Q, R and the motion model.

:::solution Model answer
Jitter means the filter trusts noisy measurements too much (R too small relative to Q): increase R (or reduce Q). Lag means it trusts the model too much (Q too small), or the model is wrong (constant velocity cannot follow acceleration): increase Q, add acceleration to the state (constant acceleration model), or use an IMM that switches between models. Measure the actual detector noise to set R, then tune Q so that the innovations are white and the normalised innovation squared is near the expected value. Also check the time step if the frame rate varies (use the real dt from timestamps).
:::
:::

:::keypoints
- The Kalman filter blends a motion-model prediction with a noisy measurement, weighted by their uncertainties (the gain). Combining information shrinks the uncertainty.
- Predict (`x = Fx`, `P = FPFᵀ + Q`), then update (`K`, `x`, `P`) when a measurement exists; without one, only predict.
- A constant-velocity model gives velocity for free. Q versus R sets smoothness versus lag.
- EKF/UKF handle non-linear models; it is the motion model inside SORT and in sensor fusion.
:::

:::resources
- [Roger Labbe: Kalman and Bayesian Filters in Python](https://github.com/rlabbe/Kalman-and-Bayesian-Filters-in-Python) — a free, hands-on book (Jupyter notebooks).
- [Bzarg: How a Kalman filter works, in pictures](https://www.bzarg.com/p/how-a-kalman-filter-works-in-pictures/) — the best visual introduction.
- [OpenCV: KalmanFilter class](https://docs.opencv.org/4.x/dd/d6a/classcv_1_1KalmanFilter.html) — the API.
:::
