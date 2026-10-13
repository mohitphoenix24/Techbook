# The ThreeLab Notebook

A complete study notebook for three.js, React Three Fiber and 3D graphics, built as a dark-mode A4 PDF for reading on an iPad (or any tablet). It has 27 chapters in 7 parts: concepts and definitions, the maths with worked calculations, three.js and R3F implementations, advanced rendering techniques, and an interview question bank. It is written against three.js r186 and React Three Fiber 9, in Indian English (British spelling); API names keep their original spelling.

The ThreeLab course links it from the **Notebook** tab (`#/notebook`), which reads `notebook-meta.js` for the page count, chapter list and a cache-busting version.

## Files

| Path | What it is |
|---|---|
| `src/NN-slug.md` | One Markdown file per chapter (front matter: `title`, optional `part`, `summary`) |
| `figs.py` | Every diagram, drawn as SVG from code (`@fig("name")`); some figures are rendered per pixel with NumPy (shading models, tone mappers, PBR spheres, Monte Carlo AO, Gaussian splats) |
| `notebook.css` | The dark print design (A4 pages, running header, page numbers, boxes, code, tables) |
| `build_notes.py` | Markdown → `notebook.html` → `ThreeLab-Notebook.pdf` |
| `fonts/` | Self-hosted Inter, JetBrains Mono and Space Grotesk, so builds are reproducible |
| `notebook.html`, `ThreeLab-Notebook.pdf`, `notebook-meta.js` | Generated output (committed so the static site can serve them) |

## Build

```bash
python3 build_notes.py            # HTML + PDF (two passes so the contents get page numbers)
python3 build_notes.py --html     # HTML only, for a quick look in a browser
python3 build_notes.py --shots /tmp/pages --pages 1-6,40-42   # also save PNGs of some pages
```

Requirements: Python 3 with `markdown`, `pygments`, `numpy`, `Pillow`, `pdfminer.six` and `playwright` (it prints with the system Chrome at `/usr/bin/google-chrome`), plus Node (KaTeX renders maths at build time from `shared/vendor/katex`) and `pdfinfo`/`pdftoppm` from poppler.

## Markdown extras

| Syntax | Renders as |
|---|---|
| `:::def Term` … `:::` | Definition box (also `formula`, `calc` = worked example, `intuition`, `tip`, `warn` = pitfall, `note`, `deep` = deep dive, `new` = new in recent three.js, `keypoints`) |
| `:::qa Question {level=junior\|mid\|senior}` … `:::` | Interview question card with a model answer |
| `:::flow Title` + one step per line | Numbered step list |
| `$…$`, `$$…$$` | KaTeX maths (do not put a letter directly before the opening `$`) |
| ```` ```js title="three.js — …" ```` | Highlighted code; titles containing "three"/"TSL" or "R3F" get a coloured marker |
| `@fig(name) Caption` | A numbered figure from `figs.py` |

Boxes can nest. `##` headings are numbered sections (`3.2`) and `###` subsections (`3.2.1`); both become PDF bookmarks.

## Checks used before publishing

- The build reports KaTeX errors and leftover placeholders (both must be 0).
- Every `js`/`jsx`/`tsx` block parses with esbuild.
- Worked calculations were recomputed in Python and against three.js r186 in Node (vectors, quaternions, slerp, matrix order, projection, ray intersections, colour conversion).
- API claims were checked against the r186 source, release notes and migration guide.
- Visual review of every page as PNG contact sheets.
