---
title: Source Code
id: source-code
---

All examples, exercise solutions and project source code are in the companion repository:

<p style="font-size:12pt"><span class="placeholder">[GITHUB URL PLACEHOLDER]</span></p>

<div class="qr">QR CODE<br>PLACEHOLDER</div>

## Repository layout

```text title="Expected structure of the companion repository"
three-lab/
  chapters/      one folder per chapter: the code listings from the book, ready to run
  examples/      small standalone demos referenced in the text
  projects/      the capstone projects from Chapter 26, each with its own README
  shaders/       GLSL and TSL snippets as separate files
  assets/        models (.glb), textures (.ktx2) and environment maps (.hdr) used by the examples
  solutions/     reference solutions to the Build This exercises
```

## Running the examples

Every listing is a plain ES module. The quickest setup is a Vite project:

```bash title="Create a project and install the libraries used in this book"
npm create vite@latest three-lab-sandbox -- --template react
cd three-lab-sandbox
npm install three@0.186.0 @react-three/fiber@9 @react-three/drei@10
npm run dev
```

Pin the three.js version you are studying: the API notes in this book refer to r186, and behaviour can differ in other releases. Report errata through the repository's issue tracker.
