---
title: The Pinhole Camera Model
level: intermediate
time: 45
summary: The maths that turns a 3-D point into a pixel. Camera coordinates, the intrinsic matrix K (focal length and principal point), extrinsics [R|t], the projection matrix, field of view, and how to go back from a pixel and a depth to a 3-D point.
---

A camera turns a 3-D world into a 2-D picture. We lose one dimension: **depth**. To work with 3-D (robot arms, measuring, AR, SLAM) we need a precise model of how this happens. The standard model is the **pinhole camera**, and its maths is the foundation of this whole module.

## The idea

Imagine a dark box with a tiny hole on one side and a screen on the opposite side. Light from each point of the scene passes through the hole and lands on one point of the screen. The picture on the screen is **upside down**, and every scene point is mapped to **one** image point by a straight line through the hole. A real lens works much like this, but gathers more light.

:::analogy
Hold up a thumb at arm's length and close one eye. Move the thumb away: it gets smaller. Everything on one straight line from your eye lands on the same spot of your view. That is projection: **points on the same ray through the camera look like one point.** That is why depth is lost in a single picture.
:::

## Camera coordinates

Put the origin at the **centre of the camera** (the pinhole). The **Z axis** points forward, along the way the camera looks. **X** points right and **Y** points down (the same as image columns and rows). A point at `(X, Y, Z)` is `Z` units in front of the camera.

By similar triangles, if the image plane is `f` units from the pinhole (`f` = focal length), the point lands at:

:::formula Pinhole projection
x = f\,\frac{X}{Z}, \qquad y = f\,\frac{Y}{Z}
:::

Two big facts: **double the distance Z and the image size halves**, and **more focal length means more zoom**.

## From the image plane to pixels: the matrix K

The sensor has pixels, and the pixel origin is at the **top-left corner**, not the centre. So we convert with the **focal length in pixels** (`fx`, `fy`) and the **principal point** `(cx, cy)`, the pixel where the optical axis hits the sensor (usually near the centre):

:::formula Intrinsic matrix and projection
\begin{pmatrix} u \\ v \\ 1 \end{pmatrix} \sim K \begin{pmatrix} X \\ Y \\ Z \end{pmatrix}, \qquad K = \begin{pmatrix} f_x & 0 & c_x \\ 0 & f_y & c_y \\ 0 & 0 & 1 \end{pmatrix}
:::

(The `∼` means "up to scale": after multiplying, divide by the third value, which is `Z`.) So `u = fx·X/Z + cx` and `v = fy·Y/Z + cy`.

`K` holds the **intrinsic parameters**: they belong to the camera and its lens, and do not change when the camera moves. (A fifth parameter, **skew**, is zero for almost every modern camera.)

How big is `f` in pixels? From the real lens and sensor: `fx = f_mm × image_width_px / sensor_width_mm`. And the **field of view** follows: `FOV = 2·atan(W / (2·fx))`.

```python run title="Focal length in pixels and field of view" level=easy
import numpy as np

f_mm, sensor_w_mm, width_px = 6.0, 5.6, 1280                  # a 6 mm lens on a 5.6 mm wide sensor, 1280 pixels across
fx = f_mm * width_px / sensor_w_mm
fov = 2 * np.degrees(np.arctan(width_px / (2 * fx)))
print("focal length in pixels fx =", round(fx, 1))
print("horizontal field of view  =", round(fov, 1), "degrees")

print("\nwide lens (f = 2.8 mm):", round(2 * np.degrees(np.arctan(5.6 / (2 * 2.8))), 1), "degrees   telephoto (f = 25 mm):", round(2 * np.degrees(np.arctan(5.6 / (2 * 25))), 1), "degrees")
```

## Extrinsics: where the camera is

Points are usually known in some **world frame** (a table, a robot base). The camera has a position and orientation in that world, described by a rotation matrix `R` (3×3) and a translation vector `t`. They convert world coordinates to **camera** coordinates: `X_cam = R·X_world + t`. These are the **extrinsic parameters**, and they change every time the camera moves.

Putting it together gives the **projection matrix** `P` (3×4):

:::formula Full projection
\lambda \begin{pmatrix} u \\ v \\ 1 \end{pmatrix} = K\,[R \mid t] \begin{pmatrix} X_w \\ Y_w \\ Z_w \\ 1 \end{pmatrix}, \qquad P = K\,[R \mid t]
:::

:::flow World point to pixel
World point (Xw, Yw, Zw) | A point in some fixed 3-D frame, in metres.
Rotate and translate: [R | t] | The extrinsics. Gives the point in camera coordinates (X, Y, Z).
Divide by depth: (X/Z, Y/Z) | Perspective division. This is where depth is lost.
Apply K | Multiply by focal lengths and add the principal point. Gives the pixel (u, v).
Lens distortion (next lesson) | Real lenses bend straight lines. Applied between the division and K.
:::

Try the camera and see what each knob does:

```viz algo=pinhole title="Move, zoom and turn: see the pixels change"
```

## Project points in code

```python run title="Project 3-D points with K, R, t" level=easy
import cv2
import numpy as np

K = np.array([[800., 0, 320], [0, 800., 240], [0, 0, 1]])        # fx = fy = 800 px, principal point (320, 240): a 640 x 480 camera
rvec = np.array([0.0, 0.0, 0.0])                                   # the camera looks straight along +Z (no rotation)
tvec = np.array([0.0, 0.0, 0.0])

cube = np.array([[x, y, z] for x in (-0.1, 0.1) for y in (-0.1, 0.1) for z in (1.0, 1.2)], np.float64)      # a 20 cm cube, 1 m away
pixels, _ = cv2.projectPoints(cube, rvec, tvec, K, None)          # OpenCV: handles R (as rvec), t, K and distortion
pixels = pixels.reshape(-1, 2)

# the same by hand: u = fx * X / Z + cx
by_hand = np.c_[800 * cube[:, 0] / cube[:, 2] + 320, 800 * cube[:, 1] / cube[:, 2] + 240]
print("OpenCV and my formula agree:", bool(np.allclose(pixels, by_hand)))
print("near corner (-0.1, -0.1, 1.0) lands at", np.round(pixels[0], 1), "; the far corner (-0.1, -0.1, 1.2) at", np.round(pixels[1], 1), "(closer to the centre)")
print("cube width in pixels at 1.0 m:", round(abs(pixels[4, 0] - pixels[0, 0]), 1), " at 1.2 m:", round(abs(pixels[5, 0] - pixels[1, 0]), 1))
```

Rotation in OpenCV is stored as a **rotation vector** (`rvec`, 3 numbers: the axis times the angle, "Rodrigues form"). Convert to and from a matrix with `cv2.Rodrigues`.

```python run title="Rotation vector and matrix" level=easy
import cv2
import numpy as np

rvec = np.array([0.0, np.deg2rad(30), 0.0])                       # turn 30 degrees about the Y axis
R, _ = cv2.Rodrigues(rvec)
print("rotation matrix:\n", np.round(R, 3))
print("R^T R = identity:", bool(np.allclose(R.T @ R, np.eye(3))), "  det R =", round(float(np.linalg.det(R)), 3))
back, _ = cv2.Rodrigues(R)
print("back to a vector:", np.round(back.ravel(), 3), "= (0, 0.524, 0) radians")
```

## Going back: pixel + depth = 3-D point

A pixel alone defines only a **ray**. If you also know the depth `Z` (from a depth camera, stereo, or because the point lies on a known plane such as a table), the point is determined. Invert `K`:

:::formula Back-projection
X = \frac{(u - c_x)\,Z}{f_x}, \qquad Y = \frac{(v - c_y)\,Z}{f_y}
:::

```python run title="Back-project a pixel to 3-D" level=easy
import numpy as np

K = np.array([[800., 0, 320], [0, 800., 240], [0, 0, 1]])
u, v, Z = 400, 300, 1.5                                           # a pixel and its measured depth in metres
X = (u - K[0, 2]) * Z / K[0, 0]
Y = (v - K[1, 2]) * Z / K[1, 1]
print("3-D point (camera frame):", np.round([X, Y, Z], 3), "metres")

# the ray through the pixel, and the point where it meets a table plane Z_table:
ray = np.linalg.inv(K) @ np.array([u, v, 1.0])                    # direction (X/Z, Y/Z, 1)
for z in (1.0, 1.5, 2.0):
    print(f"if the point is at depth {z} m: ", np.round(ray * z, 3))
```

Every one of the three points projects to the same pixel. That is the ambiguity that depth sensors, stereo and motion are designed to remove.

## Common mistakes

- **Mixing units**: `f` in millimetres versus pixels. Use pixels in code.
- **Resizing the image without scaling K**: if you halve the image, `fx, fy, cx, cy` all halve too. Cropping shifts `cx, cy`.
- **Axis conventions**: OpenCV uses X right, Y down, Z forward. OpenGL, ROS and many 3-D tools use different axes (for example Y up, Z backward). Transform between them explicitly.
- **Using the wrong frame**: `[R|t]` goes **from world to camera**. The camera's position in the world is `−Rᵀt`.
- **Ignoring distortion** for wide-angle lenses: the next lesson.

:::interview Questions you may get
- "Write the projection equation of a pinhole camera." `λ [u v 1]ᵀ = K [R|t] [X Y Z 1]ᵀ`, with K containing fx, fy, cx, cy.
- "What are intrinsic and extrinsic parameters?" Intrinsics (K, distortion) belong to the camera; extrinsics (R, t) are its pose in the world.
- "What happens to K if you resize an image by a factor s?" fx, fy, cx, cy scale by s.
- "How do you get a 3-D point from a pixel?" You also need depth, or a constraint such as a plane: `X = (u−cx)Z/fx`.
- "Where is the camera centre in world coordinates?" `C = −Rᵀ t`.
- "How does focal length relate to field of view?" `FOV = 2·atan(W / 2f)`.
:::

```quiz
? A point doubles its distance from the camera. Its image size becomes...
- Twice as large
+ Half as large
- The same
> Image size is proportional to 1/Z.

? You halve the width and height of an image. How must K change?
- Not at all
+ fx, fy, cx and cy are all halved
- Only fx and fy
> Pixel units shrink, so all pixel-based parameters scale.

? What does the principal point (cx, cy) represent?
+ The pixel where the optical axis meets the sensor
- The brightest pixel
- The camera position
> It is usually near the image centre but not exactly.

? A pixel and a depth are known. How do you get the 3-D point in the camera frame?
- Multiply by R
+ X = (u−cx)Z/fx, Y = (v−cy)Z/fy, Z = depth
- Divide by K's determinant
> This is back-projection.
```

:::problem A robot camera sees a coin on a flat table at pixel (410, 290). The camera is 0.60 m above the table looking straight down, fx = fy = 900 px, principal point (320, 240). Where is the coin relative to the point directly below the camera? {level=easy tags="pinhole,back-projection,robotics"}
Use the known plane.

:::solution Model answer
The table is a plane at depth Z = 0.60 m (camera looks straight down, so depth is the distance to the table). X = (410 − 320) × 0.60 / 900 = 0.060 m. Y = (290 − 240) × 0.60 / 900 = 0.0333 m. So the coin is 6.0 cm to the right and 3.3 cm "down" in the image direction from the point below the camera. Accuracy depends on calibration (K and distortion) and on the table really being at Z = 0.60 m and perpendicular to the optical axis; a tilt of the camera makes the depth along each ray differ.
:::
:::

:::keypoints
- Pinhole projection: `u = fx·X/Z + cx`, `v = fy·Y/Z + cy`. Depth is lost in a single image.
- K (intrinsics) belongs to the camera; [R|t] (extrinsics) is the camera pose; `P = K[R|t]`.
- `fx = f_mm · W_px / sensor_mm`; FOV = 2·atan(W/2fx). Resizing scales K.
- A pixel is a ray. Add depth (or a plane) to get a 3-D point.
- Watch axis conventions and frame directions (world to camera).
:::

:::resources
- [OpenCV: camera calibration and 3D reconstruction (the pinhole model)](https://docs.opencv.org/4.x/d9/d0c/group__calib3d.html) — the model, with distortion terms.
- [First Principles of Computer Vision (Columbia, Shree Nayar): camera models](https://fpcv.cs.columbia.edu) — clear video lectures.
- [Hartley and Zisserman: Multiple View Geometry, chapter 6](https://www.robots.ox.ac.uk/~vgg/hzbook/) — the camera model in full.
:::
