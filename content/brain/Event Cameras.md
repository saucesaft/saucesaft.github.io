---
date: 2026-10-06
draft: false
tags:
  - computer-vision
  - robotics
  - event-cameras
---
A camera that doesn't take pictures. Every pixel works on its own and only speaks up when *its* brightness changes.

<!-- more -->

A normal camera samples the whole scene at a fixed rate: every 33 ms you get a full image, whether something moved or not. An event camera throws that idea away. Each pixel watches its own (log) brightness, and the moment it changes by more than a threshold $C$, that pixel fires an **event**:

$$
e_k = (x_k,\ y_k,\ t_k,\ p_k), \qquad \big|\log I(x_k, y_k, t_k) - \log I_{\text{ref}}(x_k, y_k)\big| \geq C
$$

$p_k \in \{+1, -1\}$ is the polarity (got brighter / got darker), $t_k$ has microsecond resolution, and $I_{\text{ref}}$ is the brightness at that pixel's *last* event, so every pixel resets on its own schedule. There is no frame and no shutter, just a stream of tuples coming out of the sensor.

*Why would you want that?*

- **Latency.** An event leaves the sensor microseconds after the change, not at the next frame.
- **No motion blur.** There's no exposure time to smear across.
- **Dynamic range.** Working in log intensity, per pixel, gets you ~120 dB vs ~60 for a normal sensor. Driving out of a tunnel, or a lamp in the frame, is fine.
- **Redundancy is free to skip.** A static background produces nothing.

That last point is also the catch.

*The catch*

The amount of data depends on the *scene*, not on a frame rate. Point it at a still scene from a still camera and you get (almost) nothing. Shake it in front of a textured wall and a 1280×720 sensor will happily give you tens of millions of events per second, in bursts. Your pipeline has to survive both, and the expensive case arrives exactly when the robot is moving the most.

It also only sees *change*. An edge moving along its own direction doesn't change any pixel, so it's invisible, and a scene with no texture is invisible too. And since nobody can look at a stream of tuples, every classic algorithm ([[Lucas-Kanade]], FAST, ORB...) needs the events turned into something image-like first.

*Making images out of events*

The simplest one is an **event frame**: count the events per pixel over a window. Easy, but it throws away the timestamps, which are the best part.

The more useful one is the **Surface of Active Events** (SAE): a 2D array that stores, for every pixel, the timestamp of its most recent event. It's a tiny state you update in place, one write per event. From it you get a **time surface** by letting old timestamps fade out:

$$
T(x, y) = \exp\!\Big(-\frac{t_{\text{now}} - \text{SAE}(x, y)}{\tau}\Big)
$$

1 means "fired just now", 0 means "long ago or never". $\tau$ is how much history you want to see (tens of ms is typical). Usually you keep one SAE per polarity.

Here's a fake event camera built from a video (a bright square sliding right at 1 px/ms), plus the time surface:

```python
import numpy as np

def frames_to_events(frames, times, C=0.2, eps=1e-3):
    """fake an event camera: fire when log intensity moves by C."""
    ref = np.log(frames[0] + eps)        # per-pixel memory of the last event
    events = []
    for img, t in zip(frames[1:], times[1:]):
        diff = np.log(img + eps) - ref
        ys, xs = np.nonzero(np.abs(diff) >= C)
        for y, x in zip(ys, xs):
            events.append((x, y, t, 1 if diff[y, x] > 0 else -1))
            ref[y, x] += diff[y, x]      # only this pixel resets
    return np.array(events, dtype=[('x', 'i4'), ('y', 'i4'), ('t', 'f8'), ('p', 'i1')])

def time_surface(events, shape, t_now, tau=0.03):
    sae = np.full(shape, -np.inf)        # surface of active events
    np.maximum.at(sae, (events['y'], events['x']), events['t'])
    return np.exp(-(t_now - sae) / tau)

H, W, N = 32, 64, 40
times = np.arange(N) * 1e-3
frames = np.full((N, H, W), 0.1)
for i in range(N):
    frames[i, 11:21, 5 + i:15 + i] = 1.0  # square moves 1 px per ms

ev = frames_to_events(frames, times)      # 780 events: 390 ON, 390 OFF
ts = time_surface(ev, (H, W), times[-1])
ts[15, 10:44:3]  # 0.33 0.37 0.41 0.45 0.5 0.55 0.61 0.67 0.74 0.82 0.9 1.0
```

The square is gone, what's left is a **ramp**: a trail that fades the further back the edge passed. Only the moving edges produce events, so that's all the camera knows about.

*The SAE is a motion map*

That ramp is the interesting part. In the SAE, neighbouring pixels on the trail differ by exactly 1 ms, because the edge took 1 ms to move one pixel. So the gradient of the SAE is the inverse of the speed:

$$
\nabla \text{SAE} = \Big(\frac{\partial t}{\partial x}, \frac{\partial t}{\partial y}\Big), \qquad \|\mathbf{v}\| = \frac{1}{\|\nabla \text{SAE}\|}
$$

Fit a small plane to the SAE around a pixel and you have local optical flow, no second image needed. That's the idea behind Benosman et al.'s event-based visual flow.

*Corners*

Corner detectors port over surprisingly directly. FAST looks at a 16-pixel circle around a candidate and asks "is there a long contiguous arc brighter (or darker) than the centre?". The event versions (eFAST, and Arc*) ask the same question on the SAE: "is there a contiguous arc of *recent* timestamps?". Along a straight edge, the recent half of the circle is a half circle, and at a corner it's a shorter or longer arc. And it runs per event, as they arrive.

The thing that surprised me: these detectors need **density**, not resolution. For the circle to mean anything, most of its 16 pixels must have fired recently. A high-resolution sensor spreads the same events over more pixels, so each circle is mostly empty. The fix is to throw resolution away and bin the pixels:

```python
x, y = x >> 2, y >> 2   # 4x4 binning: 1280x720 -> 320x180, 16x the events per pixel
```

Lower resolution, better corners. Every event still lands in the SAE, it just lands in a coarser one.

*Tracking*

Once you have corners and time surfaces, tracking is plain [[Lucas-Kanade]] from one time surface to the next. The question nobody asks with frames is *how often* to do that, since you can make a "frame" out of any window of events.

The tempting answer is to accumulate more events per step: the time surface looks cleaner and you call the tracker fewer times. In my experience it's the wrong answer. LK assumes small motion between the two images, and a time surface also changes its own appearance as it decays, so long steps break both assumptions. Many tiny steps on a sharp, fast-decaying surface tracked much better than fewer, prettier ones. It just costs more compute, which comes back to the catch above.

*Where to read more*

- Gallego et al., *Event-based Vision: A Survey*, TPAMI 2020. [arXiv:1904.08405](https://arxiv.org/abs/1904.08405). The place to start.
- Benosman et al., *Event-Based Visual Flow*, IEEE TNNLS 2014. Plane fitting on the SAE.
- Mueggler et al., *Fast Event-based Corner Detection*, BMVC 2017 (eFAST).
- Alzugaray & Chli, *Asynchronous Corner Detection and Tracking for Event Cameras in Real Time*, RA-L 2018 (Arc*).
