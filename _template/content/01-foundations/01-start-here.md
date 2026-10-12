---
title: Start Here
level: easy
time: 10 min
summary: What this course covers and how every lesson is built.
---

Replace this lesson with your own. Every lesson follows the same shape: plain English first, then definitions, syntax, examples, practice and a quick check.

:::def Lesson
A Markdown file in `content/<NN-module>/`. Its file name (without the number) becomes its URL id, so keep names unique.
:::

:::tip
Run `python3 build.py` after editing. It regenerates `assets/js/content.js`.
:::

## A code example

```python
print("Code blocks are highlighted. Add a runner and use ```python run to make them runnable.")
```

:::keypoints
- Plain English first.
- Definitions go in `:::def` cards. They are collected in the glossary automatically.
:::

```quiz
? Where do lessons live?
- In index.html
+ In content/, as Markdown files
> build.py bundles them into assets/js/content.js.
```
