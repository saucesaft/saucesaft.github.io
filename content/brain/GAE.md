---
title: GAE
date: 2026-03-19
tags:
  - GAE
  - RL
layout: layouts/post.njk
---


 ## Bias vs. Variance

 The $\lambda$ parameter is like a dial to balance bias and variance. This determines how quickly and stably the agent learns.

 *High variance ( $\lambda$ close to 1 )*  makes the GAE behave more like Monte Carlo. This means we use the actualy rewards collected to the end of the trajectory. The estimation from GAE is and unbiased of the enviornment. Gradients can be noisier because they depend on a long list of random actions (specially on early stages).
