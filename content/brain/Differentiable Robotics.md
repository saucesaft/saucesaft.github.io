---
date: 2026-09-29
draft: false
tags:
  - robotics
  - RL
  - JAX
  - maths
---
I really find this method of training policies really interesting: instead of treating the simulator as a black box, you backpropagate through the physics.

<!-- more -->

Say you want a policy $\pi_\theta$ that makes a robot walk. You have a simulator $f$ that takes the current state and an action and gives you the next state, and a reward $r$ that tells you how good each step was:

$$
a_t = \pi_\theta(s_t), \qquad s_{t+1} = f(s_t, a_t), \qquad J(\theta) = \sum_{t=0}^{T} \gamma^t \, r(s_t, a_t)
$$

You want $\nabla_\theta J$. There are two very different ways of getting it.

*Zeroth-order: the simulator is a black box*

This is what [[PPO]] and every REINFORCE-flavoured method do. You never look inside $f$, you just run it, see what reward you got, and nudge the policy towards the actions that happened to work:

$$
\nabla_\theta J = \mathbb{E}\Big[\sum_t \nabla_\theta \log \pi_\theta(a_t \mid s_t)\, \hat{A}_t\Big]
$$

It's called zeroth-order because it only ever uses *values* of the reward, never its derivative. That makes it incredibly robust: $f$ can be discontinuous, non-differentiable, written in C++ that you can't touch, it doesn't matter. The price is variance. You're estimating a gradient from random trials, so you need a lot of them, which is why PPO locomotion runs use thousands of parallel environments and billions of steps.

*First-order: the simulator is just another layer*

If $f$ is differentiable (written in JAX like [[MJX]], or in Warp), you can do what you'd do with any neural network: chain rule all the way back through the rollout.

$$
\frac{d s_{t+1}}{d\theta} = \frac{\partial f}{\partial s}\frac{d s_t}{d\theta} + \frac{\partial f}{\partial a}\Big(\frac{\partial \pi}{\partial \theta} + \frac{\partial \pi}{\partial s}\frac{d s_t}{d\theta}\Big)
$$

Now the gradient isn't "this random action happened to work", it's "if your knee torque were a bit higher, your body would have been 2 mm further forward". One rollout gives you an actual derivative, not a noisy estimate of one. In theory that's orders of magnitude more sample-efficient.

So why isn't everybody doing this? Three reasons.

*Problem 1: long horizons explode*

Look at the recursion above: $\frac{ds_t}{d\theta}$ gets multiplied by $\big(\frac{\partial f}{\partial s} + \frac{\partial f}{\partial a}\frac{\partial \pi}{\partial s}\big)$ at every step. Unroll for $T$ steps and you're multiplying $T$ Jacobians together. If their eigenvalues are a little above 1 the gradient explodes, a little below and it vanishes. Physics with contacts is chaotic, so it's usually the former.

The fix that made this practical is [[SHAC]] (Short-Horizon Actor-Critic, Xu et al. 2022): only backprop through a short window of $H$ steps, and let a learned critic $V_\phi$ stand in for everything after it:

$$
\mathcal{L}(\theta) = -\frac{1}{NH}\sum_{i=1}^{N}\Big[\sum_{t=t_0}^{t_0+H-1}\gamma^{t-t_0} r(s^i_t, a^i_t) + \gamma^{H} V_\phi(s^i_{t_0+H})\Big]
$$

The window starts from a state with `stop_gradient` on it, so gradients never travel further back than $H$ steps. $H$ is a dial: short is stable but short-sighted (the critic has to do more work), long sees more of the consequences but the Jacobian product starts to blow up.

*Problem 2: contacts have no gradient*

This is the big one for legged robots. Inside the contact solver there's a line that decides whether a contact exists at all. In MJX it's literally:

```python
active = pos < 0   # is the foot below the floor?
```

That's a step function. Its derivative is zero everywhere (and undefined at the edge). So if a foot is 2 cm above the ground, the gradient has no idea that pushing it down would give it traction. The policy can't learn "put your foot down" from a signal that is exactly zero.

A toy version, a foot 2 cm above the floor that only gets friction if it touches:

```python
import jax
import jax.numpy as jnp

def traction(a, kappa=None):
    foot_z = 0.02 - a                                # action pushes the foot down
    if kappa is None:
        active = jnp.where(foot_z < 0, 1.0, 0.0)     # hard switch
    else:
        active = jax.nn.sigmoid(-foot_z * kappa)     # soft switch
    return active * 0.8 * 1.0 * 9.81                 # mu * m * g, only while touching

jax.grad(traction)(0.0)                              # 0.0   -> learns nothing
jax.grad(lambda a: traction(a, kappa=300.0))(0.0)    # 5.81  -> "push the foot down"
```

The fix from Schwarke et al. is exactly that: replace the step with a sigmoid of sharpness $\kappa$. Now contacts that are *about to happen* (or just ended) leak a little gradient, and the policy can feel its way towards them.

The catch is that the soft version also changes the *physics*. With $\kappa = 300$ that foot 2 cm in the air already gets 0.019 N of ghost friction. Large $\kappa$: the physics is accurate but the gradient is only non-zero in a thin band around the floor. Small $\kappa$: lots of gradient, but you're training in a world where feet stick to the ground before touching it.

You can also get the best of both worlds with a straight-through estimator: the hard switch in the forward pass, the sigmoid's derivative in the backward pass:

```python
soft = jax.nn.sigmoid(-pos * kappa)
active = soft + jax.lax.stop_gradient((pos < 0) - soft)
# forward: exactly (pos < 0)    backward: d(soft)/d(pos)
```

The simulation stays bit-identical to the real one, and only the gradient is "lying". It's the same trick people use to backprop through quantization.

*Problem 3: NaNs*

With PPO, a NaN somewhere in the physics just means a weird episode. Here it goes straight into your weights. Two that bit me:

- **The norm at zero.** $\frac{d}{dx}\|x\| = \frac{x}{\|x\|}$, which is $\frac{0}{0}$ when $x = 0$. A velocity command of zero (standing still) inside a `jnp.linalg.norm` gave NaN gradients, even though the forward value was a perfectly fine `0.0`. `jax.grad(jnp.linalg.norm)(jnp.zeros(3))` returns `[nan nan nan]`. Wrapping the command in `stop_gradient` fixed it (it's an input, it should never have had a gradient anyway).
- **Terminated episodes.** When a robot falls, the env resets it and often `nan_to_num`s whatever exploded. The forward pass looks fine, but the backward pass still runs through the explosion, and `nan * 0` is still `nan`. The rule: `stop_gradient` the state on every reset, so nothing flows back through a fall.

*Is it worth it?*

The gradients you get are not perfect. In my [[differentiable policies in mjx|MJX reimplementation]] the smoothed gradients only had a cosine similarity of ~0.37 with finite differences, and I needed 32-step windows where the paper uses 12 to make up for it. But a noisy *first-order* gradient is still a lot better than a zeroth-order one, and Schwarke et al. show it's good enough to train locomotion that runs on a real ANYmal. Suh et al. also have a great paper on when the first-order gradient is actually *worse* (spoiler: stiff contacts and discontinuities, exactly the stuff above).

*References*

- Xu et al., *Accelerated Policy Learning with Parallel Differentiable Simulation* (SHAC), ICLR 2022. [arXiv:2204.07137](https://arxiv.org/abs/2204.07137)
- Schwarke et al., *Learning Deployable Locomotion Control via Differentiable Simulation*. [arXiv:2404.02887](https://arxiv.org/abs/2404.02887)
- Suh et al., *Do Differentiable Simulators Give Better Policy Gradients?*, ICML 2022. [arXiv:2202.00817](https://arxiv.org/abs/2202.00817)
