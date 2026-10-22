---
title: Which Tool Should I Use?
summary: Ten decision guides for the choices that come up on every project: animation technique, drawing many objects, performance fixes, physics, renderer, shadows, transparency, post-processing, React Three Fiber state and asset formats. Each guide starts from the question you actually have and ends at a concrete technique, with the chapter that explains it.
difficulty: Intermediate
prereqs: Parts II–V
time: Reference
outcome: Choose the right technique for animation, rendering many objects, physics, shadows, post-processing, state and performance work.
---

## Using the decision guides

Each guide reads left to right: start from the question, follow the branch that matches your situation, and land on a technique. When two branches both seem to apply, pick the cheaper one first and measure (Chapter 23). The guides compress advice from the whole book; the chapter references point to the explanation behind each recommendation.

## Animation

@fig(tree_animation) Choosing an animation technique (Chapter 15). Most products combine several: clips for authored motion, springs for UI feedback, and `useFrame` for continuous behaviour.

The deciding factors are **who authors the motion** (an artist in Blender, or your code) and **how many things move** (a few objects on the CPU, or thousands on the GPU).

## Drawing many objects

@fig(tree_many_objects) Choosing between separate meshes, instancing, batching, merging and points (Chapters 8 and 23).

Count draw calls before deciding: a few dozen separate meshes are fine everywhere; hundreds are a problem on phones.

## Performance problems

@fig(tree_perf) The performance triage of Chapter 23 as a decision tree. The first branch is a measurement, not a guess: change the resolution and see whether the frame time follows.

:::tip One experiment decides the branch
Halve the pixel ratio. If the frame time drops sharply, the GPU's per-pixel work is the bottleneck; if it does not move, look at draw calls, JavaScript and React on the CPU. This single test prevents most wasted optimisation.
:::

## Physics and motion

@fig(tree_physics) Choosing between maths you write yourself and a physics engine (Chapters 3, 14 and 17).

A physics engine is worth its download size and complexity when many bodies touch each other: stacking, joints, vehicles, ragdolls. For a camera that settles or a ball that only bounces off the floor, a spring or an integrator in twenty lines is simpler and fully controllable.

## Renderer

@fig(tree_renderer) Choosing between WebGLRenderer and WebGPURenderer in three.js r186 (Chapters 2 and 20).

## Shadows

@fig(tree_shadows) Choosing a shadow technique (Chapter 10). The cheapest shadow is one computed before the user arrives: bake whenever the lighting does not change.

## Transparency

@fig(tree_transparency) Choosing a transparency technique (Chapters 2, 9 and 24).

## Post-processing

@fig(tree_post) Choosing a post-processing stack (Chapter 19). Whichever you use, tone mapping and the sRGB conversion must happen exactly once, at the end.

## State in React Three Fiber

@fig(tree_state) Where state should live in an R3F application (Chapters 21 and 22). The rule of thumb: the faster it changes, the further from React it lives.

## Shipping assets

@fig(tree_assets) Choosing formats and compression for assets (Chapters 11, 16 and 24).

:::keypoints
- Start from the real question (who authors it, how many, how often it changes) rather than from a favourite library.
- For performance, the first branch is always a measurement.
- Prefer the cheapest technique that meets the requirement: baked over real-time, instanced over separate, refs over state.
- Every branch has a chapter behind it; revisit it before committing to an approach.
:::
