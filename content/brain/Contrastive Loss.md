---
date: 2026-09-28
tags:
  - AI
  - pytorch
  - CLIP
---
Some things i did to make 2 (or more) latent encoders talk to each other.

<!-- more -->

Let's say you have 2 latent encoders, that for some reason you want to them to align. One turns images into vectors, the other turns text into vectors, and you want a photo of a dog and the sentence "a photo of a dog" to land on nearby points in the same space. If you can do that, a lot comes for free: search images with text, classifiy images into categories you never trained on, compare a sentence to thousands of pictures with a single dot product.

The two encoders don't have to be different modalities. They can be the same network looking at two augmented crops of one image [[SimCLR]], or an audio encoder and a text decoder, or a user encoder and an item encoder in an recommender. The question is always the same: **how do you train two encoders so that things that belong together end up togeter?**

First, *why it fails?*

The first thing you'd try: make matching pairs (image, caption) and minimze the distance between their embeddings.

$$
\text{loss} = || f( \text{image} ) - g( \text{text} ) ) || ^ 2
$$

It works really good, so good that it collapses. The easisest way to make every pair close to is to map everything to the same point. The loss goes to zero, and the model's embeddings result useless.

The fix is the whole idea of contrastive learning; you can't only say what should be close, you should also say what needs to be far. A good embedding is one where the right partner is closer than the wrong ones.

*Preparation...*

Take a batch of N matching pairs, Encode all N images and all N captions, normalize every vector to unit length, and compute every image-caption similarity. `NxN` matrix as a result.

The diagonal of this matrix holds the positives (or what pairs are "true"), everything off is a negative. Each caption is a wrong answer for every other image in the batch. Now we have a *clear goal*, make every row and column peak on the diagonal.

*How do we translate this into a loss function?*

We can say this is now a *classification* problem, "which of these N captions belongs to this image?" The standard loss for this is softmax cross-entropy:

$$
\mathcal{L}_i = -\log \frac{\exp(\mathbf{u}_i^\top \mathbf{v}i / \tau)}{\sum{j=1}^{N} \exp(\mathbf{u}_i^\top \mathbf{v}_j / \tau)}
$$

where $u$ are the image embeddings, $v$ are the text embeddings. (both unit vectors, so the dot product is the cosine similarity), and $\tau$ is the temperature. Average it over the rows, do the same over the columns (text => image), and you have the loss used by [[CLIP]].

The numerator wants the true pair to be similar. The denominator wants it to be more similar than everything else. Only the relative order matters, now how big the numbers are, and that's exactly what prevents the collapse I talked about before.

*What does the gradient do?*

The gradient with respect to the image embedding $u_i$ tells the whols story:

$$
\frac{\partial \mathcal{L}_i}{\partial \mathbf{u}i} = \frac{1}{\tau}\Big(\sum_j p{ij},\mathbf{v}_j ;-; \mathbf{v}_i\Big)
$$
with $p{ij}$ being the softmax probabilities it is saying:
- Pull towards its true partner $v_i$
- Push away from a weighted average of all the captions, weighted by how much the model currently confuses them with the right one

When the right answer wins clearly, the gradient goes to zero. The loss is satisfied as soon as the ranking is right.

*Temperature*

$\tau$ decides how big a similarity gap counts as winning. Small $\tau$ punishes small misses hard, too small and training becomes unstable. Large $\tau$ and every negative gets some weight, less discriminative embedding.

You could also make $\tau$ learnable such as in CLIP.

*Why normalize?*

Without it, the model has a cheap way out: make the vectors longer. Longer vectors mean bigger dot products and a sharper softmax, without actually "learning".

*Sample Code*

```python
import torch
import torch.nn.functional as F

def clip_loss(img_emb, text_emb, tau=0.07):
		u = F.normalize(img_emb, dim=-1) # unit vector
		v = F.normalize(text_emb, dim=-1) # unit vector
		logits = u @ v.T / tau # similarity matrix
		target = torch.arange(len(u), device=u.device) # "positives" on diagonal
		return (
				F.cross_entropy(logits, target) + # image => text
				F.cross_entropy(logits.T, target) # text => image
			) / 2
```