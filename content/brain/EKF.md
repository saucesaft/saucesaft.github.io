---
title: Extended Kalman Filters, intuitively
date: 2026-08-06
tags:
  - EKF
  - RL
  - robotics
  - maths
layout: layouts/post.njk
---

I keep coming back to the Extended Kalman Filter (EKF) every time I touch state estimation on a drone or a rover. It's one of those algorithms that looks like alphabet soup the first time you read it, but is actually a pretty simple idea wearing a trench coat of linear algebra.

<!-- more -->

## The problem

You have a robot. It has some internal state $x$; position, velocity, orientation, whatever you care about. You never get to observe $x$ directly. Instead you get two unreliable sources of information:

- a **motion model** that predicts how $x$ evolves over time, and
- a handful of **sensors** that give you noisy, partial glimpses of $x$.

Both are wrong in known, statistical ways. The whole game is combining "my model says this" with "my sensor says that" in a way that's weighted by how much you trust each one at that particular instant.

## The linear case first

If the world were linear, this is just the plain Kalman filter. The state evolves as

$$x_k = F x_{k-1} + B u_{k-1} + w_{k-1}$$

where $F$ is the state transition matrix, $u$ is a control input, and $w \sim \mathcal{N}(0, Q)$ is process noise. Measurements look like

$$z_k = H x_k + v_k$$

with $v \sim \mathcal{N}(0, R)$ observation noise. Two matrices, $Q$ and $R$, encode "how much do I trust the model" vs "how much do I trust the sensor." Tuning a Kalman filter is, 90% of the time, just tuning $Q$ and $R$ until the estimate stops lying to you.

## Why "extended"

Almost nothing interesting is linear. A drone's orientation dynamics, a wheel odometry model with a heading angle, a range-bearing sensor, these are all nonlinear functions of the state. So instead of $F$ and $H$ being fixed matrices, we have general functions:

$$x_k = f(x_{k-1}, u_{k-1}) + w_{k-1}$$
$$z_k = h(x_k) + v_k$$

The EKF's whole trick is: **linearize $f$ and $h$ around the current estimate, every single step**, using their Jacobians:

$$F_k = \left.\frac{\partial f}{\partial x}\right|_{\hat{x}_{k-1}}, \qquad H_k = \left.\frac{\partial h}{\partial x}\right|_{\hat{x}_k^-}$$

You still propagate the *actual* nonlinear $f$ and $h$ to get your best-guess state. But when it's time to propagate *uncertainty* (the covariance $P$), you pretend the world is locally linear and use $F_k$/$H_k$ in the exact same covariance equations as the plain Kalman filter. It's a first-order Taylor approximation, re-computed at every timestep, and it's good enough for a shocking number of real robots.

## The five equations

Everything above compresses into five lines. Predict:

$$\hat{x}_k^- = f(\hat{x}_{k-1}, u_{k-1})$$
$$P_k^- = F_k P_{k-1} F_k^\top + Q$$

Update:

$$K_k = P_k^- H_k^\top \left(H_k P_k^- H_k^\top + R\right)^{-1}$$
$$\hat{x}_k = \hat{x}_k^- + K_k \left(z_k - h(\hat{x}_k^-)\right)$$
$$P_k = (I - K_k H_k) P_k^-$$

$K_k$ is the Kalman gain, and it's doing all the emotional labor here, it's a matrix-valued answer to "how much should I move my estimate toward what the sensor just told me, versus how much should I trust where I already thought I was." When the sensor is noisy relative to the model ($R$ large), $K_k$ shrinks and updates barely nudge the estimate. When the model is uncertain ($P_k^-$ large), $K_k$ grows and the sensor gets to speak louder.

## A minimal example

Say you're estimating a drone's pitch angle from a gyroscope (integrate to predict) and an accelerometer (noisy absolute measurement). Pseudocode for one loop iteration:

```python
def ekf_step(x, P, gyro_rate, accel_angle, dt, Q, R):
    # predict
    x_pred = x + gyro_rate * dt
    F = 1.0  # d(x_pred)/dx, trivially linear here
    P_pred = F * P * F + Q

    # update
    H = 1.0  # d(h)/dx, also linear for this toy sensor model
    y = accel_angle - x_pred          # innovation
    S = H * P_pred * H + R
    K = P_pred * H / S                # Kalman gain

    x_new = x_pred + K * y
    P_new = (1 - K * H) * P_pred

    return x_new, P_new
```

Notice this particular example is secretly linear ($F = H = 1$), which is basically a complementary filter with extra bookkeeping. The "extended" part earns its keep once $f$ or $h$ genuinely curve, quaternion kinematics, range-bearing landmarks, wheel-odometry with $\cos\theta$/$\sin\theta$ terms. That's when the Jacobians stop being trivially $1$ and start being actual matrices you have to derive by hand (or, more realistically, generate symbolically and hope you didn't drop a sign).

## Where it breaks

The linearization is only valid *locally*. If your prediction is badly wrong, or your motion model is highly nonlinear over one timestep, the first-order Taylor expansion stops being a good approximation and the filter can diverge, confidently wrong, which is worse than uncertain. This is the standard segue into unscented Kalman filters (propagate a small set of sigma points through the true nonlinear function instead of linearizing) or particle filters (drop the Gaussian assumption entirely). But for a huge fraction of robotics problems, attitude estimation, SLAM front-ends, sensor fusion on a budget of a few KB of RAM, the EKF's "good enough, cheap, and well understood" tradeoff still wins.
