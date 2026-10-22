---
title: Classical Computer Vision Question Bank
level: mixed
time: 90
summary: Around fifty classical-vision interview questions with model answers: image formation and colour, filtering and edges, morphology and shapes, geometry and warping, features and RANSAC, camera models, calibration, stereo, SfM, SLAM, point clouds, motion and tracking. Answer aloud first, then open the solution.
---

How to use it: **cover the solution, answer aloud in about a minute, then compare.** A strong answer has a one-line definition, the mechanism, a limit or failure mode, and an example from your own work. The difficulty tags (easy, medium, hard) show how deep a follow-up may go. Each question points to the module where the topic is taught, in case your answer was shaky.

## Image formation, colour and sampling

Start here: these look easy, and they are asked to check that you really know what an image is.

:::problem Why is a digital image a NumPy array, and what are the common pitfalls when you manipulate it? {level=easy tags="images,dtype"}
Shape, dtype, coordinate order.

:::solution Model answer
An image is a grid of intensity samples: shape `(H, W)` for grey or `(H, W, C)` for colour, usually `uint8` (0-255). Pitfalls: **`uint8` wraps around** (250 + 10 = 4), so convert to float or use `cv2.add` (saturating) before arithmetic; **OpenCV uses BGR**, Matplotlib and most deep-learning models use RGB; **indexing is `[row, col]` = `[y, x]`** while OpenCV drawing functions take `(x, y)`; resizing takes `(width, height)` but `.shape` gives `(height, width)`; slicing returns a **view**, not a copy; and JPEG is lossy (re-saving degrades it).
:::
:::

:::problem Why use HSV (or Lab) instead of RGB for colour segmentation? {level=easy tags="colour,hsv"}
Think about lighting changes.

:::solution Model answer
In RGB the three channels all change with brightness, so a red object in shadow has very different (R, G, B) values than in sun. **HSV separates hue (the colour), saturation (how vivid) and value (brightness)**, so a hue range with minimum saturation/value works across lighting changes. **Lab** is more perceptually uniform: distances roughly match perceived colour differences. Caveats: hue is circular (red wraps at 0/180 in OpenCV's 8-bit hue, so you need two ranges), hue is unreliable at low saturation or very dark pixels, and under strongly coloured light nothing is invariant: fix the lighting or white balance first.
:::
:::

:::problem How does a colour camera produce RGB when each pixel measures only one colour? {level=medium tags="bayer,sensor"}
Mosaic and interpolation.

:::solution Model answer
The sensor has a **Bayer colour-filter array** (typically 50% green, 25% red, 25% blue in a repeating 2×2 pattern). Each pixel records one colour; the **demosaicing** step interpolates the two missing colours from neighbours. Then the ISP applies black-level correction, white balance, colour correction matrix, denoising, gamma, sharpening and compression. Consequences: colour at edges can show **zipper or moiré artefacts**, the effective colour resolution is lower than the pixel count, and for measurement tasks it is often better to use the **raw** (or a monochrome sensor) and your own controlled pipeline.
:::
:::

:::problem What is gamma, and why does it matter for image processing and for training networks? {level=medium tags="gamma,linear"}
Linear light versus encoded values.

:::solution Model answer
Most 8-bit images are **gamma-encoded** (roughly value ≈ light^(1/2.2)) to use the bits efficiently where the eye is sensitive. Physical operations (blurring, resizing, averaging, lighting simulation) are correct in **linear light**; doing them on gamma-encoded values darkens blurred edges and shifts colours. For classical measurement tasks, convert to linear before filtering when physical accuracy matters. For networks, be consistent between training and inference: the network sees whichever encoding you give it, so the pre-processing (sRGB vs linear, normalisation) must match.
:::
:::

:::problem What is aliasing, and how do you avoid it when down-sampling an image? {level=medium tags="sampling,aliasing"}
Nyquist.

:::solution Model answer
Sampling a signal below twice its highest frequency (the **Nyquist** limit) folds high frequencies into false low-frequency patterns: moiré and jagged edges. When shrinking an image, **low-pass filter first** (Gaussian blur, or use an area/antialiased interpolation) and then subsample. `cv2.resize` with `INTER_AREA` (shrinking) or PIL's antialiased resize does this; plain `INTER_NEAREST` or `INTER_LINEAR` with a large factor aliases. This matters for deep learning too: different resize implementations in training and deployment give different accuracy, especially for small objects.
:::
:::

:::problem What limits the real resolution of a camera: megapixels, lens, or something else? {level=easy tags="resolution,optics"}
Several links in a chain.

:::solution Model answer
The **weakest link**: the lens (its MTF / sharpness, diffraction at small apertures, aberrations towards the edges), the sensor pixel size (smaller pixels collect less light, more noise), motion blur from the exposure time, focus error, atmosphere or window quality, and the compression. More megapixels on a poor lens give a larger blurry image. Practical rule: choose the pixel size on the object from the smallest feature to detect (at least 3-5 pixels across the defect), then pick a sensor and lens that deliver that sharpness over the field of view.
:::
:::

## Filtering, edges and thresholding

The module-2 toolbox: most interviews ask about at least one of Canny, Gaussian, Otsu or the Fourier view.

:::problem What is the difference between convolution and correlation, and why does it rarely matter in deep learning? {level=easy tags="convolution,correlation"}
The kernel flip.

:::solution Model answer
Convolution flips the kernel before sliding it; **correlation** does not. For a symmetric kernel (Gaussian, box) they are the same. Deep-learning libraries implement **correlation** and call it convolution: because the kernel weights are learned, the flip is irrelevant (the network learns the flipped kernel instead). It matters when you design a filter by hand with an asymmetric kernel (Sobel signs) or when you use the convolution theorem (the Fourier transform of a convolution is the product of transforms).
:::
:::

:::problem Why is the Gaussian filter preferred for smoothing, and how do you implement it efficiently? {level=easy tags="gaussian,blur"}
Separable, isotropic, no ringing.

:::solution Model answer
A Gaussian has no ringing, is **isotropic** (rotation-symmetric), is the unique kernel that creates no new extrema when increasing scale (scale-space), and is **separable**: a 2-D Gaussian equals a 1-D horizontal pass followed by a 1-D vertical pass, reducing the cost per pixel from k² to 2k. Kernel size should be about ±3σ (so size ≈ 6σ + 1). Repeated Gaussian blurs add variances (σ² = σ₁² + σ₂²), which is what makes scale-space pyramids and SIFT work. For very large σ, use a downsample-blur-upsample strategy or the FFT.
:::
:::

:::problem When is a median filter better than a Gaussian filter? {level=medium tags="median,noise"}
Salt-and-pepper noise and edges.

:::solution Model answer
For **impulse (salt-and-pepper) noise**: a single extreme pixel strongly skews a mean but is simply ignored by the median. The median also **preserves edges** better because it does not average across them, and it creates no new grey values. It is non-linear (cannot be written as a convolution) and slower, and it removes thin lines and small details. For Gaussian noise, a Gaussian, bilateral or non-local-means filter is usually better. In practice, the median filter is used before thresholding and on depth maps.
:::
:::

:::problem How does a bilateral filter smooth without blurring edges? {level=medium tags="bilateral,edge-preserving"}
Two weights.

:::solution Model answer
Each output pixel is a weighted average of neighbours with weight = **spatial Gaussian × range Gaussian**: far pixels count less (spatial) and pixels with a different intensity count less (range). Across an edge the intensity difference is large, so pixels on the other side get almost zero weight and the edge is preserved. Costs: slow for large windows (fast approximations exist), it can produce gradient reversals and a "cartoon" look, and parameters (σ_space, σ_range) need tuning. Alternatives: guided filter, non-local means, anisotropic diffusion.
:::
:::

:::problem Explain how the Canny edge detector works and what each parameter does. {level=medium tags="edges,gradient"}
Five steps.

:::solution Model answer
(1) **Gaussian smoothing** reduces noise (σ sets the scale of edges found). (2) **Gradient magnitude and direction** (Sobel). (3) **Non-maximum suppression**: keep only pixels that are local maxima along the gradient direction, thinning edges to one pixel. (4) **Double threshold**: strong edges above the high threshold, weak edges between low and high. (5) **Hysteresis**: keep weak edges only if they connect to strong ones, which removes isolated noise but keeps continuous contours. Typical ratio high:low = 2:1 or 3:1. Too low thresholds give noisy edges; too high break contours. Canny is a good local detector but knows nothing about objects, so shadows and texture produce edges too.
:::
:::

:::problem What is the Laplacian of Gaussian and where is it used? {level=medium tags="laplacian,log"}
Second derivative, zero crossings, blobs.

:::solution Model answer
The **Laplacian** is the sum of second derivatives, ∇²I; it responds to rapid intensity change in any direction and is zero for linear ramps. It is very noise-sensitive, so smooth first: **LoG = Laplacian of a Gaussian**, with zero-crossings marking edges (Marr-Hildreth) and extrema over scale marking **blobs** (scale-normalised LoG, approximated by Difference of Gaussians in SIFT). The variance of the Laplacian is also a popular **focus/sharpness measure**: a sharp image has strong second derivatives, a blurred one does not.
:::
:::

:::problem How does Otsu's threshold work, and when does it fail? {level=medium tags="otsu,threshold"}
Between-class variance.

:::solution Model answer
Otsu picks the threshold that **maximises the between-class variance** (equivalently minimises the within-class variance) of the two groups the histogram is split into, by trying all 256 levels. It works when the histogram is **bimodal** with similar-sized classes. It fails with uneven illumination (use **adaptive/local thresholding** or flat-field correction first), when one class is tiny (a small bright object on a large background shifts the threshold), when there is no clear separation, or with strong noise (blur first). Multi-level Otsu handles more classes.
:::
:::

:::problem A document photo has a shadow across the page. Plain thresholding fails. What do you do? {level=medium tags="adaptive,illumination"}
Local statistics.

:::solution Model answer
Use **adaptive thresholding**: compare each pixel to the mean (or Gaussian-weighted mean) of its neighbourhood minus a constant (`cv2.adaptiveThreshold`), which tolerates smooth illumination changes. Alternatives: estimate the background (large median/morphological closing/Gaussian), **divide** the image by it (flat-field/"background division"), then apply Otsu; or use CLAHE for contrast; or deep binarisation models for degraded documents. Choose the neighbourhood larger than the text stroke width but smaller than the scale of the shadow.
:::
:::

:::problem What does histogram equalisation do, and why is CLAHE usually better? {level=medium tags="histogram,clahe"}
Global versus local contrast.

:::solution Model answer
Histogram equalisation remaps intensities so the cumulative histogram becomes linear, spreading values and boosting global contrast. It amplifies noise in flat regions and can wash out images with large bright/dark areas. **CLAHE** (contrast-limited adaptive histogram equalisation) equalises **tile by tile** (for example 8×8) and **clips** the histogram at a limit before equalisation to cap noise amplification, then interpolates between tiles to avoid seams. It is the usual choice for medical images, underwater and low-light enhancement, and as a pre-processing step for classical detectors.
:::
:::

:::problem How do you use the Fourier transform in image processing? {level=hard tags="fourier,frequency"}
Low and high frequencies, convolution theorem.

:::solution Model answer
The 2-D FFT represents an image as sinusoids: **low frequencies** = smooth regions and overall brightness, **high frequencies** = edges and noise. Uses: **filtering** by multiplying the spectrum with a mask (low-pass blur, high-pass sharpening, notch filters to remove periodic noise such as scan-line or moiré patterns); **fast convolution** with large kernels (convolution theorem); **phase correlation** to find translations between images (the peak of the inverse FFT of the normalised cross-power spectrum); **deconvolution** (Wiener) for deblurring; and analysis of texture and sharpness. Remember: the FFT assumes periodic images, so use windowing to avoid edge artefacts.
:::
:::

## Morphology, shapes and classical segmentation

:::problem Explain erosion, dilation, opening and closing, and give a use for each. {level=easy tags="morphology"}
Structuring element.

:::solution Model answer
With a structuring element (kernel): **erosion** shrinks white regions (a pixel stays only if the whole kernel fits inside the object); **dilation** grows them. **Opening** = erosion then dilation: removes small bright specks and thin protrusions while keeping the size of larger objects. **Closing** = dilation then erosion: fills small holes and gaps. Others: **gradient** (dilation − erosion) = outline, **top-hat** = image − opening (small bright details on uneven background), **black-hat** = closing − image (small dark details). Typical uses: clean a thresholded mask (opening), join broken characters (closing), find outlines and remove uneven background.
:::
:::

:::problem Connected components versus contours: how do they differ and how do you choose? {level=medium tags="components,contours"}
Pixels versus boundaries.

:::solution Model answer
**Connected components labelling** assigns an ID to every group of touching foreground pixels (4- or 8-connectivity) and gives area, bounding box and centroid cheaply (`cv2.connectedComponentsWithStats`): ideal for counting and filtering blobs by size. **Contours** (`cv2.findContours`) trace the **boundaries** as point lists and give a hierarchy (holes inside objects), perimeter, convex hull, moments, shape descriptors and polygon approximations (Douglas-Peucker): ideal when you need shape analysis, orientation, or the object outline. Use components for counting/size filtering, contours for shape, rotated boxes and geometry.
:::
:::

:::problem How does the Hough transform detect lines, and what are its limitations? {level=medium tags="hough"}
Voting in parameter space.

:::solution Model answer
Each edge pixel votes for all lines through it. With the parameterisation ρ = x cos θ + y sin θ, a point maps to a sinusoid in (θ, ρ) space; collinear points' sinusoids intersect, creating a **peak in the accumulator**. Detect peaks above a threshold. The **probabilistic Hough** (`HoughLinesP`) samples points and returns segments with endpoints. Limits: depends on a good edge map, accumulator resolution and thresholds need tuning, cost grows with the number of parameters (circles need a 3-D accumulator, so use the gradient-based `HOUGH_GRADIENT`), and it finds infinite lines, so you must check segment extent. Often followed by RANSAC or least squares to refine.
:::
:::

:::problem Two coins touch and thresholding merges them into one blob. How do you separate them? {level=medium tags="watershed,distance"}
Distance transform and watershed.

:::solution Model answer
Compute the **distance transform** of the binary mask (each pixel's distance to the background): each coin gives a peak at its centre. Threshold or find local maxima of the distance map to get **markers** (one per coin, "sure foreground"), mark the background as another marker, and run the **watershed** from the markers on the gradient/negative distance image: the flooding fronts meet along the touching boundary. Pitfalls: **over-segmentation** if markers are noisy (smooth the distance map, use h-maxima), and coins of very different size need scale-aware markers. Alternative: the Hough circle transform, or an instance-segmentation network.
:::
:::

:::problem What are the strengths and weaknesses of template matching? {level=medium tags="template,matching"}
Normalised cross-correlation.

:::solution Model answer
Slide the template over the image and compute a similarity (normalised cross-correlation `TM_CCOEFF_NORMED` is robust to brightness and contrast changes). Strengths: simple, exact for a fixed known pattern, no training, sub-pixel peaks by interpolation, fast with FFT or image pyramids. Weaknesses: **not invariant** to rotation, scale or perspective (search over many templates/pyramid levels), sensitive to occlusion and background clutter, and slow for large templates. Use it for fiducials, fixed-view inspection, GUI testing; use features (SIFT/ORB) or learned detectors for pose and scale variations.
:::
:::

## Geometry, transforms and warping

:::problem List the planar transformations from most to least restrictive, with their degrees of freedom. {level=easy tags="affine,similarity"}
Translation to projective.

:::solution Model answer
**Translation** (2 DoF), **rigid/Euclidean** (rotation + translation, 3), **similarity** (+ uniform scale, 4), **affine** (6: also shear and anisotropic scale; parallel lines stay parallel), **projective/homography** (8: lines stay lines, parallelism is lost, as in a perspective view of a plane). Each higher class includes the previous ones. A homography is a 3×3 matrix defined up to scale, so 4 point correspondences (each giving 2 equations) determine it; an affine needs 3; a similarity needs 2.
:::
:::

:::problem What is a homography, and when does it exactly describe the relation between two images? {level=medium tags="homography"}
Planes and pure rotation.

:::solution Model answer
A 3×3 matrix H mapping homogeneous points x' ∼ H x. It is exact in two cases: (1) **the scene is a plane** (a wall, a document, the ground), seen from two arbitrary views; (2) **the camera only rotates** (no translation) about its centre, for any scene (panoramas). Otherwise parallax breaks it. It is estimated from ≥ 4 correspondences with the DLT (SVD) and made robust with RANSAC. Applications: document scanning, bird's-eye view of the road, panorama stitching, augmented reality on planar markers, mapping pixels to floor coordinates.
:::
:::

:::problem What is forward versus backward (inverse) warping, and why is backward preferred? {level=medium tags="warping,interpolation"}
Holes.

:::solution Model answer
Forward warping pushes each source pixel to its destination coordinate; destination pixels may receive no value (**holes**) or several. **Backward warping** loops over destination pixels, maps each back to the source with the inverse transform and **samples** there (with interpolation), so every destination pixel gets exactly one value and no holes appear. That is what `cv2.warpAffine/warpPerspective` do. Interpolation choice: nearest (labels, masks), bilinear (default), bicubic/Lanczos (quality, with possible ringing); remember to use nearest for segmentation masks and to handle borders (`BORDER_CONSTANT/REFLECT`).
:::
:::

:::problem Compare rotation matrices, Euler angles, axis-angle and quaternions. {level=medium tags="rotation,representation"}
Singularities, composition, interpolation.

:::solution Model answer
A **rotation matrix** (3×3 orthogonal, det = +1) composes by multiplication and acts directly on vectors, but has 9 numbers with 6 constraints. **Euler angles** (3 numbers) are intuitive but suffer **gimbal lock** (a singularity where two axes align and a degree of freedom is lost) and depend on the axis order convention. **Axis-angle / rotation vector** (`cv2.Rodrigues`) is compact (3 numbers: direction × angle), good for optimisation and for the output of PnP. **Unit quaternions** (4 numbers) have no gimbal lock, compose cheaply, and interpolate smoothly (SLERP): used for orientation in robotics and graphics, with the caveat q and −q describe the same rotation.
:::
:::

:::problem Why do we use homogeneous coordinates? {level=medium tags="homogeneous,projective"}
One matrix for translation and projection.

:::solution Model answer
Appending a 1 to a point `(x, y) → (x, y, 1)` lets **translation** and **perspective division** be expressed as matrix multiplication, so any chain of transforms (rotation, translation, projection) is a single matrix product. Points at infinity (directions) have last coordinate 0, so vanishing points and parallel lines are handled. A point is the same for all non-zero multiples (x,y,w) ∼ (kx,ky,kw), so after the multiplication you divide by the last coordinate. Lines in 2-D are also 3-vectors, and the line through two points is their cross product.
:::
:::

:::problem How do you estimate a homography from correspondences? Why normalise the points? {level=hard tags="dlt,svd"}
DLT and conditioning.

:::solution Model answer
Each correspondence x' ∼ Hx gives two linear equations in the 9 entries of H (via x' × Hx = 0). Stack 2N rows into a matrix A; the solution is the **right singular vector of A for the smallest singular value** (null space, up to scale). With noisy matches use more than 4 points and RANSAC. **Hartley normalisation**: translate the points to zero mean and scale so the average distance from the origin is √2 before the DLT, then undo it. Without it, the entries of A differ by orders of magnitude (pixel coordinates up to thousands, squared), the SVD is ill-conditioned and the result is noisy. Refine with non-linear least squares on the reprojection error.
:::
:::

## Features, matching and RANSAC

:::problem How does the Harris corner detector work? {level=medium tags="corners,harris"}
Structure tensor eigenvalues.

:::solution Model answer
Compute image gradients Ix, Iy, and in each window the **structure tensor** M = Σ w [[Ix², IxIy],[IxIy, Iy²]]. Its eigenvalues describe the local structure: both small = flat, one large = edge, **both large = corner**. Harris avoids the eigen-decomposition with the response R = det(M) − k·trace(M)², with k ≈ 0.04-0.06; threshold R and take non-maximum suppression. It is **rotation invariant** and fairly illumination robust (derivative-based) but **not scale invariant** (hence scale-space detectors such as Harris-Laplace, SIFT).
:::
:::

:::problem How does SIFT achieve scale and rotation invariance? {level=medium tags="sift"}
Scale-space extrema, orientation, descriptor.

:::solution Model answer
(1) Build a **Gaussian scale-space** and **Difference-of-Gaussians (DoG)**; keypoints are extrema in space and scale (so each keypoint has a scale). (2) Refine location, reject low-contrast points and edge-like points (using the Hessian ratio). (3) Assign a **dominant orientation** from a gradient-orientation histogram in the region around the keypoint at its scale; rotate the patch frame by it. (4) The **descriptor**: a 4×4 grid of cells × 8 orientation bins = 128 numbers of gradient histograms (normalised, clipped and re-normalised for illumination robustness). Result: robust to scale, rotation, moderate viewpoint and lighting changes; costly compared with ORB.
:::
:::

:::problem Why would you choose ORB over SIFT? {level=medium tags="orb,binary"}
Speed and licensing.

:::solution Model answer
ORB = **oriented FAST** corners (with an intensity-centroid orientation) + **rotated BRIEF** binary descriptors (256 bits of pairwise intensity comparisons, with learned pair selection). Matching uses **Hamming distance** (XOR + popcount), which is extremely fast, and descriptors are tiny (32 bytes). It runs in real time on CPUs and phones, was patent-free when SIFT was not (SIFT's patent has since expired), and it is the feature of ORB-SLAM. Weaker than SIFT under large scale/viewpoint changes and blur. Choose ORB for speed and embedded SLAM, SIFT (or learned features like SuperPoint) for accuracy.
:::
:::

:::problem Explain Lowe's ratio test and cross-checking. {level=medium tags="matching,ratio"}
Ambiguity filtering.

:::solution Model answer
For each descriptor in image A find its **two** nearest neighbours in B. Accept the match only if `d1 < 0.7-0.8 · d2`: a correct match is usually much closer than the second-best, while a wrong match among similar-looking patches (repetitive texture) has d1 ≈ d2 (ambiguous). **Cross-check / mutual nearest neighbours**: accept (a, b) only if b's best match is also a. They remove many outliers cheaply, but geometric verification (RANSAC) is still needed. Repetitive patterns (windows, tiles) break both.
:::
:::

:::problem Explain RANSAC. How many iterations do you need? {level=medium tags="ransac"}
Minimal sample, inlier ratio.

:::solution Model answer
Repeat: draw a **minimal sample** (e.g. 4 for a homography, 2 for a line), fit the model, count the **inliers** (residual below a threshold); keep the best model; finally refit using all its inliers. With inlier ratio w and sample size s, the number of iterations to get a clean sample with probability p is **N = log(1 − p) / log(1 − w^s)**. For w = 0.5, s = 4, p = 0.99: about 72 iterations. Choose the inlier threshold from the noise level. Variants: **MSAC** (truncated cost), **LO-RANSAC** (local optimisation), **PROSAC** (sample the best matches first), **MAGSAC++** (no threshold). Limits: fails with very low inlier ratios and with degenerate samples (collinear points).
:::
:::

:::problem How does a bag of visual words enable image search at scale? {level=hard tags="matching,retrieval"}
Vocabulary and inverted index.

:::solution Model answer
Extract local descriptors, **cluster** them (k-means, hierarchical) into a vocabulary of K visual words; represent each image as a **histogram of word counts** (TF-IDF weighted). Search with an **inverted index** (word → images containing it), so only images sharing words with the query are scored (cosine similarity). Then **geometric verification** with RANSAC on top candidates. VLAD/Fisher vectors and learned global descriptors (NetVLAD, DELG, DINOv2 embeddings with ANN search) are the modern successors (retrieval lesson).
:::
:::

:::problem How does HOG + SVM detect pedestrians, and why is it considered classical? {level=medium tags="hog,detection"}
Descriptor, window, classifier.

:::solution Model answer
Compute gradients, divide the window (64×128) into 8×8-pixel cells, build an **orientation histogram** per cell, normalise over overlapping 2×2 blocks (illumination robustness), concatenate (3780 numbers) and feed a **linear SVM**. Detection = **sliding window over an image pyramid** + non-maximum suppression; hard-negative mining improves it. It captures shape/silhouette well, but handcrafted features, fixed aspect ratio and many window evaluations limit accuracy; CNN detectors replaced it. It is still a reasonable baseline on tiny devices.
:::
:::

## Camera model, calibration and 3-D geometry

Probably the most important block for robotics and autonomous-vehicle interviews.

:::problem Write the pinhole projection and explain the intrinsic and extrinsic parameters. {level=easy tags="pinhole,intrinsics"}
K [R|t].

:::solution Model answer
`s·[u, v, 1]ᵀ = K [R | t] [X, Y, Z, 1]ᵀ` with `K = [[fx, 0, cx],[0, fy, cy],[0, 0, 1]]`. **Intrinsics K**: focal lengths in pixels (fx, fy), principal point (cx, cy), optional skew; they describe the camera itself. **Extrinsics [R|t]**: rotation and translation from the world to the camera frame (6 DoF); they describe where the camera is. The depth `s = Z_cam` is lost in the projection, which is why one image cannot give 3-D without more information. Lens distortion is applied before K.
:::
:::

:::problem What is lens distortion and how is it handled? {level=medium tags="distortion"}
Radial and tangential.

:::solution Model answer
Real lenses bend rays: **radial** distortion (barrel, pincushion), modelled by `x_d = x(1 + k1 r² + k2 r⁴ + k3 r⁶)`, and **tangential** distortion from lens misalignment (p1, p2). Estimate the coefficients during **calibration** and **undistort** the image (`cv2.undistort`, or better `initUndistortRectifyMap` + `remap` for video). For wide-angle/fisheye lenses use the fisheye model (`cv2.fisheye`). Always undistort (or use distorted-aware geometry) before measuring lines, angles or doing stereo and SLAM.
:::
:::

:::problem How does Zhang's camera calibration work, and what makes a good calibration? {level=medium tags="calibration"}
Planar target, homographies.

:::solution Model answer
Capture 15-30 images of a **planar pattern** (checkerboard, ChArUco) in different positions and orientations. For each image, find the corners and compute the **homography** between the plane and the image; each homography gives two constraints on the intrinsics (the rotation columns are orthonormal), so ≥ 3 views solve K in closed form; then **non-linear refinement** (Levenberg-Marquardt) minimises the total **reprojection error** over K, distortion and the pose of each view. Good calibration: patterns covering the whole image area including corners, strongly tilted views (for focal length), sharp images in focus, a rigid flat target, fixed focus/zoom, and a **RMS reprojection error** well below a pixel (and check on held-out images). Re-calibrate after any change of lens, focus or heavy shocks.
:::
:::

:::problem What is PnP and when do you use it? {level=medium tags="pnp"}
3-D to 2-D pose.

:::solution Model answer
**Perspective-n-Point** computes the camera pose (R, t) from N correspondences between known 3-D points and their image projections, given K. Minimal 3 points (P3P, up to 4 solutions), practical solvers EPnP, IPPE (planar), SQPnP; use **`solvePnPRansac`** with outliers, then refine with LM. Used for marker/fiducial pose, localising a camera in a map, object pose from keypoints, and AR. Needs good intrinsics, non-degenerate configurations (not all points collinear), and enough spread; accuracy decreases with distance and small marker size.
:::
:::

:::problem How is depth computed from a stereo pair, and what limits its accuracy? {level=medium tags="stereo,depth"}
Z = f B / d.

:::solution Model answer
After **rectification** (corresponding points lie on the same row), match each pixel to find the **disparity** d = x_left − x_right. Depth `Z = f·B / d` (focal length in pixels, baseline in metres). Differentiating, the depth error is `ΔZ ≈ Z² Δd / (f B)`: it **grows with the square of the distance**, so a larger baseline or focal length helps. Limits: textureless surfaces, repeated patterns, occlusions, reflective/transparent objects, calibration/rectification errors, and the disparity range. Methods: block matching, SGM (semi-global matching), and learned stereo (RAFT-Stereo, cost-volume networks).
:::
:::

:::problem Explain the fundamental and essential matrices. {level=hard tags="epipolar,essential"}
Epipolar constraint.

:::solution Model answer
For corresponding points x in view 1 and x' in view 2: `x'ᵀ F x = 0`. **F** (3×3, rank 2, 7 DoF) works in pixel coordinates and encodes the epipolar geometry of uncalibrated views; each point must lie on its **epipolar line** `l' = F x` in the other image. The **essential matrix** `E = Kᵀ F K = [t]ₓ R` is the calibrated version (normalised coordinates, 5 DoF) and can be **decomposed** (SVD) into the relative rotation R and translation direction t (up to scale, with 4 candidate solutions; pick the one with points in front of both cameras: cheirality). Estimate with the 8-point algorithm (normalised) or the 5-point algorithm + RANSAC. Monocular translation scale is unobservable.
:::
:::

:::problem How do you triangulate a 3-D point, and why can it fail? {level=hard tags="triangulation"}
Rays that do not intersect.

:::solution Model answer
Given a point's pixel in two or more views and the camera matrices P = K[R|t], each observation gives two linear equations in the homogeneous 3-D point (**DLT triangulation**: stack `u·P₃ − P₁` and `v·P₃ − P₂`, solve by SVD). Because of noise the rays do not meet exactly, so a final **non-linear minimisation of reprojection error** (or the midpoint method) refines it. It is poorly conditioned when the **baseline is small compared with the distance** (rays nearly parallel: depth uncertainty is huge), when the point is near the epipole, or with wrong matches; check the **triangulation angle** and the reprojection error.
:::
:::

:::problem Describe the structure-from-motion pipeline and the role of bundle adjustment. {level=hard tags="sfm,ba"}
Incremental SfM.

:::solution Model answer
**Feature extraction and matching** (SIFT + ratio test) → **geometric verification** (RANSAC on F/E/H) → choose a good **initial pair** (wide baseline, many inliers) → estimate the relative pose (E) and **triangulate** initial points → **incrementally register** new images (PnP + RANSAC), triangulate new points, and run **bundle adjustment** repeatedly → loop closure. **Bundle adjustment (BA)** jointly refines all camera poses and 3-D points by minimising the total reprojection error with sparse Levenberg-Marquardt (exploiting the Schur complement), and is what removes accumulated drift. Gauge freedom (global pose, scale) is fixed by anchoring. COLMAP is the standard implementation; global SfM and learned alternatives (DUSt3R/VGGT) exist.
:::
:::

:::problem What is the difference between visual odometry and visual SLAM? {level=medium tags="slam,vo"}
Drift and loop closure.

:::solution Model answer
**Visual odometry (VO)** estimates the camera's motion frame to frame (or over a short window) with no global map memory; errors accumulate as **drift**. **SLAM** builds and maintains a **map** and uses it to **relocalise and close loops** (recognising a previously visited place via place recognition and correcting the trajectory with pose-graph optimisation/BA), keeping the map globally consistent. Components: tracking, local mapping, loop closing (ORB-SLAM3). Monocular systems have an unknown **scale** that drifts; stereo, depth or an IMU (**visual-inertial**) fixes it. Failure modes: fast motion, textureless scenes, dynamic objects, lighting changes.
:::
:::

:::problem What is hand-eye calibration and why do robots need it? {level=medium tags="hand-eye"}
AX = XB.

:::solution Model answer
It finds the fixed transform between a **camera and the robot** so that camera measurements can be expressed in the robot base frame. **Eye-in-hand**: the camera is mounted on the arm; find the camera-to-gripper transform X. **Eye-to-hand**: a fixed camera; find the camera-to-base transform. Move the robot to many poses while observing a calibration target; with known robot poses and the target poses seen by the camera, solve `A X = X B` (Tsai, Park, Daniilidis, `cv2.calibrateHandEye`). Quality depends on diverse rotations (more than translations), accurate robot kinematics, and good intrinsics; verify by touching known points with the tool tip. Small rotation errors become large position errors at long reach.
:::
:::

:::problem How does ICP align two point clouds, and what are its failure modes? {level=medium tags="icp,pointcloud"}
Closest points + best rigid transform.

:::solution Model answer
Iterate: (1) for each source point find the **nearest point** in the target (k-d tree); (2) compute the **best rigid transform** between the matched pairs in closed form (centre both sets, SVD of the cross-covariance); (3) apply and repeat until convergence. Variants: point-to-plane (uses target normals: faster convergence), trimmed ICP (reject far pairs), GICP, colour ICP. Failure modes: **needs a good initial alignment** (local minima), partial overlap and outliers, symmetric or featureless geometry (a plane or a cylinder: motion along the symmetry is unconstrained), and different densities. Provide initialisation from features (FPFH + RANSAC, global registration) or odometry.
:::
:::

## Motion, tracking and video

:::problem Explain the brightness-constancy assumption and the aperture problem. {level=medium tags="optical-flow"}
Lucas-Kanade.

:::solution Model answer
Optical flow assumes a pixel keeps its intensity as it moves: I(x+u, y+v, t+1) = I(x, y, t), giving one linear equation per pixel, `Ix u + Iy v + It = 0`, with two unknowns. The **aperture problem**: through a small window onto an edge you can only measure motion **perpendicular to the edge**. **Lucas-Kanade** adds the assumption that the flow is constant in a small window and solves the least-squares system (the same structure tensor as Harris: it is well-conditioned only at corners/textured places). Pyramids handle large motions. **Horn-Schunck** adds a global smoothness term (dense flow); modern methods (RAFT) learn it. Violations: lighting changes, occlusions, large displacements, textureless regions.
:::
:::

:::problem How does background subtraction work, and what breaks it? {level=medium tags="background,subtraction"}
Model per pixel.

:::solution Model answer
Maintain a model of the static background (running average, Gaussian mixture MOG2, KNN, or a deep model), and mark pixels that differ from it as foreground, then clean with morphology and connected components. Breaks when: **lighting changes or shadows** (MOG2 can detect shadows), **camera motion** (needs stabilisation), **dynamic background** (trees, water), **objects that stop** (they get absorbed into the background), slow initialisation, and camouflage. Often used as a cheap motion trigger before a heavier detector.
:::
:::

:::problem Explain the Kalman filter's predict and update steps and where it is used in vision. {level=medium tags="kalman,tracking"}
State, covariance, gain.

:::solution Model answer
The state (for example position and velocity) with covariance P. **Predict**: `x⁻ = F x`, `P⁻ = F P Fᵀ + Q` (uncertainty grows by the process noise Q). **Update** with a measurement z: innovation `y = z − H x⁻`, innovation covariance `S = H P⁻ Hᵀ + R`, **gain** `K = P⁻ Hᵀ S⁻¹`, `x = x⁻ + K y`, `P = (I − K H) P⁻`. The gain balances trust in the model against the measurement (small R → trust measurements). It is optimal for linear-Gaussian systems; use EKF/UKF for non-linear models. In vision: **tracking** (SORT/DeepSORT/ByteTrack predict each box and match detections), sensor fusion (visual-inertial), smoothing noisy keypoints and depth. Tune Q and R from data; the Mahalanobis distance of the innovation gates associations.
:::
:::

:::problem How does multi-object tracking by detection work? {level=medium tags="mot,association"}
Predict, associate, update.

:::solution Model answer
Each frame: run a detector; **predict** each existing track's new position (Kalman filter); build a **cost matrix** between tracks and detections (IoU, centre distance, appearance embedding similarity); solve the **assignment** with the Hungarian algorithm; update matched tracks, create tracks for unmatched detections (after confirmation), and delete tracks unmatched for N frames. **SORT** uses motion + IoU only (fast, ID switches when occluded), **DeepSORT** adds appearance embeddings, **ByteTrack** also uses low-confidence detections in a second association step (recovers occluded objects), and OC-SORT/BoT-SORT improve motion and camera compensation. Metrics: MOTA, IDF1, HOTA, ID switches.
:::
:::

:::problem Tracks keep swapping identities when two people cross. What do you do? {level=hard tags="tracking,failure"}
Appearance, motion, geometry, re-identification.

:::solution Model answer
Combine cues: add an **appearance embedding** (ReID network) to the association cost; use better **motion models** (constant velocity with proper Q), camera-motion compensation, and gating; use higher-frame-rate detection to reduce displacement; handle occlusion by keeping tracks alive longer and re-identifying afterwards; use 3-D or ground-plane position if cameras are calibrated; for fixed environments add multi-camera fusion. Evaluate with IDF1/HOTA and look at the ID switches in a video review; check that the detector itself is not merging the two people (crowded NMS).
:::
:::

```quiz
? A homography exactly describes the mapping between two views when…
+ The scene is planar, or the camera only rotates about its centre
- The camera moves in any way over any scene
- Both images are grey
> Parallax breaks it otherwise.

? In RANSAC with inlier ratio 0.5 and a minimal sample of 4, about how many iterations give a 99% chance of a clean sample?
+ About 70
- About 4
- About 4000
> N = log(1 − 0.99) / log(1 − 0.5⁴).

? Which statement about Otsu's threshold is true?
+ It maximises the between-class variance and works best on bimodal histograms
- It always handles uneven lighting
- It needs labelled data
> Use adaptive thresholding for shadows.

? What happens to stereo depth error as the distance doubles?
+ It grows about four times
- It stays the same
- It halves
> ΔZ ≈ Z² Δd / (f B).
```

:::keypoints
- Be able to explain, with a diagram and a failure mode: convolution, Gaussian/median/bilateral, Canny, Otsu, morphology, Hough, homography, Harris, SIFT/ORB, ratio test, RANSAC.
- Camera geometry: K[R|t], distortion, Zhang calibration, PnP, stereo `Z = fB/d`, epipolar geometry (F, E), triangulation, SfM and BA, VO versus SLAM, hand-eye calibration, ICP.
- Motion: brightness constancy and aperture problem, background subtraction, Kalman filter, tracking-by-detection with Hungarian assignment.
- Always add where the method breaks; that is what separates strong answers from textbook ones.
:::

:::resources
- [Szeliski: Computer Vision: Algorithms and Applications (free online)](https://szeliski.org/Book/) — the standard classical reference.
- [Hartley and Zisserman: Multiple View Geometry in Computer Vision (book page)](https://www.robots.ox.ac.uk/~vgg/hzbook/) — the geometry bible.
- [OpenCV documentation](https://docs.opencv.org/4.x/) — functions behind the answers.
:::
