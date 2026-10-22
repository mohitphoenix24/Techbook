---
title: How to Use This Book
id: how-to-use
---

<p class="lead">Read Parts I–III in order the first time: later chapters build on their maths and object model. Afterwards, use the book as a reference. Every chapter opens with a dashboard (difficulty, prerequisites, study time, outcomes) and ends with key points, interview questions and, for key topics, a Build This exercise.</p>

## Three ways to read

<div class="plan">
<div style="--c:var(--em)"><h4>Learning path</h4><ul><li>Parts I → VI in order</li><li>Do the Build This exercises</li><li>Pick one capstone project (Chapter 26)</li></ul></div>
<div style="--c:var(--sky)"><h4>Working reference</h4><ul><li>Decision guides (Chapter 29)</li><li>50 common problems (Chapter 28)</li><li>Formula and API sheets (Chapter 30)</li></ul></div>
<div style="--c:var(--pk)"><h4>Interview preparation</h4><ul><li>Revision plans (Chapter 27)</li><li>Interview questions in every chapter</li><li>Glossary for quick definitions</li></ul></div>
</div>

## The boxes

<div class="legend">
  <div class="lg def"><b>Definition</b><span>The precise meaning of a term; collected in the glossary.</span></div>
  <div class="lg formula"><b>Formula</b><span>The equation, every symbol explained.</span></div>
  <div class="lg calc"><b>Worked example</b><span>The formula with real numbers, step by step.</span></div>
  <div class="lg intuition"><b>Intuition</b><span>A picture or analogy that makes it stick.</span></div>
  <div class="lg tip"><b>Tip</b><span>What experienced developers do.</span></div>
  <div class="lg warn"><b>Pitfall</b><span>A common bug and how to avoid it.</span></div>
  <div class="lg deep"><b>Deep dive</b><span>Extra depth; safe to skip at first.</span></div>
  <div class="lg new"><b>API change</b><span>Old tutorial code versus the current API.</span></div>
  <div class="lg build"><b>Build this</b><span>A practical challenge with hints.</span></div>
  <div class="lg lens"><b>Senior engineer lens</b><span>One topic at junior, mid and senior level.</span></div>
  <div class="lg case"><b>Case study</b><span>A performance problem, symptom to fix.</span></div>
  <div class="lg qa"><b>Interview question</b><span>A likely question with a model answer.</span></div>
</div>

Section labels: <span class="kl must">FOUNDATION</span> core · <span class="kl should">INTERMEDIATE</span> practical depth · <span class="kl" style="background:#4a1530;color:#f9a8d4">ADVANCED</span> safe to skip at first · <span class="kl" style="background:#3b2b0b;color:#fcd34d">INTERVIEW</span> question sections.

## Conventions

- **Coordinates.** Right-handed, **+Y up**; the camera looks down its own **−Z**; one unit is one metre.
- **Vectors and matrices.** Bold lower case is a vector ($\mathbf{v}$), capitals are matrices ($M$); vectors are columns, so $M\mathbf{p}$ and transforms read **right to left**.
- **Angles.** three.js uses **radians** everywhere except `PerspectiveCamera.fov`, which is in degrees.
- **Code.** <span class="pill three">three.js</span> listings are plain JavaScript (`import * as THREE from "three"`); <span class="pill r3f">R3F</span> listings are components inside a `<Canvas>`; shaders are labelled GLSL, WGSL or TSL.
- **Numbers.** Worked examples are exact; benchmarks marked *illustrative* are teaching numbers, not measurements.
