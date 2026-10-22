---
title: Coding Round: PyTorch for Vision
level: advanced
time: 120
summary: Twelve PyTorch problems that vision interviews like: convolution by unfolding, self-attention, focal and Dice losses, GIoU and NMS, Mixup/CutMix, Grad-CAM with hooks, a correct training loop and a bug-hunt, detection collate functions, label smoothing, and a residual block with a parameter count. Every solution here was executed and checked against PyTorch or torchvision.
---

The second kind of coding round is **PyTorch**: write a loss, a layer, a training loop, or find the bug in someone else's code. The solutions below are marked **Run locally** because PyTorch does not run in the browser; each was executed with PyTorch 2.7 and torchvision 0.22 and ends with checks (`assert`) that compare it with the library version, which is the habit to copy in an interview.

**Habits that interviewers watch for**: state tensor shapes in comments, mind `dtype` and `device`, call `model.eval()` and `torch.no_grad()` for evaluation, avoid in-place operations that break autograd, make losses **numerically stable** (log-sum-exp, `clamp`, `logits` rather than probabilities), and write a quick **shape and gradient test**.

## 1. Convolution with `unfold` (im2col)

:::problem Implement a 2-D convolution layer's forward pass using `torch.nn.functional.unfold` and a matrix multiplication. Compare it with `F.conv2d`. {level=medium tags="conv,im2col"}
`unfold` turns every kernel-sized patch into a column; the convolution is then one matrix multiplication.

:::solution Reference solution
```python local check title="Conv2d as im2col + matmul"
import torch
import torch.nn.functional as F

def conv2d_im2col(x, weight, bias=None, stride=1, padding=0):
    N, C, H, W = x.shape
    O, _, kh, kw = weight.shape
    cols = F.unfold(x, (kh, kw), padding=padding, stride=stride)            # (N, C*kh*kw, L): one column per output position
    out = weight.view(O, -1) @ cols                                          # (O, C*kh*kw) @ (N, C*kh*kw, L) -> (N, O, L)
    if bias is not None: out = out + bias.view(1, -1, 1)
    Ho = (H + 2 * padding - kh) // stride + 1; Wo = (W + 2 * padding - kw) // stride + 1
    return out.view(N, O, Ho, Wo)

torch.manual_seed(0)
x = torch.randn(2, 3, 17, 19); w = torch.randn(8, 3, 3, 3); b = torch.randn(8)
for stride, pad in [(1, 0), (1, 1), (2, 1)]:
    mine = conv2d_im2col(x, w, b, stride, pad); ref = F.conv2d(x, w, b, stride=stride, padding=pad)
    print(f"stride {stride}, padding {pad}: output {tuple(mine.shape)}, max difference {float((mine - ref).abs().max()):.2e}")
    assert torch.allclose(mine, ref, atol=1e-4)
print("memory cost: the unfolded matrix is kh*kw times larger than the input; this is how many GPU libraries do convolution (plus tricks)")
```
Follow-ups: output-size formula, why im2col trades memory for speed, depth-wise conv (`groups`), backward pass (the gradient of `unfold` is `fold`).
:::
:::

## 2. Multi-head self-attention

:::problem Implement multi-head self-attention for input of shape `(B, N, D)` with `h` heads, no `nn.MultiheadAttention`. Check it against PyTorch's module by copying the weights. {level=medium tags="attention,transformer"}
One projection for `q, k, v`, reshape to `(B, h, N, d)`, `softmax(q kᵀ / √d) v`, merge the heads, final projection.

:::solution Reference solution
```python local check title="Multi-head attention from scratch"
import math
import torch
from torch import nn

class MHSA(nn.Module):
    def __init__(self, dim, heads):
        super().__init__()
        assert dim % heads == 0
        self.h, self.d = heads, dim // heads
        self.qkv = nn.Linear(dim, 3 * dim)                                   # one matrix produces q, k and v
        self.proj = nn.Linear(dim, dim)
    def forward(self, x):                                                    # x: (B, N, D)
        B, N, D = x.shape
        q, k, v = self.qkv(x).view(B, N, 3, self.h, self.d).permute(2, 0, 3, 1, 4)    # each (B, h, N, d)
        att = (q @ k.transpose(-2, -1)) / math.sqrt(self.d)                  # (B, h, N, N): similarity of every token pair
        out = att.softmax(-1) @ v                                            # weighted sum of values: (B, h, N, d)
        return self.proj(out.transpose(1, 2).reshape(B, N, D))               # merge heads back to (B, N, D)

torch.manual_seed(0)
dim, heads = 64, 8
mine = MHSA(dim, heads)
ref = nn.MultiheadAttention(dim, heads, batch_first=True)
with torch.no_grad():                                                        # copy weights so the two should agree exactly
    ref.in_proj_weight.copy_(mine.qkv.weight); ref.in_proj_bias.copy_(mine.qkv.bias)
    ref.out_proj.weight.copy_(mine.proj.weight); ref.out_proj.bias.copy_(mine.proj.bias)
x = torch.randn(2, 10, dim)
out_mine = mine(x); out_ref = ref(x, x, x, need_weights=False)[0]
print("output shape", tuple(out_mine.shape), "| max difference from nn.MultiheadAttention:", float((out_mine - out_ref).abs().max()))
assert torch.allclose(out_mine, out_ref, atol=1e-5)
print("cost: attention matrix is N x N per head: O(N^2) memory, which is why ViTs at high resolution need windows or FlashAttention")
```
Follow-ups: why divide by `√d`, causal masks, cross-attention (q from one sequence, k/v from another), KV caching, `F.scaled_dot_product_attention`.
:::
:::

## 3. Focal loss

:::problem Implement binary focal loss from logits (numerically stable) and show that with `gamma = 0, alpha = 0.5` it equals half the binary cross-entropy. {level=medium tags="loss,focal"}
Use `binary_cross_entropy_with_logits(reduction="none")` to get `-log(p_t)`, and `p_t = exp(-bce)`.

:::solution Reference solution
```python local check title="Binary focal loss"
import torch
import torch.nn.functional as F

def focal_loss(logits, targets, alpha=0.25, gamma=2.0, reduction="mean"):
    bce = F.binary_cross_entropy_with_logits(logits, targets, reduction="none")      # stable -log(p_t), computed from logits
    p_t = torch.exp(-bce)                                                            # the probability given to the TRUE class
    alpha_t = alpha * targets + (1 - alpha) * (1 - targets)                          # class balance weight
    loss = alpha_t * (1 - p_t) ** gamma * bce                                        # easy examples (p_t -> 1) are scaled to ~0
    return loss.mean() if reduction == "mean" else loss.sum() if reduction == "sum" else loss

torch.manual_seed(0)
logits = torch.randn(1000) * 3; targets = (torch.rand(1000) < 0.05).float()
fl = focal_loss(logits, targets, alpha=0.5, gamma=0.0)
bce = F.binary_cross_entropy_with_logits(logits, targets)
print(f"gamma = 0, alpha = 0.5: focal {fl:.5f} vs 0.5 * BCE {0.5 * bce:.5f}")
assert torch.allclose(fl, 0.5 * bce, atol=1e-6)

# the effect of gamma: how much do easy and hard examples contribute?
easy = torch.tensor([6.0]); hard = torch.tensor([-1.0]); pos = torch.tensor([1.0])
for g in (0, 2):
    e = focal_loss(easy, pos, 0.5, g); h = focal_loss(hard, pos, 0.5, g)
    print(f"gamma {g}: easy positive (logit 6) loss {e:.5f}, hard positive (logit -1) loss {h:.5f}, ratio hard/easy {h / e:.0f}x")
# extreme logits must not give NaN
print("finite for huge logits:", bool(torch.isfinite(focal_loss(torch.tensor([100.0, -100.0]), torch.tensor([0.0, 1.0]))).all()))
print("compare torchvision.ops.sigmoid_focal_loss for the reference implementation")
```
Follow-ups: the multi-class version (softmax and `(1 − p_t)^γ`), effect on calibration, choosing `α` and `γ`.
:::
:::

## 4. Dice loss and mean IoU

:::problem Write a soft Dice loss for segmentation logits of shape `(B, C, H, W)` with integer targets `(B, H, W)`, and a function computing per-class IoU and mean IoU from predictions. {level=medium tags="segmentation,dice,miou"}
One-hot the target, softmax the logits, compute Dice per class with a smoothing term; for mIoU use a confusion matrix built with `bincount`.

:::solution Reference solution
```python local check title="Dice loss and mIoU"
import torch
import torch.nn.functional as F

def dice_loss(logits, target, eps=1.0):
    C = logits.shape[1]
    probs = logits.softmax(1)                                                          # (B, C, H, W)
    onehot = F.one_hot(target, C).permute(0, 3, 1, 2).float()                          # (B, C, H, W)
    inter = (probs * onehot).sum((0, 2, 3)); denom = probs.sum((0, 2, 3)) + onehot.sum((0, 2, 3))
    dice = (2 * inter + eps) / (denom + eps)                                           # per class; eps keeps absent classes finite
    return 1 - dice.mean()

def confusion_matrix(pred, target, C):
    return torch.bincount(target.flatten() * C + pred.flatten(), minlength=C * C).view(C, C)     # rows: truth, columns: prediction

def iou_per_class(pred, target, C):
    cm = confusion_matrix(pred, target, C).float()
    inter = cm.diag(); union = cm.sum(0) + cm.sum(1) - inter
    return inter / union.clamp(min=1)                                                  # NaN-free for absent classes (reported as 0 here)

torch.manual_seed(0)
B, C, H, W = 2, 4, 16, 16
target = torch.randint(0, C, (B, H, W))
perfect_logits = F.one_hot(target, C).permute(0, 3, 1, 2).float() * 20                 # near-certain, correct
random_logits = torch.randn(B, C, H, W)
print(f"Dice loss: perfect {float(dice_loss(perfect_logits, target)):.4f} | random {float(dice_loss(random_logits, target)):.4f}")
assert dice_loss(perfect_logits, target) < 0.01 < dice_loss(random_logits, target)
pred = perfect_logits.argmax(1)
print("IoU per class for a perfect prediction:", iou_per_class(pred, target, C).tolist())
wrong = pred.clone(); wrong[:, :8] = (wrong[:, :8] + 1) % C                            # corrupt half of the pixels
iou = iou_per_class(wrong, target, C)
print("IoU per class when half the pixels are wrong:", [round(v, 3) for v in iou.tolist()], "-> mIoU", round(float(iou.mean()), 3))
loss = dice_loss(random_logits.requires_grad_(), target); loss.backward()
print("gradient flows:", bool(random_logits.grad.abs().sum() > 0))
```
Follow-ups: Dice versus cross-entropy (use both), Tversky for FN/FP balance, why mIoU averages over classes (not pixels), ignore labels (255).
:::
:::

## 5. IoU, GIoU and NMS in PyTorch

:::problem Write `box_iou` and `generalized_iou` for `(N, 4)` and `(M, 4)` boxes using broadcasting, and `batched_nms` that suppresses only within the same class. Check against `torchvision.ops`. {level=hard tags="detection,giou,nms"}
GIoU = IoU − (area of the enclosing box − union) / area of the enclosing box. For per-class NMS, shift boxes by `class_id * (max_coordinate + 1)` so different classes never overlap.

:::solution Reference solution
```python local check title="IoU, GIoU and class-aware NMS"
import torch
import torchvision

def box_area(b): return (b[:, 2] - b[:, 0]).clamp(min=0) * (b[:, 3] - b[:, 1]).clamp(min=0)

def pairwise(a, b):
    lt = torch.max(a[:, None, :2], b[None, :, :2]); rb = torch.min(a[:, None, 2:], b[None, :, 2:])
    inter = (rb - lt).clamp(min=0).prod(-1)
    union = box_area(a)[:, None] + box_area(b)[None] - inter
    return inter, union

def box_iou(a, b):
    inter, union = pairwise(a, b); return inter / union.clamp(min=1e-9)

def generalized_iou(a, b):
    inter, union = pairwise(a, b)
    lt = torch.min(a[:, None, :2], b[None, :, :2]); rb = torch.max(a[:, None, 2:], b[None, :, 2:])
    hull = (rb - lt).clamp(min=0).prod(-1)                                           # smallest box enclosing both
    return inter / union.clamp(min=1e-9) - (hull - union) / hull.clamp(min=1e-9)     # penalty for the empty part of the hull

def nms(boxes, scores, thr):
    order = scores.argsort(descending=True); keep = []
    while order.numel():
        i = order[0]; keep.append(int(i))
        if order.numel() == 1: break
        iou = box_iou(boxes[i][None], boxes[order[1:]])[0]
        order = order[1:][iou <= thr]
    return torch.tensor(keep)

def batched_nms(boxes, scores, labels, thr):
    offset = labels.to(boxes.dtype) * (boxes.max() + 1)                              # push every class far away from the others
    return nms(boxes + offset[:, None], scores, thr)

torch.manual_seed(0)
xy = torch.rand(40, 2) * 100; wh = torch.rand(40, 2) * 40 + 5
boxes = torch.cat([xy, xy + wh], 1); scores = torch.rand(40); labels = torch.randint(0, 3, (40,))
assert torch.allclose(box_iou(boxes, boxes), torchvision.ops.box_iou(boxes, boxes), atol=1e-5)
assert torch.allclose(generalized_iou(boxes, boxes), torchvision.ops.generalized_box_iou(boxes, boxes), atol=1e-5)
far = torch.tensor([[0., 0, 10, 10]]); other = torch.tensor([[100., 100, 110, 110]])
print(f"disjoint boxes: IoU {float(box_iou(far, other)):.3f} (no gradient signal), GIoU {float(generalized_iou(far, other)):.3f} (still informative)")
mine = sorted(batched_nms(boxes, scores, labels, 0.5).tolist())
ref = sorted(torchvision.ops.batched_nms(boxes, scores, labels, 0.5).tolist())
print("kept", len(mine), "of 40 | same boxes as torchvision.ops.batched_nms:", mine == ref)
assert mine == ref
```
Follow-ups: DIoU/CIoU, Soft-NMS, why boxes must be in a consistent format (xyxy versus xywh), GPU-friendly NMS.
:::
:::

## 6. Mixup and CutMix

:::problem Implement Mixup and CutMix for a batch of images and one-hot (or soft) labels. Verify that the labels still sum to one and that CutMix mixes by area. {level=medium tags="augmentation,mixup,cutmix"}
Draw `λ ~ Beta(α, α)`; Mixup blends images and labels with `λ`; CutMix pastes a random box from a shuffled copy and sets `λ` to the actual area fraction.

:::solution Reference solution
```python local check title="Mixup and CutMix"
import numpy as np
import torch

def mixup(x, y, alpha=0.4):
    lam = float(np.random.beta(alpha, alpha)); perm = torch.randperm(x.size(0))
    return lam * x + (1 - lam) * x[perm], lam * y + (1 - lam) * y[perm]               # blend both the images and the labels

def cutmix(x, y, alpha=1.0):
    lam = float(np.random.beta(alpha, alpha)); perm = torch.randperm(x.size(0))
    B, C, H, W = x.shape
    ch, cw = int(H * np.sqrt(1 - lam)), int(W * np.sqrt(1 - lam))                     # box area ~ (1 - lam) of the image
    cy, cx = np.random.randint(H), np.random.randint(W)
    y1, y2, x1, x2 = max(cy - ch // 2, 0), min(cy + ch // 2, H), max(cx - cw // 2, 0), min(cx + cw // 2, W)
    out = x.clone(); out[:, :, y1:y2, x1:x2] = x[perm][:, :, y1:y2, x1:x2]
    lam_real = 1 - (y2 - y1) * (x2 - x1) / (H * W)                                    # the box was clipped at the border: recompute the true area
    return out, lam_real * y + (1 - lam_real) * y[perm], lam_real

np.random.seed(0); torch.manual_seed(0)
x = torch.randn(8, 3, 32, 32); y = torch.nn.functional.one_hot(torch.arange(8) % 4, 4).float()
xm, ym = mixup(x, y)
xc, yc, lam = cutmix(x, y)
print("labels still sum to 1:", bool(torch.allclose(ym.sum(1), torch.ones(8))), bool(torch.allclose(yc.sum(1), torch.ones(8))))
changed = (xc != x).any(1).float().mean()
print(f"CutMix: pasted area ~ {1 - lam:.2f} of the image, fraction of pixels that changed {float(changed):.2f}")
assert abs((1 - lam) - float(changed)) < 0.12
print("soft labels need a loss that accepts probabilities: -(y * log_softmax(logits)).sum(1).mean()")
```
Follow-ups: why they regularise and help calibration, when not to use them (small objects, tasks where the label is local), using CutMix for detection (Mosaic, copy-paste).
:::
:::

## 7. Grad-CAM with hooks

:::problem Implement Grad-CAM for a CNN: capture the activations and gradients of a convolutional layer with hooks, weight the channels by the average gradient, and produce a heat-map. Show that the heat-map is high where the class evidence is. {level=hard tags="interpretability,hooks,grad-cam"}
`weights = mean over space of dY/dA`; `cam = ReLU(sum over channels of weights × A)`; upsample to the input size.

:::solution Reference solution
```python local check title="Grad-CAM"
import torch
from torch import nn
import torch.nn.functional as F

torch.manual_seed(0)
# a tiny task where the answer is known: class 1 if the bright 8x8 square is in the LEFT half, class 0 if in the right half
def make(n):
    x = torch.zeros(n, 1, 32, 32); y = torch.randint(0, 2, (n,))
    for i in range(n):
        r = torch.randint(0, 24, (1,)).item(); c = torch.randint(0, 8, (1,)).item() + (16 if y[i] == 0 else 0)
        x[i, 0, r:r + 8, c:c + 8] = 1.0
    return x + 0.05 * torch.randn_like(x), y

net = nn.Sequential(nn.Conv2d(1, 8, 3, padding=1), nn.ReLU(), nn.Conv2d(8, 16, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(16, 2))
opt = torch.optim.Adam(net.parameters(), 3e-3)
X, Y = make(600)
for _ in range(150):
    loss = F.cross_entropy(net(X), Y); opt.zero_grad(); loss.backward(); opt.step()
print(f"train accuracy {float((net(X).argmax(1) == Y).float().mean()):.3f}")

def grad_cam(model, layer, x, class_idx=None):
    store = {}
    h1 = layer.register_forward_hook(lambda m, i, o: store.__setitem__("a", o))                 # activations A
    h2 = layer.register_full_backward_hook(lambda m, gi, go: store.__setitem__("g", go[0]))     # gradients dY/dA
    logits = model(x)
    cls = logits.argmax(1) if class_idx is None else torch.full((len(x),), class_idx)
    model.zero_grad(); logits.gather(1, cls[:, None]).sum().backward()
    h1.remove(); h2.remove()                                                                    # always remove hooks (they leak memory otherwise)
    w = store["g"].mean((2, 3), keepdim=True)                                                   # channel weights: average gradient
    cam = F.relu((w * store["a"]).sum(1, keepdim=True))
    cam = F.interpolate(cam, size=x.shape[-2:], mode="bilinear", align_corners=False)
    return cam / (cam.amax((2, 3), keepdim=True) + 1e-9)

Xt, Yt = make(100)
net.eval()
cam = grad_cam(net, net[2], Xt)                                                                  # use the last conv layer
inside = []
for i in range(len(Xt)):
    square = Xt[i, 0] > 0.5
    inside.append(float(cam[i, 0][square].mean()) / (float(cam[i, 0].mean()) + 1e-9))
print(f"average CAM value inside the square relative to the image average: {sum(inside) / len(inside):.2f}x (1.0 would mean no localisation)")
assert sum(inside) / len(inside) > 1.2
print("always use the last convolutional layer: deeper = more semantic, shallower = more spatial detail")
```
Follow-ups: Grad-CAM++, Score-CAM, attention rollout for ViTs, sanity checks (randomise the weights and see whether the map changes), limitations (low resolution, explains the model not the truth).
:::
:::

## 8. A correct training loop, and a bug hunt

:::problem Write a complete supervised training and evaluation loop (data loader, model, loss, optimiser, scheduler, metric, best-model tracking). Then find the bugs in the broken version below. {level=medium tags="training-loop,debugging"}
The loop must switch `train()`/`eval()`, call `zero_grad`, use `no_grad` for evaluation, step the scheduler, and keep the best validation checkpoint.

```python
# BROKEN: find at least seven problems
model = Net()
opt = torch.optim.Adam(model.parameters(), lr=1e-3)
for epoch in range(10):
    for x, y in train_loader:
        out = model(x)
        loss = F.cross_entropy(F.softmax(out, dim=1), y)
        loss.backward()
        opt.step()
        running += loss
    correct = 0
    for x, y in val_loader:
        correct += (model(x).argmax(1) == y).sum()
    print(epoch, running / len(train_loader), correct / len(val_loader))
```

:::solution Reference solution
**The bugs**: (1) no `model.train()` / `model.eval()` (dropout and batch-norm behave wrongly); (2) no `opt.zero_grad()` (gradients accumulate across steps); (3) `cross_entropy` applied to **softmax** outputs (it expects raw logits, so the loss is double-softmaxed and learns badly); (4) `running` is never initialised and `running += loss` keeps the **autograd graph** alive (use `loss.item()`); (5) the validation loop has no `torch.no_grad()` (memory and speed); (6) `x, y` are never moved to the **device**; (7) accuracy divides by the number of batches, not the number of samples; (8) no scheduler, no checkpointing of the best model; (9) shuffling is not mentioned for the train loader and a fixed seed is missing.

```python local check title="A clean training and evaluation loop"
import torch
from torch import nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, TensorDataset
from sklearn.datasets import load_digits
from sklearn.model_selection import train_test_split

torch.manual_seed(0)
device = "cuda" if torch.cuda.is_available() else "cpu"
X, y = load_digits(return_X_y=True)
Xtr, Xva, ytr, yva = train_test_split(torch.tensor(X / 16.0, dtype=torch.float32).view(-1, 1, 8, 8), torch.tensor(y), test_size=0.25, random_state=0, stratify=y)
train_loader = DataLoader(TensorDataset(Xtr, ytr), batch_size=64, shuffle=True)         # shuffle only the training set
val_loader = DataLoader(TensorDataset(Xva, yva), batch_size=256)

model = nn.Sequential(nn.Conv2d(1, 32, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2), nn.Conv2d(32, 64, 3, padding=1), nn.ReLU(), nn.MaxPool2d(2), nn.Flatten(), nn.Dropout(0.2), nn.Linear(64 * 2 * 2, 10)).to(device)
opt = torch.optim.AdamW(model.parameters(), lr=3e-3, weight_decay=1e-4)
epochs = 30
sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=epochs * len(train_loader))
best_acc, best_state = 0.0, None

def evaluate(loader):
    model.eval()                                                                          # dropout off, batch-norm uses running statistics
    correct = total = 0
    with torch.no_grad():                                                                 # no graph: less memory, faster
        for xb, yb in loader:
            xb, yb = xb.to(device), yb.to(device)
            correct += (model(xb).argmax(1) == yb).sum().item(); total += len(yb)
    return correct / total                                                                # divide by samples, not batches

for epoch in range(epochs):
    model.train()
    running = 0.0
    for xb, yb in train_loader:
        xb, yb = xb.to(device), yb.to(device)
        loss = F.cross_entropy(model(xb), yb)                                             # raw logits, no softmax
        opt.zero_grad(set_to_none=True)                                                   # clear old gradients
        loss.backward()
        nn.utils.clip_grad_norm_(model.parameters(), 1.0)                                 # optional safety against exploding gradients
        opt.step(); sched.step()                                                          # OneCycleLR steps per batch
        running += loss.item() * len(xb)                                                  # .item(): detach from the graph
    acc = evaluate(val_loader)
    if acc > best_acc: best_acc, best_state = acc, {k: v.detach().cpu().clone() for k, v in model.state_dict().items()}
    if epoch % 10 == 9: print(f"epoch {epoch + 1:>2}: train loss {running / len(Xtr):.4f}, val accuracy {acc:.4f}")
model.load_state_dict(best_state)
print(f"best validation accuracy {best_acc:.4f} (restored the best checkpoint)")
assert best_acc > 0.9
```
Follow-ups: mixed precision (`autocast` + `GradScaler`), gradient accumulation, checkpointing optimiser and scheduler state, reproducibility seeds, the test set must stay untouched until the end.
:::
:::

## 9. Dataset, augmentation and a detection collate function

:::problem Write a `Dataset` that returns an image tensor and a dictionary with a variable number of boxes, and a `collate_fn` so a `DataLoader` can batch it. Why does the default collate fail? {level=medium tags="dataset,dataloader,collate"}
Images can be stacked into one tensor; the number of boxes differs per image, so targets must stay a **list**.

:::solution Reference solution
```python local check title="A detection dataset with a custom collate"
import torch
from torch.utils.data import Dataset, DataLoader

class ToyDetection(Dataset):
    def __init__(self, n=10, seed=0):
        g = torch.Generator().manual_seed(seed); self.items = []
        for _ in range(n):
            k = int(torch.randint(0, 5, (1,), generator=g))                               # 0-4 objects per image (may be zero!)
            xy = torch.rand(k, 2, generator=g) * 0.5; wh = torch.rand(k, 2, generator=g) * 0.4 + 0.05
            self.items.append((torch.rand(3, 64, 64, generator=g), {"boxes": torch.cat([xy, xy + wh], 1) * 64, "labels": torch.randint(1, 4, (k,), generator=g)}))
    def __len__(self): return len(self.items)
    def __getitem__(self, i): return self.items[i]

def collate(batch):
    images, targets = zip(*batch)
    return torch.stack(images), list(targets)                                              # images stack; targets stay a list of dicts

ds = ToyDetection()
try:
    next(iter(DataLoader(ds, batch_size=4)))                                               # default collate tries to stack the dicts' tensors
except RuntimeError as e:
    print("default collate fails:", str(e).split(":")[0][:70])
imgs, targets = next(iter(DataLoader(ds, batch_size=4, collate_fn=collate)))
print("images", tuple(imgs.shape), "| boxes per image:", [len(t["boxes"]) for t in targets])
assert imgs.shape == (4, 3, 64, 64) and isinstance(targets, list)

# flip augmentation: boxes MUST be transformed together with the image
def hflip(img, t):
    W = img.shape[-1]; b = t["boxes"].clone()
    b[:, [0, 2]] = W - t["boxes"][:, [2, 0]]                                               # x1' = W - x2, x2' = W - x1 (swap so x1 < x2)
    return img.flip(-1), {**t, "boxes": b}
img, t = ds[1]; fimg, ft = hflip(img, t)
back_img, back_t = hflip(fimg, ft)
assert torch.equal(back_img, img) and torch.allclose(back_t["boxes"], t["boxes"])
print("flipping twice returns the original image and boxes; always test geometry augmentations with a round trip")
```
Follow-ups: empty targets, `num_workers` and seeding workers, albumentations/torchvision v2 transforms that handle boxes and masks, why the target format is a dict of tensors.
:::
:::

## 10. Label smoothing and a soft-label loss

:::problem Implement cross-entropy with label smoothing `ε` and verify against `F.cross_entropy(..., label_smoothing=ε)`. {level=easy tags="loss,label-smoothing"}
Smoothed target = `(1 − ε)` on the true class plus `ε / C` spread over all classes.

:::solution Reference solution
```python local check title="Label-smoothing cross-entropy"
import torch
import torch.nn.functional as F

def smooth_ce(logits, target, eps=0.1):
    C = logits.size(-1)
    logp = F.log_softmax(logits, dim=-1)                                              # log-softmax is the stable way
    soft = torch.full_like(logp, eps / C)                                             # eps spread uniformly over all classes
    soft.scatter_(1, target[:, None], 1 - eps + eps / C)                              # the true class keeps 1 - eps (+ its share of the uniform part)
    return -(soft * logp).sum(-1).mean()

torch.manual_seed(0)
logits = torch.randn(16, 10) * 3; target = torch.randint(0, 10, (16,))
mine = smooth_ce(logits, target, 0.1); ref = F.cross_entropy(logits, target, label_smoothing=0.1)
print(f"mine {mine:.6f} | torch {ref:.6f}")
assert torch.allclose(mine, ref, atol=1e-6)
print("effect: the optimum logit gap is finite, so the network stops pushing confidence to infinity -> less overconfidence, better calibration")
```
Follow-ups: why it helps generalisation, interaction with knowledge distillation, why it can hurt when you need calibrated probabilities for rare events.
:::
:::

## 11. A residual block and its parameter count

:::problem Implement a ResNet `BasicBlock` (two 3×3 convs, batch-norm, ReLU, identity or 1×1 projection shortcut). Check its parameter count and output shape against torchvision's block. {level=medium tags="resnet,parameters"}
`out = relu(bn2(conv2(relu(bn1(conv1(x))))) + shortcut(x))`; the shortcut needs a 1×1 conv when stride or channels change.

:::solution Reference solution
```python local check title="BasicBlock"
import torch
from torch import nn
from torchvision.models.resnet import BasicBlock as TVBlock

class BasicBlock(nn.Module):
    def __init__(self, cin, cout, stride=1):
        super().__init__()
        self.conv1 = nn.Conv2d(cin, cout, 3, stride, 1, bias=False); self.bn1 = nn.BatchNorm2d(cout)     # bias=False: batch-norm has its own shift
        self.conv2 = nn.Conv2d(cout, cout, 3, 1, 1, bias=False); self.bn2 = nn.BatchNorm2d(cout)
        self.relu = nn.ReLU(inplace=True)
        self.short = nn.Identity() if stride == 1 and cin == cout else nn.Sequential(nn.Conv2d(cin, cout, 1, stride, bias=False), nn.BatchNorm2d(cout))
    def forward(self, x):
        out = self.relu(self.bn1(self.conv1(x)))
        out = self.bn2(self.conv2(out))
        return self.relu(out + self.short(x))                                                           # add BEFORE the final ReLU

count = lambda m: sum(p.numel() for p in m.parameters())
for cin, cout, stride in [(64, 64, 1), (64, 128, 2)]:
    mine = BasicBlock(cin, cout, stride)
    ds = None if (stride == 1 and cin == cout) else nn.Sequential(nn.Conv2d(cin, cout, 1, stride, bias=False), nn.BatchNorm2d(cout))
    ref = TVBlock(cin, cout, stride, downsample=ds)
    x = torch.randn(2, cin, 28, 28)
    print(f"{cin}->{cout}, stride {stride}: parameters mine {count(mine):,} | torchvision {count(ref):,} | output {tuple(mine(x).shape)}")
    assert count(mine) == count(ref) and mine(x).shape == ref(x).shape
print("by hand for 64->64: 2 convs x (3*3*64*64 = 36,864) + 2 batch-norms x 128 = 73,984 parameters")
```
Follow-ups: the bottleneck block (1×1, 3×3, 1×1), pre-activation ordering, why `bias=False` before batch-norm, zero-initialising the last BN gamma.
:::
:::

## 12. Gradient checking and the "overfit one batch" test

:::problem Verify a custom operation's gradient numerically, and write the "overfit a single batch" sanity test that every training pipeline should pass. {level=hard tags="gradients,testing"}
`torch.autograd.gradcheck` compares analytic gradients with finite differences in float64. For the pipeline test: the loss on one fixed batch must go to nearly zero.

:::solution Reference solution
```python local check title="gradcheck and the overfit-one-batch test"
import torch
from torch import nn
import torch.nn.functional as F

# a custom autograd function: soft-thresholding (used in sparse coding), with a hand-written backward
class SoftThreshold(torch.autograd.Function):
    @staticmethod
    def forward(ctx, x, lam):
        ctx.save_for_backward(x); ctx.lam = lam
        return torch.sign(x) * torch.clamp(x.abs() - lam, min=0)
    @staticmethod
    def backward(ctx, g):
        (x,) = ctx.saved_tensors
        return g * (x.abs() > ctx.lam).to(g.dtype), None                       # gradient 1 outside [-lam, lam], 0 inside; no gradient for lam

x = torch.randn(20, dtype=torch.double, requires_grad=True) * 2
x = x.detach().requires_grad_()
print("gradcheck passed:", torch.autograd.gradcheck(lambda t: SoftThreshold.apply(t, 0.5), (x,), eps=1e-6, atol=1e-4))

# the overfit-one-batch test: if a model cannot memorise 16 images, something is wrong (data, loss, LR, wiring)
torch.manual_seed(0)
model = nn.Sequential(nn.Conv2d(3, 8, 3, padding=1), nn.ReLU(), nn.AdaptiveAvgPool2d(1), nn.Flatten(), nn.Linear(8, 5))
xb, yb = torch.randn(16, 3, 16, 16), torch.randint(0, 5, (16,))
opt = torch.optim.Adam(model.parameters(), 1e-2)
first = F.cross_entropy(model(xb), yb).item()
for _ in range(300):
    loss = F.cross_entropy(model(xb), yb); opt.zero_grad(); loss.backward(); opt.step()
print(f"loss on the single batch: start {first:.3f} (expected about ln(5) = 1.609) -> after 300 steps {loss.item():.4f}")
assert abs(first - 1.609) < 0.5 and loss.item() < 0.05
print("a pipeline that cannot overfit one batch has a bug; one that overfits but does not generalise needs data or regularisation")
```
Follow-ups: finite-difference intuition, float64 for gradcheck, checking for NaNs (`torch.autograd.set_detect_anomaly`), the expected initial loss `ln(C)`.
:::
:::

:::interview Questions you may get
- "Write a custom loss and prove it works." Implement from logits, test against a reference on random data, check gradients flow and that extreme values do not give NaN.
- "Debug this training loop." Check modes (`train`/`eval`), `zero_grad`, loss inputs (logits), `.item()`, `no_grad`, devices, data leakage, learning-rate and scheduler stepping.
- "How do you make a training run reproducible?" Fix seeds (Python, NumPy, PyTorch, DataLoader workers), deterministic algorithms flag, pinned versions, saved data splits, and logged configuration.
- "Why is my GPU memory growing?" Accumulating tensors with graphs (`running += loss`), storing outputs without `.detach()`, no `no_grad` during evaluation, caching in a list, or hooks that are never removed.
:::

```quiz
? What should `F.cross_entropy` receive as its input?
+ Raw logits, not softmax probabilities
- Softmax probabilities
- One-hot vectors
> It applies log-softmax internally.

? Why call `loss.item()` when accumulating the epoch loss?
+ To avoid keeping the autograd graph of every step in memory
- To make the loss smaller
- To move it to the GPU
> `running += loss` keeps graphs alive.

? A model cannot overfit a single batch of 16 images. What does that most likely indicate?
+ A bug in data, loss, wiring or learning rate
- The dataset is too small
- The model is too big
> Fix the pipeline before tuning.

? Why does a detection `DataLoader` need a custom `collate_fn`?
+ Different images have different numbers of boxes, which cannot be stacked into one tensor
- Images have different colours
- The default collate is slower
> Keep targets as a list.
```

:::keypoints
- Be able to write from memory: unfold-based convolution, multi-head attention, focal loss, Dice/mIoU, GIoU/NMS, Mixup/CutMix, Grad-CAM, a clean training loop, a detection collate, label smoothing, a residual block, and a gradient/overfit test.
- Always test against the library version, check shapes and gradients, and make losses numerically stable from logits.
- Most training bugs are in the loop (modes, `zero_grad`, wrong loss input, graph-keeping accumulation, devices), not the model.
:::

:::resources
- [PyTorch documentation: torch.nn.functional](https://pytorch.org/docs/stable/nn.functional.html) — the reference for losses and layers.
- [torchvision.ops documentation](https://pytorch.org/vision/stable/ops.html) — IoU, NMS, focal loss and other reference implementations.
- [PyTorch tutorials: Training a classifier](https://pytorch.org/tutorials/beginner/blitz/cifar10_tutorial.html) — a standard training-loop walk-through.
- [Karpathy: A Recipe for Training Neural Networks](https://karpathy.github.io/2019/04/25/recipe/) — the debugging mindset (overfit one batch first).
:::
