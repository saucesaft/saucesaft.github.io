---
date: 2026-10-27
draft: false
tags:
  - RL
  - JAX
  - Warp
  - MuJoCo
  - GPU
  - NVIDIA
  - XLA
title: Warp for the jax mind (and a bit of mujoco)
---
Personal notes I took when learning to use NVIDIA's Warp. 

<!-- more -->

| Warp                                                                  | JAX analogue                                                                                                                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `wp.array`                                                            | a GPU array, but mutable.                                                                                                                                                   |
| `arr.requires_grad = True`                                            | gives the array a `.grad` array of the same shape, where gradients accumulate                                                                                               |
| `@wp.kernel` + `wp.launch(k, dim=(B,n), inputs=[...], outputs=[...])` | a hand-written elementwise op; `wp.tid()` returns the thread index (like `vmap` indices)                                                                                    |
| `wp.Tape()`                                                           | a stateful `jax.vjp`. record with `with tape:`, write the output cotangent into `out.grad`, call `tape.backward()`, then read `in.grad`. `tape.zero()` clears every `.grad` |
| `mjw.Model` / `mjw.Data`                                              | structs of `wp.array`'s. Data fields have a leading world dimension: `d.pos (nworld, nq)`, `d.qvel`, `d.ctrl`, `d.qacc_warmstart`                                           |
| `mjw.step(m, d)`                                                      | in place: overwrites `d`                                                                                                                                                    |
| `with wp.ScopedCapture() as cap:`                                     | tracing under `jax.jit`: the launches inside are recorded into `cap.graph` instead of just running                                                                          |
| `wp.capture_launch(cap.graph)`                                        | calling the compiled function                                                                                                                                               |
| `wp.atomic_add(a, i, v)` / `wp.atomic_max(a, i, v)`                   | `a.at[i].add(v)` / `a.at[i].max(v)`, but safe when many threads write the same slot                                                                                         |

`wp.jax_callable(fn, num_outputs=k, graph_mode=...)` turns a Python function into a JAX op:
- `fn`'s arguments need Warp type annotations. Inputs come first and outputs last.
- JAX allocates the outputs, so you pass `output_dims={'name': shape}`
- With `graph_mode=wp.JaxCallableGraphMode.NONE`, the Python body runs on every call, so host-side logic like `.numpy()` and `if` works. With the default `JAX` mode it runs only once, during CUDA graph capture.

### Graph Modes
They control how much of the code actually runs as Python on each call. The closest JAX comparison is eager op-by-op executions versus the JIT.

Taking MJWarp into the context, a step in it is hundreds of small kernels. Launching each one from Python costs CPU time, often more than the kernel itself takes on the GPU. A CUDA graph records a sequence of kernel launches once and then replays the whole sequence with one call. It's roughly the speedup JIT gets over op-by-op dispatch, except nothing is recompiled or fused. The same kernels just run without per-launch Python overhead.


| Mode | What happens on each call                                                                                   | JAX analogy                                      |
| ---- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| NONE | Python function runs every time and launches each kernel on the stream XLA provides.                        | Eager mode: `jax.disable_jit()` or pure callback |
| JAX  | Python runs once, while Warp records the launches into a CUDA graph. XLA replays that graph on later calls. | `jax.jit`                                        |
| WARP | Also captures a graph, but Warp manages and replays it instead of XLA.                                      | `jax.jit` (but different owner)                  |

### Capturing the graph yourself
In theory `JAX` or `WARP` mode is all you need. In practice, with a function that also records a `wp.Tape`, both failed for me: `JAX` mode with `CUDA_ERROR_NOT_SUPPORTED`, `WARP` mode with an illegal memory access on the first call and allocations during capture.

What worked was staying in `NONE` mode and capturing the graph by hand:

```python
_GRAPHS = {}

def run(key, body):
  if key not in _GRAPHS:
    body()                          # warm up: compile kernels, allocate everything
    with wp.ScopedCapture() as cap:
      body()                        # record the launches
    _GRAPHS[key] = cap.graph
  wp.capture_launch(_GRAPHS[key])   # replay the launches with one call
```

`body()` reads and writes a set of staging buffers that are allocated once and never move. Each call copies the JAX inputs into them, replays the graph, and copies the outputs back. `key` is anything that changes the graph, like the batch size. This is the same reason `jit` retraces on a new shape.

The speedup was an order of magnitude over launching every kernel from Python.

### Moving arrays between JAX and Warp
Outside of `jax_callable`, `wp.from_jax(x)` and `wp.to_jax(a)` convert between the two. Neither copies: both sides end up looking at the same GPU memory.

Inside a `jax_callable`, you don't even need those. The arguments already arrive as `wp.array`'s that point into JAX's buffers, and the outputs are buffers JAX allocated for you to write into. So the function body is just Warp code.

The catch is that JAX gives you a different buffer on every call. That's fine for eager launches, but a captured graph has its addresses baked in. So the body has three steps:

```python
def fwd(qpos: wp.array2d(dtype=float), ..., qpos_out: wp.array2d(dtype=float)):
  wp.copy(stage.qpos, qpos)          # JAX buffer => fixed staging buffer
  run('fwd', lambda: body(stage))    # replay the graph on the staging buffers
  wp.copy(qpos_out, stage.qpos_out)  # fixed buffer => JAX's output buffer
```

These copies are tiny next to a physics step, but proceed with caution and take them in consideration.

Two smaller things:
- `float` in a Warp annotation means float32, which matches JAX's default. With `jax_enable_x64` on, the dtypes stop matching.
- The shapes have to match exactly. There's no broadcasting, and there's no `vmap` over the Python function. If the rest of your code works per-env with `(nq,)` arrays, add the batch axis yourself (`qpos[None]`) before the call.

### Rules inside a capture
A captured graph is a fixed list of kernel launches with the memory addresses baked in. It's very close to the rules of tracing:

- **No moving memory.** Every buffer the graph touches has to exist before capture and stay at the same address. Allocating inside the capture breaks it.
- **No host reads.** `.numpy()` or printing a value forces a sync and doesn't get recorded. Same as not being able to `print` a traced value.
- **No Python branching on device values.** The `if` runs once, at capture time, and the branch it took is what gets replayed. Same as `if x > 0` on a tracer.
- **Checks move to the device.** To know whether a counter ever went over a limit, a kernel does `wp.atomic_max` into a small "peak" array, and you read it once at the end. Don't read the counter after every call.

### The Tape is just bookkeeping
`wp.Tape` doesn't trace anything. It only keeps a Python list of which kernels were launched, and `tape.backward()` launches their adjoint kernels in reverse order. Because the list is plain Python and the adjoint launches are ordinary launches, the whole forward + backward can be captured into one graph.

`.grad` arrays **accumulate**: each backward adds into them, the same way cotangents sum when a value is used twice. If you forget `tape.zero()` between calls, you get silently wrong gradients. Nothing errors out.

### Backprop through many steps
To differentiate through a loop of in-place steps without keeping a tape over the whole loop, you can write the reverse pass by hand:

1. Forward: run the steps and save a copy of the state before each one. This is a manual `jax.checkpoint`.
2. Backward, from the last step to the first:
   - restore the saved state
   - record that single step on a fresh tape
   - write the incoming gradient into the output's `.grad`
   - call `tape.backward()`
   - read the input's `.grad`, which becomes the incoming gradient for the step before
3. Zero the gradients between steps, because they accumulate.

That's a reverse `scan` written as a Python loop. Wrap the forward and backward in a `jax.custom_vjp` and the JAX code calling it never knows Warp is underneath.

### Gotchas
- JAX grabs most of the GPU memory when it starts, so Warp runs out of memory. Set `XLA_PYTHON_CLIENT_PREALLOCATE=false` before importing JAX.
- The first call is slow because Warp compiles every kernel the first time it's launched. That's like the first call of a `jit`-ed function, except Warp caches the compiled kernels on disk, so the next run of the script starts fast. With hundreds of kernels in a MuJoCo Warp step, the first run can take minutes. It's also why the warm-up `body()` comes before the capture: compiling inside a capture would break it. (JAX can also save cache to disk but needs to be activated through a flag).

### A bit of MuJoCo
**Fixed sizes, but not dense work.** Like MJX, MJWarp allocates everything up front: `naconmax` contacts and `njmax` constraint rows per batch. The difference is that the kernels read the real counts on the device and skip the empty slots. MJX has to compute over the full fixed shape. This is also why MJWarp is graph-friendly: the number of launches never depends on how many contacts there are.

