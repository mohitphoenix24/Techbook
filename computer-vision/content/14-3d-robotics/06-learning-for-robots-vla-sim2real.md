---
title: Learning for Robots: Imitation, VLA Models and Sim-to-Real
level: advanced
time: 55
summary: How vision connects to robot actions through learning. Behaviour cloning and its compounding-error problem (with a runnable demo and DAgger), diffusion policies and action chunking (ACT), vision-language-action models (RT-2, OpenVLA, pi0), datasets and teleoperation, simulation, domain randomisation and sim-to-real, and what to ask before trusting a learned policy.
---

Until now vision gave the robot **measurements** (poses, grasps, maps), and engineers wrote the rest. A newer approach trains a network to map **camera images (and a language instruction) directly to robot actions**. This is **visuomotor learning**, and you will meet it in any modern robotics interview. Know the ideas, the strengths, and, most importantly, the limits.

## Policy learning in one picture

A **policy** `π(a | o, g)` maps an **observation** `o` (camera images, joint angles, force readings) and a **goal** `g` (a task id or a language instruction) to an **action** `a` (end-effector motion or joint targets, gripper open/close). Two big ways to learn it:

| | **Imitation learning (IL)** | **Reinforcement learning (RL)** |
|---|---|---|
| Learns from | Demonstrations by humans (teleoperation) | Trial and error with a reward |
| Strengths | Fast, safe, no reward design; works on real robots | Can exceed the demonstrator; good for dynamics (locomotion, in-hand manipulation) |
| Weaknesses | Needs demonstration data; **compounding errors**; limited by the demonstrator | Sample-hungry; reward design; hard on real hardware; usually trained in **simulation** |
| Typical use | Manipulation with vision | Legged locomotion, dexterous hands, sim-trained skills |

## Behaviour cloning and compounding errors

**Behaviour cloning (BC)** is supervised learning: predict the expert's action from the observation. It is simple and works well **on the demonstration states**. The catch: in deployment, every small error moves the robot to a state the expert **never visited**, where the policy is untrained and errs more: **errors compound** (distribution shift).

```python local check title="Behaviour cloning drifts; DAgger fixes it by asking the expert about the learner's own states"
import numpy as np
import torch
from torch import nn

torch.manual_seed(0); rng = np.random.default_rng(0)

def expert(s):                                              # follow the unit circle counter-clockwise, correcting any radial error
    r = np.linalg.norm(s) + 1e-9
    tangent = np.array([-s[1], s[0]]) / r
    radial = -(s / r) * (r - 1.0)
    a = tangent + 3.0 * radial
    return a / (np.linalg.norm(a) + 1e-9)

def rollout(policy, steps=120, noise=0.0, start_noise=0.0):
    s = np.array([1.0, 0.0]) + start_noise * rng.normal(size=2); traj = [s.copy()]
    for _ in range(steps):
        a = policy(s)
        s = s + 0.05 * a + noise * rng.normal(size=2)            # the world: a step plus some disturbance (wheel slip, a push)
        traj.append(s.copy())
    traj = np.array(traj)
    return traj, np.abs(np.linalg.norm(traj, axis=1) - 1).mean()

def make_net(): return nn.Sequential(nn.Linear(2, 64), nn.Tanh(), nn.Linear(64, 64), nn.Tanh(), nn.Linear(64, 2))
def train(net, S, A, epochs=400):
    opt = torch.optim.Adam(net.parameters(), lr=3e-3)
    S, A = torch.tensor(np.array(S), dtype=torch.float32), torch.tensor(np.array(A), dtype=torch.float32)
    for _ in range(epochs):
        loss = ((net(S) - A) ** 2).mean(); opt.zero_grad(); loss.backward(); opt.step()
    return loss.item()
def as_policy(net):
    return lambda s: net(torch.tensor(s, dtype=torch.float32)[None])[0].detach().numpy()

# 1. behaviour cloning: learn from expert demonstrations only (the expert never visits states far from the circle)
demos = [rollout(expert)[0] for _ in range(5)]
S = np.vstack([d[:-1] for d in demos]); A = np.array([expert(s) for s in S])
bc = make_net(); l = train(bc, S, A)
print(f"BC training loss {l:.4f} on {len(S)} expert states")
def evaluate(policy, label, n=30):
    errs = [rollout(policy, noise=0.02, start_noise=0.15)[1] for _ in range(n)]
    print(f"{label:<28} mean distance from the circle during the run: {np.mean(errs):.3f}   (worst of {n} runs {np.max(errs):.3f})")
evaluate(expert, "expert")
evaluate(as_policy(bc), "behaviour cloning")

# 2. DAgger: run the LEARNER, ask the expert what it would have done in the states the learner visited, add those, retrain
S2, A2 = list(S), list(A)
net = make_net(); train(net, S2, A2)
for it in range(4):
    for _ in range(8):
        traj, _ = rollout(as_policy(net), noise=0.02, start_noise=0.15)
        S2 += list(traj[:-1]); A2 += [expert(s) for s in traj[:-1]]
    train(net, S2, A2)
evaluate(as_policy(net), "DAgger (4 rounds)")
print("the demonstrations only cover the circle itself; small errors push the learner off it into states it never saw, and errors compound")
```

Remedies used in practice: **DAgger** (collect expert labels on the learner's states), **noise injection** during demonstrations (so recoveries are visible), **many diverse demonstrations**, **action chunking** and **closed-loop** high-frequency control, **data augmentation** (random crops and colour jitter on images), and **recovery data** where the demonstrator deliberately fixes mistakes.

## Modern visuomotor policies

- **ACT (Action Chunking with Transformers)** and the **ALOHA** low-cost bimanual platform: predict a **chunk** of the next ~50-100 actions at once, reducing compounding errors and jitter; trained from 50 demonstrations per task, with a CVAE to model the demonstrator's style.
- **Diffusion Policy** (2023): the policy is a **denoising diffusion model over action sequences**, conditioned on images. It represents **multi-modal** behaviour (the human may go around the obstacle left or right; a regression policy would average them and hit it) and gives smooth, accurate actions; became a standard baseline.
- **Transformer policies** (RT-1, PerAct, Octo): tokenise images and instructions, predict discretised or continuous actions.
- **Observation design**: wrist camera + one or two external cameras, low resolution (96–224 px) with a ResNet or ViT encoder pre-trained on large data (R3M, VC-1, DINOv2, SigLIP); proprioception (joint angles) as extra input; stack a few past frames for velocity.

## Vision-language-action (VLA) models

Take a **vision-language model** (module 11), pre-trained on internet images and text, and **fine-tune it to output robot actions**. The model inherits **semantic knowledge** (object categories, concepts, reasoning) that robot data alone could never provide.

| Model | Idea |
|---|---|
| **SayCan** (2022) | An LLM proposes steps, and **affordance (value) functions** from the robot score which are feasible: "I cannot lift the couch, but I can pick the sponge" |
| **RT-1** | A transformer on image history + instruction, trained on 130 k real episodes from 13 robots, outputs **discretised action tokens** |
| **RT-2** (2023) | A VLM (PaLI-X / PaLM-E) fine-tuned to emit **actions as text tokens** alongside web data; shows generalisation to new objects and instructions ("move the banana to the sum of two plus one") |
| **OpenVLA** (2024) | An open 7 B VLA (SigLIP + DINOv2 visual encoder + Llama 2) trained on the **Open X-Embodiment** data (about 1 M episodes from many robots); fine-tunable with LoRA on one GPU |
| **Octo, π0 (pi-zero), GR00T, SmolVLA** | Generalist policies with a **flow-matching / diffusion action head** for smooth continuous, high-frequency control; π0 handles dexterous tasks (laundry folding) |
| **VoxPoser, ReKep, code-as-policies** | Use an LLM/VLM to write **3-D value maps, constraints or code** that classical planners execute: no robot training data |

What to remember: VLAs are **impressive on semantic generalisation** (new objects, new instructions) but still **weaker on precision, reliability and speed** than a purpose-built pipeline; success rates in the open are often 50-90% on tasks in or near the training distribution, with large drops outside; inference runs at 5-15 Hz for the big models, so action chunks and a fast low-level controller are used.

## Data: the real bottleneck

- **Teleoperation**: leader-follower arms (ALOHA, GELLO), VR controllers, **spacemouse**, hand-tracking gloves, **UMI (Universal Manipulation Interface)**: a handheld gripper with a camera that collects demos **without a robot**.
- **Datasets**: Open X-Embodiment (RT-X), **DROID** (76 k real episodes), BridgeData, RoboNet, Ego4D / EPIC (human videos for pre-training).
- **Learn from human video**: hand-pose retargeting, learned reward/value functions, video prediction as pre-training; still an active research area.
- **Quality over quantity**: consistent, smooth demonstrations beat many messy ones; record success/failure labels; keep calibrated cameras and fixed lighting at first.

## Simulation and sim-to-real

Simulators (**Isaac Sim / Isaac Lab**, MuJoCo / MJX, PyBullet, Genesis, ManiSkill, RoboCasa) allow thousands of parallel robots and perfect labels (depth, masks, poses, contact), which makes **RL and synthetic data** practical (Isaac Gym trains locomotion in minutes). The **reality gap** (visual appearance, physics parameters, sensor noise, latency) is bridged by:

- **Domain randomisation**: randomise textures, lighting, camera pose and noise, object masses, friction, motor delays during training so the real world looks like "just another sample" (Tobin et al.; OpenAI's Rubik's-cube hand).
- **System identification** and **real-to-sim calibration**: match the simulator's parameters to the real robot; **digital twins** built with NeRF/3DGS scans (previous lessons).
- **Adaptation**: fine-tune on a little real data, or use residual policies/ **teacher-student distillation** (the student uses only onboard sensors).
- **Real-world fine-tuning with RL** (HIL-SERL) for precision tasks.
- **Photorealistic or generative augmentation** to cover appearance gaps (diffusion-based style randomisation).

## Evaluating a learned policy (do not skip)

- **Success rate over many trials** with confidence intervals (20 trials gives ±20%), on **new object positions, lighting, distractors** and sometimes new objects.
- **Failure taxonomy** (perception, planning, grasp, timeout, collision).
- **Safety envelope**: workspace limits, force limits, speed limits, and an emergency stop independent of the network; **monitor** for out-of-distribution observations and fall back to a safe behaviour.
- **Compare against a classical baseline** (pipeline from the previous lesson): learned policies win on flexibility and contact-rich tasks, pipelines win on precision, speed and traceability.
- **Reproducibility**: record model version, data version, camera calibration and the exact setup.

:::interview Questions you may get
- "What is behaviour cloning and what goes wrong with it?" Supervised learning of actions from demonstrations; distribution shift makes small errors compound; fixes are DAgger, noise injection, diversity, action chunking.
- "Why use diffusion policies?" They model multi-modal action distributions and produce smooth action sequences, avoiding the averaging problem of regression.
- "What is a VLA?" A vision-language model fine-tuned to output robot actions, inheriting web-scale semantic knowledge.
- "What is domain randomisation?" Randomising simulator appearance and physics so that a policy trained in simulation transfers to the real world.
- "When would you choose a classical vision pipeline over an end-to-end policy?" Precision and speed requirements, safety certification, explainability, limited data, high-volume repeatable tasks.
- "How do you evaluate a manipulation policy?" Many trials across varied conditions with confidence intervals, a failure taxonomy, safety checks and comparison with a baseline.
:::

```quiz
? Why do behaviour cloning policies drift in deployment?
+ Small errors lead to states never seen in the demonstrations, where the policy is unreliable
- The network has too many layers
- The demonstrations are too long
> Distribution shift and compounding error.

? What problem does a diffusion policy solve that a regression policy has?
+ It can represent multi-modal actions instead of averaging them
- It runs faster
- It needs no images
> Left or right around the obstacle.

? What does a VLA model like RT-2 output?
+ Robot actions, represented as tokens alongside text
- A segmentation mask
- A depth map
> Web knowledge transfers to control.

? What is the purpose of domain randomisation?
+ Making a policy trained in simulation robust to the differences from the real world
- Making the simulator faster
- Collecting real demonstrations
> The real world becomes one more variation.
```

:::problem A startup shows a VLA model that folds laundry at 70% success in their lab. A customer wants to deploy it in a hotel laundry at 99.5% reliability. What do you ask and recommend? {level=hard tags="vla,reliability,deployment"}
Think about distribution shift, metrics and risk control.

:::solution Model answer
Ask about the success definition, trials and conditions (towel types, lighting, tables), failure taxonomy, recovery behaviour, human intervention rate, speed and cost per item. 70% in the lab does not predict 99.5% in a new site: the target needs a **system** rather than a model. Recommend: a pilot with measured success per garment type, collecting failure data and fine-tuning; a task decomposition with verification steps (re-grasp, re-fold, reject and human hand-off); constrained workcell (lighting, table, bins); monitoring of out-of-distribution inputs; a human-in-the-loop for exceptions and measured throughput; and an economic target in terms of interventions per hour rather than a pure success rate. Compare with a simpler automation for the easy cases.
:::
:::

:::keypoints
- Visuomotor policies map images (and instructions) to actions; imitation learning is fast and practical, RL is strong with simulation and for dynamics.
- Behaviour cloning suffers from compounding errors; DAgger, noise injection, diverse data, action chunking (ACT) and diffusion policies mitigate it.
- VLA models (RT-2, OpenVLA, π0) add web-scale semantic knowledge to control; they generalise semantically but are less precise and reliable than engineered pipelines.
- Data collection (teleoperation, UMI, large shared datasets) is the bottleneck; simulation plus domain randomisation and calibration closes part of the reality gap.
- Evaluate with many trials, confidence intervals and a failure taxonomy, and keep an independent safety layer.
:::

:::resources
- [Chi et al.: Diffusion Policy](https://arxiv.org/abs/2303.04137) — visuomotor policies as action diffusion.
- [Zhao et al.: Learning Fine-Grained Bimanual Manipulation with Low-Cost Hardware (ACT and ALOHA)](https://arxiv.org/abs/2304.13705) — action chunking.
- [Brohan et al.: RT-2](https://arxiv.org/abs/2307.15818) — VLA models.
- [Kim et al.: OpenVLA](https://arxiv.org/abs/2406.09246) — an open VLA.
- [Black et al.: π0](https://arxiv.org/abs/2410.24164) — a flow-matching generalist policy.
- [Open X-Embodiment Collaboration: Open X-Embodiment](https://arxiv.org/abs/2310.08864) — large cross-robot dataset.
- [Tobin et al.: Domain Randomization for Transferring Deep Neural Networks from Simulation to the Real World](https://arxiv.org/abs/1703.06907) — sim-to-real.
- [Ahn et al.: SayCan](https://arxiv.org/abs/2204.01691) — grounding language in affordances.
:::
