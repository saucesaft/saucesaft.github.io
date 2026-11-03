---
date: 2026-11-01
draft: true
tags:
  - 
---
Gradients, gradients, gradients...

<!-- more -->

Half-steps, purely algebraic definition. Basically, substract two points that are a distance of $h$ apart, centered exactly at $x$
$$
\delta f(x) = f (x + \frac{h}{2}) - f (x - \frac{h}{2})
$$
Numerical approximation can be expressed as: average the slope across a point by looking equally forward and backward:
$$
f'(x) \approx \frac{ f(x+h) - f(x-h) }{ 2h }
$$
The best way to approximate a derivative, but why don't we use them for training neural networks?
### 1. Cost grows with number of inputs
Central FD needs two forward runs pero input dimension, and each pair gives you a number: the derivative along one direction. So bye bye actually useful (big) NN training.

### 2. Accuracy depends on conditions you don't get in training
