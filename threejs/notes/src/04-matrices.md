---
title: Matrices and Transforms
summary: How position, rotation and scale become one 4×4 matrix, why the order of operations matters, how the scene graph multiplies parent and child matrices, inverses and the view matrix, and the normal matrix that keeps lighting correct under non-uniform scale.
---

## What a matrix does

:::def Linear transformation
A function on vectors that keeps straight lines straight and the origin fixed: rotations, scales, shears and reflections. Every linear transformation of 3D space can be written as a $3\times3$ matrix $A$, and applied to a vector by multiplication: $\mathbf{v}' = A\mathbf{v}$.
:::

The single most useful fact about matrices in graphics: **the columns of the matrix are where the basis vectors land.** If a transformation sends $\hat{\mathbf{x}}$ to $\mathbf{c}_1$, $\hat{\mathbf{y}}$ to $\mathbf{c}_2$ and $\hat{\mathbf{z}}$ to $\mathbf{c}_3$, then its matrix is $[\,\mathbf{c}_1\ \mathbf{c}_2\ \mathbf{c}_3\,]$, and any vector $(x,y,z)$ maps to $x\mathbf{c}_1 + y\mathbf{c}_2 + z\mathbf{c}_3$.

@fig(basis_transform) A matrix is a new set of axes. Its first column is where the x-axis goes and its second column where the y-axis goes. Here the columns are $(1.5, 0.5)$ and $(-0.5, 1)$, which rotates, stretches and shears the grid.

:::formula Matrix times vector
$$\begin{pmatrix} a & b & c \\ d & e & f \\ g & h & i \end{pmatrix}\begin{pmatrix} x \\ y \\ z \end{pmatrix} = \begin{pmatrix} ax + by + cz \\ dx + ey + fz \\ gx + hy + iz \end{pmatrix}$$
Each output component is the dot product of one **row** with the vector.
:::

## Homogeneous coordinates and 4×4 matrices

Translation ("move by $\mathbf{t}$") is not linear: it moves the origin. A $3\times3$ matrix cannot express it. The trick is to add a fourth coordinate $w$ and use $4\times4$ matrices.

:::def Homogeneous coordinates
A 3D point $(x, y, z)$ is written $(x, y, z, 1)$; a direction is written $(x, y, z, 0)$. A $4\times4$ matrix can then hold a $3\times3$ linear part plus a translation in its fourth column. After a perspective projection $w$ can become any value, and the actual 3D point is recovered by dividing by it: $(x/w, y/w, z/w)$.
:::

:::formula Translation, scale and rotation matrices
$$T = \begin{pmatrix} 1&0&0&t_x\\0&1&0&t_y\\0&0&1&t_z\\0&0&0&1\end{pmatrix}\quad S = \begin{pmatrix} s_x&0&0&0\\0&s_y&0&0\\0&0&s_z&0\\0&0&0&1\end{pmatrix}$$
$$R_x(\theta) = \begin{pmatrix}1&0&0\\0&c&-s\\0&s&c\end{pmatrix}\quad R_y(\theta) = \begin{pmatrix}c&0&s\\0&1&0\\-s&0&c\end{pmatrix}\quad R_z(\theta) = \begin{pmatrix}c&-s&0\\s&c&0\\0&0&1\end{pmatrix}$$
with $c = \cos\theta$, $s = \sin\theta$ (rotation matrices shown as their $3\times3$ part). Positive $\theta$ rotates anticlockwise when looking down the axis towards the origin.
:::

:::calc Translation affects points but not directions
$T$ with $\mathbf{t} = (5, 0, 2)$.

- Point $(1, 1, 1, 1)$: $(1 + 5,\ 1 + 0,\ 1 + 2,\ 1) = (6, 1, 3)$. Moved.
- Direction $(1, 1, 1, 0)$: the translation column is multiplied by $w = 0$, so the result is $(1, 1, 1)$. Unchanged, as a direction should be.
:::

:::calc Rotating a point 90° about Y
$\theta = 90°$: $c = 0$, $s = 1$. Point $(1, 0, 0)$:
$$R_y\,(1,0,0)^T = (c\cdot 1 + 0 + s\cdot 0,\ 0,\ -s\cdot 1 + 0 + c\cdot 0) = (0, 0, -1)$$
A point on +X swings round to −Z. Seen from above (+Y looking down), that is an anticlockwise quarter turn, which matches the right-hand rule. In three.js, `mesh.rotation.y = Math.PI / 2` does exactly this to every vertex.
:::

## Composition and the order of operations

Multiplying matrices composes transformations. Because vectors are columns and multiply on the right, **the transformation nearest the vector happens first**: in $T R S\,\mathbf{p}$, the point is scaled, then rotated, then translated.

:::formula The model matrix
$$M = T\,R\,S$$
three.js builds every object's local matrix this way from `position` ($T$), `quaternion`/`rotation` ($R$) and `scale` ($S$): scale about the object's origin, rotate about its origin, then move it into place. This is `Matrix4.compose(position, quaternion, scale)`.
:::

@fig(trs_order) Order matters. Rotating then translating (left) moves the object to the target and keeps it there. Translating then rotating (right) swings the object around the world origin, like a ball on a string.

:::calc Same pieces, different order
$\mathbf{p} = (1, 0, 0)$, $S$ = uniform scale 2, $R$ = 90° about Z ($c=0$, $s=1$), $T$ = translate by $(5, 0, 0)$.

1. $T R S\,\mathbf{p}$: scale gives $(2, 0, 0)$; rotate gives $(0, 2, 0)$; translate gives $(5, 2, 0)$.
2. $R T S\,\mathbf{p}$: scale gives $(2, 0, 0)$; translate gives $(7, 0, 0)$; rotate gives $(0, 7, 0)$.
3. $S R T\,\mathbf{p}$: translate gives $(6, 0, 0)$; rotate gives $(0, 6, 0)$; scale gives $(0, 12, 0)$.

Three different answers: **matrix multiplication is not commutative**. When something orbits the origin instead of spinning in place, the order is wrong.
:::

:::tip Rotating around a pivot
To spin a door around its hinge rather than its centre, either translate the geometry so the hinge is at the origin (`geometry.translate(0.5, 0, 0)`), or nest it: a `Group` placed at the hinge, with the door as a child offset by half its width. Rotate the group. The same idea, $T_{\text{pivot}} R\,T_{\text{pivot}}^{-1}$, appears whenever you rotate about an arbitrary point.
:::

```js title="three.js — a door on a hinge"
const hinge = new THREE.Group();
hinge.position.set(-0.5, 1, 0);                 // where the hinge is in the world
scene.add(hinge);
const door = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 0.05), wood);
door.position.x = 0.5;                          // the door's centre is 0.5 m from the hinge
hinge.add(door);
hinge.rotation.y = -Math.PI / 3;                // opens 60° about the hinge, not the centre
```

```jsx title="R3F — the same nesting"
<group position={[-0.5, 1, 0]} rotation-y={open ? -Math.PI / 3 : 0}>
  <mesh position-x={0.5}>
    <boxGeometry args={[1, 2, 0.05]} />
    <meshStandardMaterial color="#8b5a2b" />
  </mesh>
</group>
```

## The scene graph: local and world matrices

:::def Scene graph
A tree of `Object3D`s. Each node's transform is **relative to its parent**. Its **local matrix** (`object.matrix`) comes from its own position, rotation and scale; its **world matrix** (`object.matrixWorld`) is its parent's world matrix times its local matrix.
:::

:::formula World matrix
$$M_{\text{world}}(\text{child}) = M_{\text{world}}(\text{parent})\cdot M_{\text{local}}(\text{child})$$
For a chain root → a → b → c this unrolls to $M_{\text{root}}M_a M_b M_c$. three.js recomputes it in `updateMatrixWorld()`, which `renderer.render()` calls on the scene each frame.
:::

@fig(scene_graph) A solar system as a scene graph. The Moon only knows its offset from the Earth; it orbits the Sun automatically because its world matrix includes the Earth's and the Sun's transforms.

:::calc Where does the child end up?
A parent at $(10, 0, 0)$ rotated 90° about Y. Its child has local position $(0, 0, 2)$.

1. Rotate the child's offset by the parent's rotation: $R_y(90°)(0, 0, 2) = (0 + 1\cdot 2,\ 0,\ -1\cdot 0 + 0\cdot 2) = (2, 0, 0)$.
2. Add the parent's position: $(10, 0, 0) + (2, 0, 0) = (12, 0, 0)$.

`child.getWorldPosition(v)` returns $(12, 0, 0)$, while `child.position` still reads $(0, 0, 2)$.
:::

```js title="three.js — local ↔ world conversions"
const v = new THREE.Vector3();
child.getWorldPosition(v);                 // world position (updates world matrices first)
child.getWorldQuaternion(q);               // world orientation
child.localToWorld(v.set(0, 0.5, 0));      // a point in the child's space → world space
child.worldToLocal(v.copy(hitPoint));      // a world point → the child's space

newParent.attach(child);   // re-parent but KEEP the world transform (e.g. picking up an object)
newParent.add(child);      // re-parent and keep the LOCAL transform (the object jumps)
```

:::warn matrixAutoUpdate and static objects
Every frame three.js recomputes `matrix` from position/rotation/scale for every object with `matrixAutoUpdate = true` (the default). For thousands of static objects, set `matrixAutoUpdate = false` and call `object.updateMatrix()` once after placing them. Since r185, if you then write `object.matrix` yourself you must also set `object.matrixWorldNeedsUpdate = true`, because `updateWorldMatrix()` now honours that flag.
:::

## Inverses and the view matrix

:::def Inverse matrix
$M^{-1}$ undoes $M$: $M^{-1}M = I$. It exists when the determinant is non-zero (the transformation does not squash space flat).
:::

:::formula Inverse of a TRS matrix
$$(T R S)^{-1} = S^{-1}\,R^{-1}\,T^{-1} = S^{-1}\,R^{T}\,T(-\mathbf{t})$$
The order reverses. A rotation matrix is **orthonormal**, so its inverse is its transpose, which is much cheaper than a general inverse. $S^{-1}$ just uses $1/s_x$, $1/s_y$, $1/s_z$.
:::

The camera is an object like any other, with a world matrix that places it in the world. Rendering needs the opposite: positions **relative to the camera**. So the **view matrix** is the inverse of the camera's world matrix, `camera.matrixWorldInverse`.

:::calc Camera at z = 5
The camera sits at $(0, 0, 5)$ with no rotation. Its world matrix is a translation by $(0,0,5)$, so the view matrix is a translation by $(0, 0, -5)$.

- World origin $(0,0,0)$ → view space $(0, 0, -5)$: 5 m in front of the camera (the camera looks down −Z).
- A point at $(1, 2, 3)$ → $(1, 2, -2)$: 2 m in front, 1 m right, 2 m up.
:::

## The normal matrix

Normals are not ordinary directions. Under a **non-uniform** scale, transforming a normal with the model matrix tilts it, and it is no longer perpendicular to its surface. Lighting then goes wrong.

:::formula Normal matrix
$$N = \left(M_{3\times3}^{-1}\right)^{T}$$
Transform normals with the inverse-transpose of the upper-left $3\times3$ of the model (or model-view) matrix, then renormalise. For rotations and uniform scales $N$ is just $M$ up to a scale factor, which is why the problem only appears with non-uniform scale. three.js computes `normalMatrix` per object and the built-in shaders use it.
:::

@fig(normal_matrix) Squashing an object. Transforming the normal with the model matrix (red) leaves it tilted; the inverse-transpose (green) stays perpendicular to the surface.

:::calc Proving the inverse-transpose works
Surface with normal $\mathbf{n} = (1, 1, 0)$ (unnormalised) and a tangent lying in it $\mathbf{t} = (1, -1, 0)$; check $\mathbf{n}\cdot\mathbf{t} = 0$. Apply $M = \text{diag}(2, 1, 1)$ (stretch x by 2).

1. The tangent is a real direction on the surface, so it transforms by $M$: $\mathbf{t}' = (2, -1, 0)$.
2. Wrong: $M\mathbf{n} = (2, 1, 0)$; $\mathbf{t}'\cdot M\mathbf{n} = 4 - 1 = 3 \neq 0$. Not perpendicular.
3. Right: $N = (M^{-1})^T = \text{diag}(0.5, 1, 1)$; $N\mathbf{n} = (0.5, 1, 0)$; $\mathbf{t}'\cdot N\mathbf{n} = 1 - 1 = 0$. Perpendicular.
:::

```glsl title="GLSL — what three.js's vertex shader does with normals"
// built-in uniforms injected by three.js for ShaderMaterial
vec3 transformedNormal = normalMatrix * normal;          // inverse-transpose of modelView (3x3)
vec3 vNormal = normalize(transformedNormal);             // view-space normal for lighting
vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
gl_Position = projectionMatrix * mvPosition;
```

## Matrix4 in three.js

| Task | Code |
|---|---|
| Build from parts | `m.compose(position, quaternion, scale)` |
| Split into parts | `m.decompose(position, quaternion, scale)` |
| Transform a point | `v.applyMatrix4(m)` (divides by $w$ too) |
| Transform a direction | `v.transformDirection(m)` (ignores translation, normalises) |
| Combine | `a.multiply(b)` gives $a\,b$; `a.premultiply(b)` gives $b\,a$; `c.multiplyMatrices(a, b)` |
| Invert | `m.clone().invert()` |
| Normal matrix | `new THREE.Matrix3().getNormalMatrix(m)` |
| Bake into geometry | `geometry.applyMatrix4(m)` (changes vertices permanently) |

:::warn Column-major storage, row-major arguments
`Matrix4.elements` is a flat array stored **column by column** (as WebGL expects): `elements[12], [13], [14]` hold the translation. But `Matrix4.set(n11, n12, n13, n14, …)` takes its sixteen arguments **row by row**, as you would write the matrix on paper. Mixing these up transposes the matrix.
:::

### Determinant and mirroring

:::def Determinant
For a $3\times3$ matrix, the signed factor by which it scales volume. $\det = s_x s_y s_z$ for a scale matrix, $1$ for a rotation. A **negative** determinant means the transformation mirrors space (an odd number of negative scale factors), which also reverses triangle winding.
:::

three.js checks the sign of each object's world-matrix determinant and flips its front-face winding automatically, so `scale.x = -1` mirrors a mesh without turning it inside out. A determinant of zero (a scale of 0 on any axis) makes the matrix non-invertible: normals and raycasting break, so use a tiny value like `1e-5` when you animate scale to zero.

:::keypoints
- Matrix columns are where the basis axes land; 4×4 matrices with $w$ add translation.
- Points use $w = 1$, directions $w = 0$; `applyMatrix4` vs `transformDirection`.
- $M = TRS$, applied right to left: scale, then rotate, then translate. Order changes the result.
- World matrix = parent world × local. Use `attach` to re-parent without a jump.
- View matrix = inverse of the camera's world matrix; $(TRS)^{-1} = S^{-1}R^TT^{-1}$.
- Normals use the inverse-transpose; it differs from $M$ only under non-uniform scale.
- `Matrix4.elements` is column-major; `Matrix4.set()` is row-major.
:::

## Interview questions

:::qa Explain the difference between `object.matrix` and `object.matrixWorld`. {level=junior}
`matrix` is the local transform relative to the parent, composed from `position`, `quaternion` and `scale` ($TRS$). `matrixWorld` is the transform relative to the scene root: the parent's `matrixWorld` multiplied by `matrix`. three.js updates both in `updateMatrixWorld()` during `render()`. If you need a world position in the middle of a frame (before rendering), call `getWorldPosition()`, which updates the chain first.
:::

:::qa An object orbits around the origin instead of spinning in place. What is wrong? {level=junior}
The rotation is being applied after the translation ($R T$ instead of $T R$), so it rotates the already-moved position around the world origin. In three.js this usually comes from rotating a parent group that sits at the origin while the mesh is offset inside it, or from baking a translation into the geometry. Fix: rotate the object itself (or a group placed at the object's position), or move the geometry's pivot with `geometry.center()` / `geometry.translate()`.
:::

:::qa Why can't you transform normals with the model matrix? {level=mid}
Normals must stay perpendicular to the surface. Tangent directions transform with $M$, so for $\mathbf{n}$ to stay perpendicular to every transformed tangent ($\mathbf{n}'^T M\mathbf{t} = 0$ whenever $\mathbf{n}^T\mathbf{t} = 0$), we need $\mathbf{n}' = (M^{-1})^T\mathbf{n}$. Under rotation and uniform scale the inverse-transpose equals $M$ up to scale, so the mistake is invisible; with non-uniform scale lighting looks wrong. three.js provides `normalMatrix` for this.
:::

:::qa How would you place 10,000 static trees efficiently, transform-wise? {level=mid}
Use one `InstancedMesh` so all trees are one draw call, and compose each instance matrix once: `matrix.compose(position, quaternion, scale)` then `setMatrixAt(i, matrix)` and `instanceMatrix.needsUpdate = true`. Do not create 10,000 `Object3D`s. If they were separate meshes, `matrixAutoUpdate = false` and one `updateMatrix()` call would at least avoid recomputing local matrices every frame. Call `computeBoundingSphere()` on the instanced mesh so frustum culling works for the whole set.
:::

:::qa What does `attach()` do differently from `add()`? {level=mid}
`add()` keeps the object's local transform, so its world transform changes to follow the new parent (it visually jumps). `attach()` computes the local transform that keeps the **world** transform the same under the new parent, using the inverse of the new parent's world matrix. Use `attach` for picking up and dropping objects, moving items between rooms, or grabbing in VR.
:::

:::qa What does a negative determinant tell you, and how does three.js handle it? {level=senior}
The transformation mirrors space, for example `scale.x = -1`. Mirroring reverses triangle winding, so front faces would become back faces and be culled. three.js computes the determinant of each object's world matrix and flips the GPU's front-face setting for negative values, so mirrored meshes render correctly. A zero determinant (zero scale) is singular: no inverse, so normal matrices and raycasting fail.
:::
