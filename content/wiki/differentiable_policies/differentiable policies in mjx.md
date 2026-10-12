---
title: differentiable policies in mjx
date: 2026-10-06
draft: false
tags:
  - differentiable_policies
  - robotics
  - RL
  - JAX
---
reimplementing Schwarke et al. in MuJoCo MJX, so the environment, the physics and the training are one JAX program. first ANYmal, then a 29-dof humanoid.

<!-- more -->

if you want the theory first (why backprop through a simulator, what SHAC is, why contacts kill the gradient), read [[Differentiable Robotics]]. this page is just my process.

### the paper

[Schwarke et al.](https://arxiv.org/abs/2404.02887) train locomotion policies with [[SHAC]]: unroll the simulator for a short window, backprop the reward straight into the policy, and let a critic cover everything after the window. the blocker for legged robots is that the contact solver has a hard `pos < 0` switch, so the gradient is zero at every footstep. they replace it with a sigmoid, and that's enough to train a walking ANYmal that runs on the real robot.

i wanted it in [[MJX]] so the whole thing (env, physics, policy, optimizer) is a single `jit`. i started from Andrew Luo's [jax_shac](https://github.com/Andrew-Luo1/jax_shac), which had SHAC working on toy envs but had given up on ANYmal.

### patching mjx

MJX is not meant to be differentiated through contacts, so two things had to change. both are monkey-patches applied at import time, before anything gets jitted.

**1. the contact switch.** three functions in `mjx/_src/constraint.py` (frictionless, pyramidal and elliptic cones) have the line `active = pos < 0`. the patch grabs their source, swaps that line for a sigmoid, and re-`exec`s them inside the module's own namespace so all the helpers are still in scope:

```python
active = pos < 0                       # original: gradient dies at contact
active = jax.nn.sigmoid(-pos * kappa)  # patched, kappa = 300
```

it raises if the pattern isn't found, so an MJX update fails loudly instead of silently training with hard contacts.

later i added a **straight-through** mode: hard switch in the forward pass, sigmoid derivative in the backward pass. the simulation is bit-identical to stock MJX and only the gradient is smoothed.

**2. the Newton solver.** the constraint solver's outer loop is a `jax.lax.while_loop`, and JAX can't reverse-mode differentiate a while loop. with `iterations > 1` you simply can't take a gradient. the patch reroutes it through a bounded `scan`-based loop (MJX already has one for its linesearch), which is differentiable.

*for future reference:* the ANYmal example was able to train on a single Newton step, adding the `jax.lax.while_loop` tweak was more necessary for training the G1.

### anymal

| param | value |
|---|---|
| envs | 512 |
| unroll length | 32 (~1.3 trot cycles) |
| kappa | 300 |
| iterations | 20 000 (~2 h on an RTX 3090) |

linear velocity tracking reached **0.73** (0 = standing still, 1 = perfect tracking), and the policy loss was still going down when i stopped.

the main difference from the paper: i measured the smoothed MJX gradients against finite differences and got a cosine similarity of **0.374**. noisy direction, so i needed 32-step unrolls where the paper uses 12, longer windows average out more of the noise.

things that mattered more than i expected:

- **clip by global norm, not per element.** the original port clipped every gradient element to [-1, 1], which destroys the direction of the gradient. switching to `optax.clip_by_global_norm(1.0)` (what the original PyTorch DiffRL does) fixed a lot.
- **stop the gradient at every reset.** when an env falls and resets, `nan_to_num` keeps the forward pass finite but the backward pass still runs through the explosion. `stop_gradient` on the carried state when `done` cuts it.
- **log the fraction of NaN gradients.** it's a curve in tensorboard next to the reward; when it starts climbing, something in the reward is about to break.
- i also tried antithetic randomized smoothing (step the sim at $q + \epsilon$ and $q - \epsilon$ and average, so autodiff gives a smoothed Jacobian). it costs 2x the physics, and every run i kept has it off: the sigmoid alone was enough.
### humanoid

after ANYmal i moved to a 29-dof Unitree G1 (straight-through contacts, 64 envs, 32-step unrolls, cosine learning-rate decay). a biped is a lot less forgiving than a quadruped: it can't just stand there on four legs while it figures things out. most of the work was reward design:

- a **gait clock** (phase as $[\sin, \cos]$ in the observation) whose frequency goes from 1.0 to 1.8 Hz with the commanded speed, and a **cubic Bézier foot-height target** for the swing foot (15 cm peak).
- a **fall barrier** term, $-\big(\frac{z_b - z}{z_b - z_\text{term}}\big)^2$, that starts penalizing before the robot actually falls, so there's a gradient towards *not falling* instead of just a termination.
- feet separation and straightness terms, added later. 

and one very differentiable-sim bug: the gait frequency used `jnp.linalg.norm(vel_cmd)`. at a zero command the gradient of the norm is $0/0$, so every standing env was injecting NaNs into the policy. one `stop_gradient` on the command fixed it.

### sim2real

i kept a running list of every place where training and deployment disagree. a few that surprised me:

- **the GPU and the CPU disagree.** the same jitted network gives outputs up to 3.6e-3 apart on GPU vs CPU, because XLA uses TF32 for float32 matmuls on the GPU. the policy obviously tolerates it (it was trained on GPU), but my export parity test had to be pinned to CPU.
- **observations lag the physics by one substep.** some derived arrays out of `mjx.step` (body positions, velocities) are from *before* the last integration, so in training part of the observation was 2 ms stale. the robot's sensors aren't. it's inside the training noise, so i left it.
- **the real sensors are much quieter than training.** measured on the robot: joint positions 25x quieter and tilt 110x quieter than my estimate.
- **better sensors made it *less* stable standing still.** in sim2sim, with realistic noise the leg odometry was accurate, the gait clock stopped when the robot was parked, and the policy was unstable while parked (85% survival). with the noisier training-level noise the clock kept ticking and survival was 100%. the policy was only ever good at *stepping*, and noise was hiding it.

### hardware

![[hardware.mp4]]

I'm yet to test it properly without the harness, I don't want to break the G1 that soon :P

### code

[differential-policies](https://github.com/saucesaft/differential_policies)
