---
title: compiter notes
layout: layouts/post.njk
tags:
  - compiler
---


I'm reading the book *crafting a compiler with c* by *Charles N. Fischer*. here are some notes from the book. quotation marks signify a direct text-grab from the book. i hope this notes could later become someting useful for me or someone else. All credit goes to him, im publishing this as notes, no a "direct copy" of the book. Graphs and everything are based on the ones included on the book. Please go buy the book if these notes were useful to you.

<!-- more -->

"A compiler must perform two major tasks: analysis of the source program being compiled and synthesis of a machine-language program that when executed will correctly perform the activities described by that source program." - Fischer

```tikz
\usetikzlibrary{shapes.geometric, arrows}

\tikzstyle{rect} = [rectangle, minimum width=3cm, minimum height=2cm,text centered, draw=black]
\tikzstyle{arrow} = [thick,->,>=stealth]
\tikzstyle{darrow} = [dashed,thick,->,>=stealth]

\begin{document}

\begin{tikzpicture}[]

\node (scanner) [rect] {Scanner};
\node (parser) [rect, xshift=5cm] {Parser};
\node (semantic routines) [rect, xshift=10cm] {Semantic Routines};
\node (optimizer) [rect, xshift=10cm, yshift=-5cm] {Optimizer};
\node (code generator) [rect, xshift=10cm, yshift=-10cm] {Code Generator};

\node (tables) [rect, yshift=-5cm, align=center] {Symbol and \\ Attribute \\ Tables};

\node[text width=3cm] (sex) [yshift=-6.5cm, align=center] { (Used by all phases of the compiler) };

\node[text width=3cm] (target) [xshift=10cm , yshift=-13.5cm, align=center] { Target Machine \\ Code };

\draw [arrow, align=left] (scanner) -- node {Tokens \\} (parser);
\draw [arrow, align=left] (parser) -- node[anchor=south] {Syntactic \\ Structure} (semantic routines);
\draw [arrow, align=left] (semantic routines) -- node[anchor=east] {Intermediate \\ Representation} (optimizer) coordinate[midway] (aux1){};
\draw [arrow] (optimizer) -- (code generator) coordinate[midway] (aux2){};
\draw [arrow] (code generator) -- (target);
\draw [arrow, align=center] (-5cm,0cm) -- node {Source Program \\\\ (Character Stream)} (scanner);
\draw [darrow] (aux1) -- ([xshift=2cm]aux1.south) -- ([xshift=2cm]aux2.south) -- (aux2);

\end{tikzpicture}
\end{document}
```
(Figure 1.3)

*Scanner* - Reads the input and generates tokens
*Parser* - Builds a syntax tree to drive semantic processing
*Semantic Routines* - Check semantics (correct variable types, etc) and generate IR code after.