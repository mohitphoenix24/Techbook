---
title: OCR and Document Understanding
level: advanced
time: 50
summary: Reading text from images. The classic pipeline (preprocess, detect text, recognise, post-process), CTC and the CRNN recogniser, modern detectors (EAST, DB) and recognisers (TrOCR, PARSeq), layout and table models, OCR-free document models, metrics (CER, WER), and practical engines and pitfalls.
---

**OCR** (optical character recognition) turns pixels into text. It sounds old and solved, yet it is everywhere: invoices, ID cards, number plates, serial numbers on parts, meter reading, signs for robots. A good interview answer shows that you know the **pipeline** and its failure modes.

## The pipeline

:::flow Classic OCR system
Preprocess | Fix the image: rotate/deskew, perspective-correct the page (homography, module 3), reduce noise, improve contrast (CLAHE), binarise (Otsu or adaptive threshold, module 2), scale so letters are about 20–40 px tall.
Detect text | Find where the text is: boxes or polygons for words or lines. Classical: threshold + morphology + connected components, MSER. Deep: EAST, CRAFT, DBNet (differentiable binarisation), PSENet.
Recognise | For each crop, predict the string: CRNN with CTC (CNN + BiLSTM + CTC), attention models, or transformers (TrOCR, PARSeq, ABINet).
Post-process | Fix errors with a dictionary or language model, regular expressions and checksums (for IDs, dates, amounts); sort into reading order.
Understand | Layout analysis, key-value extraction, tables (LayoutLM, Donut, or a VLM).
:::

## Step 1 and 2 by classical vision

For clean documents, plain image processing already finds text lines: threshold, **close** with a wide horizontal kernel so letters join into words and lines, then take connected components.

```python run title="Classic text-line detection: threshold, close horizontally, connected components" level=intermediate
import cv2
import numpy as np
import cvlab

gray = cvlab.image("page", gray=True)
bw = cv2.adaptiveThreshold(cv2.GaussianBlur(gray, (3, 3), 0), 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 15)   # text becomes white
joined = cv2.morphologyEx(bw, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_RECT, (25, 3)))                                  # glue letters into lines
n, labels, stats, _ = cv2.connectedComponentsWithStats(joined)
boxes = [tuple(int(v) for v in s[:4]) for s in stats[1:] if s[cv2.CC_STAT_AREA] > 150 and s[cv2.CC_STAT_HEIGHT] > 6]
boxes.sort(key=lambda b: (b[1], b[0]))                                                                                                 # reading order: top to bottom
print("text regions found:", len(boxes))
for x, y, w, h in boxes[:4]:
    print(f"  box x={x:>3} y={y:>3} w={w:>3} h={h:>2}")
vis = cv2.cvtColor(gray, cv2.COLOR_GRAY2RGB)
for x, y, w, h in boxes:
    cv2.rectangle(vis, (x, y), (x + w, y + h), (255, 0, 0), 1)
cvlab.show(gray, "Photo of a page", bw, "Adaptive threshold", vis, "Detected text regions")
print("lines that are close together can merge; curved, rotated or scene text needs a learned detector (DBNet, CRAFT)")
```

## Deep text detectors

Text detection is like object detection with extreme aspect ratios and arbitrary orientations.

- **EAST**: a fully convolutional net that predicts, for each pixel, "is it text" plus a rotated box (distances to the four sides and an angle); fast.
- **CRAFT**: predicts a **character region score** and an **affinity score** (between neighbouring characters), then groups characters into words; handles curved text.
- **DBNet (Differentiable Binarisation)**: predicts a probability map and a threshold map and learns the binarisation; fast and accurate, the default in PaddleOCR and docTR.
- **Segmentation-based** (PSENet) handle curved and touching text; **Mask Text Spotter** and end-to-end spotters do detection and recognition together.

## Recognition: CRNN and CTC

A text crop is a short, wide image. The classic recogniser **CRNN** (Shi et al.):

1. A **CNN** turns the crop (32 × W) into a sequence of feature columns (about W/4 columns).
2. A **bidirectional LSTM** (or a transformer) reads the sequence, giving a probability over characters (plus a **blank**) for each column.
3. **CTC (connectionist temporal classification)** loss lets us train with only the **string** as a label, without knowing which column belongs to which letter. At decoding, collapse repeats and remove blanks.

```python run title="CTC decoding: collapse repeats, drop blanks, measure CER" level=advanced shared
import numpy as np

alphabet = ["-"] + list("abcdefghijklmnopqrstuvwxyz0123456789")        # index 0 is the CTC blank
def decode(probs):
    best = probs.argmax(1)                                               # most likely symbol per column
    out, prev = [], -1
    for k in best:
        if k != prev and k != 0:                                         # a new symbol that is not the blank
            out.append(alphabet[k])
        prev = k
    return "".join(out)

def frames(text, repeat=3, blank=2, noise=0.0, seed=0):
    """Build fake network outputs: each letter lasts 'repeat' columns, with blanks between."""
    rng = np.random.default_rng(seed)
    cols = []
    for i, ch in enumerate(text):
        cols += [alphabet.index(ch)] * repeat
        if i + 1 < len(text) and text[i + 1] == ch:                       # a double letter ("ll") needs a blank between the two
            cols += [0] * blank
        else:
            cols += [0]
    p = np.full((len(cols), len(alphabet)), 0.02) + noise * rng.random((len(cols), len(alphabet)))
    for i, k in enumerate(cols): p[i, k] = 1.0
    return p / p.sum(1, keepdims=True)

for word in ("hello", "ab12", "ocr2024"):
    p = frames(word)
    print(f"{word:<8} -> {p.shape[0]:>2} columns -> decoded '{decode(p)}'")

def edit_distance(a, b):
    d = np.arange(len(b) + 1)
    for i, ca in enumerate(a, 1):
        prev, d[0] = d[0], i
        for j, cb in enumerate(b, 1):
            prev, d[j] = d[j], min(d[j] + 1, d[j - 1] + 1, prev + (ca != cb))
    return int(d[len(b)])

refs = ["invoice no 4471", "total 2350", "serial ab12c9"]
preds = ["invoice no 4471", "total 2850", "seria1 ab12c9"]               # one wrong digit, one l/1 confusion
cer = sum(edit_distance(p, r) for p, r in zip(preds, refs)) / sum(len(r) for r in refs)
print(f"character error rate (CER) = edits / reference characters = {cer:.3f}")
print("exact-match accuracy would be", round(sum(p == r for p, r in zip(preds, refs)) / len(refs), 2), "- for amounts and IDs ONE wrong character is a wrong answer")
```

```python local check title="PyTorch CTC loss: it falls as the network becomes confident"
import torch
from torch import nn

torch.manual_seed(0)
T, C, label = 12, 6, [1, 2, 2, 3]                                          # 12 columns, 6 symbols (0 = blank), target "1 2 2 3"
ctc = nn.CTCLoss(blank=0)
target = torch.tensor([label]); tl = torch.tensor([len(label)]); il = torch.tensor([T])
logits = torch.randn(T, 1, C, requires_grad=True)                           # (time, batch, classes): what a CRNN would output
opt = torch.optim.Adam([logits], lr=0.2)
for step in range(60):
    loss = ctc(logits.log_softmax(2), target, il, tl)
    opt.zero_grad(); loss.backward(); opt.step()
    if step in (0, 59):
        print(f"step {step:>2}: CTC loss {loss.item():.3f}")
best = logits.argmax(2).squeeze().tolist()
decoded = [k for i, k in enumerate(best) if k != 0 and (i == 0 or k != best[i - 1])]
print("per-column best path:", best)
print("decoded labels:", decoded, "(target", label, ")  - note the blank between the two 2s is what lets a double letter survive")
```

## Modern recognisers

- **Attention encoder–decoder** (ASTER, SAR) predict characters one by one, allowing better language context and rectification of curved text.
- **TrOCR**: a ViT encoder + a text transformer decoder pre-trained on millions of printed and handwritten lines; strong on handwriting.
- **PARSeq, ABINet, MAERec**: permutation language modelling and iterative correction; best accuracy on scene-text benchmarks.
- **Lightweight**: PaddleOCR PP-OCRv4 (about 10 MB), EasyOCR, docTR for server and mobile.
- **Language models** improve ambiguous reads ("0" vs "O", "l" vs "1") but can **hallucinate plausible text**: dangerous for serial numbers, so keep the raw output and checksums.

## Documents: layout, tables, key-value pairs

- **Layout analysis**: find titles, paragraphs, tables, figures, headers (detectors/segmenters such as LayoutParser, DocLayNet-trained YOLO).
- **Table structure recognition**: rows, columns, merged cells (Table Transformer, TableFormer).
- **LayoutLM v1–v3, LiLT**: transformers that take each word **with its text, its box position, and the image patch**, then do named-entity tagging, e.g. "invoice number", "total".
- **OCR-free models**: **Donut**, **Pix2Struct**, **Nougat** (academic PDFs to Markdown), **GOT-OCR2.0** read the page image and write structured text directly, avoiding OCR error propagation.
- **VLMs** (Qwen2-VL, Gemini, GPT-4o, Claude) read documents surprisingly well and can answer questions about them; they are slow, may omit or invent small text, and need verification.

## Practical advice

| Problem | What to do |
|---|---|
| Blurry, small text | More resolution, better optics/exposure, super-resolution only if it was trained for text, crop tightly |
| Rotated or skewed pages | Estimate the angle (Hough lines, minAreaRect on text pixels, a classifier for 0/90/180/270), then rotate |
| Perspective (photos of pages) | Find the page quadrilateral, `getPerspectiveTransform` (module 3) |
| Uneven lighting | Background division/flat-field, adaptive threshold, CLAHE |
| Low-contrast, curved or embossed text | Learned detector, lighting (dark-field/side), polarisers |
| Non-Latin scripts (Devanagari, Tamil, Arabic, CJK) | Use models trained for the script; check ligatures and reading direction; fine-tune with synthetic data |
| Fixed formats (plates, meters, IDs) | Train a small specialised recogniser on your crops; constrain the alphabet and the format |
| Wrong amounts | Validate with sums, checksums (Luhn, MRZ), dictionaries; flag low confidence for review |

**Synthetic data** is standard in OCR: render text with many fonts, backgrounds, blur and noise (SynthText, TextRecognitionDataGenerator). Always mix with real labelled crops.

**Tools**: Tesseract (classic, LSTM-based), PaddleOCR, EasyOCR, docTR, MMOCR, Azure/Google/AWS document services, and VLM APIs.

## Metrics

- **Detection**: precision, recall and F1 at IoU 0.5 (ICDAR protocol).
- **Recognition**: **CER** (character error rate), **WER** (word error rate), normalised edit distance, exact-match accuracy.
- **End-to-end** (detection + recognition correct together), **key-value F1** for forms, **table TEDS** score.
- Report errors by type (substitution, deletion, insertion; confusable pairs) and by field importance.

:::interview Questions you may get
- "Describe an OCR pipeline and where it fails." Preprocess, detect, recognise, post-process; fails with blur, skew, perspective, uneven light, curved or stylised text and unusual scripts.
- "What is CTC and why is it used?" A loss for sequence labelling without alignment: it sums over all alignments of the label to the per-column predictions, with a blank symbol and repeat collapsing; decode by collapsing repeats and removing blanks.
- "Why can a double letter be a problem for CTC?" Repeated outputs collapse, so the network must emit a blank between two identical letters.
- "CRNN versus a transformer recogniser?" CRNN is light and fast; transformers (TrOCR, PARSeq) add language context and are more accurate but heavier.
- "How would you read serial numbers on metal parts?" Controlled lighting, crop with a detector, specialised recogniser trained on synthetic and real crops, constrained alphabet/format, checksum validation, confidence-based rejection.
- "What is CER and why is exact match also needed?" CER is edit distance over reference length; for IDs and amounts a single error invalidates the whole value, so also track field-level exact match.
:::

```quiz
? What does the blank symbol in CTC allow?
+ Separating repeated letters and absorbing columns with no letter
- Faster training
- Capital letters
> Needed for "ll" and for spacing.

? Which detector predicts a probability map and a threshold map and learns the binarisation?
+ DBNet
- ResNet
- UNet only
> Differentiable binarisation.

? What is CER?
+ Character-level edit distance divided by the reference length
- The number of correct words
- The detection IoU
> Lower is better.

? Why can language-model post-correction be risky for serial numbers?
+ It can replace unusual but correct characters with plausible ones
- It is slower
- It removes digits
> Prefer checksums and constrained formats.
```

:::problem A logistics company photographs shipping labels with phones in warehouses (blur, glare, tilted). Barcode reading works, but the text fields (address, weight) must be read too. Propose a solution and metrics. {level=medium tags="ocr,documents,mobile"}
Think about capture quality, pipeline and verification.

:::solution Model answer
Improve capture first: autofocus lock, a guide frame in the app, glare warnings, multiple frames (choose the sharpest). Pipeline: detect the label (segmentation or corner detection) and rectify it with a homography; run a text detector (DBNet) and recogniser (PARSeq/PaddleOCR); parse fields with layout/key-value rules or LayoutLM/Donut; cross-check with the barcode data (weight, ID) and with an address dictionary/validator. Fall back to a VLM or human review for low-confidence fields. Metrics: field-level exact match and CER per field, rework rate (percentage sent to humans), latency on the phone, and performance on bad conditions (blur, glare) sliced separately.
:::
:::

:::keypoints
- OCR = preprocess, detect, recognise, post-process (+ layout/key-value extraction); fix skew and perspective with geometry first.
- Detectors: EAST, CRAFT, DBNet; recognisers: CRNN+CTC, attention models, TrOCR, PARSeq; OCR-free models (Donut, Nougat) and VLMs read pages directly.
- CTC: per-column probabilities with a blank symbol; decode by collapsing repeats and removing blanks.
- Evaluate with CER/WER, field exact match and slices; use checksums and formats, and send low confidence to review.
:::

:::resources
- [Shi et al.: An End-to-End Trainable Neural Network for Image-based Sequence Recognition (CRNN)](https://arxiv.org/abs/1507.05717) — CNN + RNN + CTC.
- [Liao et al.: Real-time Scene Text Detection with Differentiable Binarization (DBNet)](https://arxiv.org/abs/1911.08947) — the detector used by many toolkits.
- [Li et al.: TrOCR: Transformer-based Optical Character Recognition](https://arxiv.org/abs/2109.10282) — ViT encoder with a text decoder.
- [Kim et al.: OCR-free Document Understanding Transformer (Donut)](https://arxiv.org/abs/2111.15664) — reads documents without OCR.
- [Xu et al.: LayoutLMv3](https://arxiv.org/abs/2204.08387) — pre-training for document AI.
- [PaddleOCR on GitHub](https://github.com/PaddlePaddle/PaddleOCR) — a practical open-source OCR toolkit.
:::
