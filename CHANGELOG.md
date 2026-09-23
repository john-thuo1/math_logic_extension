# Changelog

## 1.1.0

Temporal logic and formal models, plus the checks that keep them honest.

**Added**

- Temporal operators for LTL, LTLf, past time LTL, CTL and PCTL. Brackets stay optional, and `\Gof`, `\Fof`, `\Uof` and friends insert the bracketed form.
- Next in three forms: `\X` for plain next, `\Xs` for strong next, `\Xw` for weak next.
- Automata and formal models: `\dfa`, `\nfa`, `\enfa`, `\pda`, `\tm`, `\cfg`, `\mealy`, `\moore`, `\buchi`, `\kripke`, `\dtmc`, `\mdp`. Add `def` to any of them for the full definition with a box per part.
- Diagrams: `\graph` for Mermaid, `\graphviz` for DOT, `\ttable3x2` for a transition table.
- Sized templates: `\mat2x3`, `\vec5`, `\cases3`, `\ttable4x3`.
- Target syntax for ASCII output: Generic, LTLf2DFA, Spot LTLf, PyLogics.
- Formula check with five levels: error, target, semantic, style, info.
- Formula inspector in Settings and on the website, showing a formula as a tree.
- Step by step recipes in Settings and on the website, each replayed by the tests.

**Changed**

- Operator names follow the standard vocabulary: until, release, weak until, strong release, previous.
- `\start` and `\last` are finite trace helpers, listed apart from the operators.
- Automata entries show a short label such as DFA or Mealy instead of a clipped tuple.

**Fixed**

- Esc on a suggestion, then Enter, sent the message instead of inserting the rejected suggestion.
- Closing the popup with an arrow key no longer revives it on the next Enter.
- Option and M with nothing selected is left to the page, so a Mac can still type µ.
- `\nroot` filled its boxes in a different order in LaTeX than in Unicode and ASCII.
- Text with two math spans came back mangled from the renderer.
- `\triangle` rendered as symdiff in ASCII mode, and `\uparrow` as nand.
- "A is not a subset of B" converted to a wrong formula.
- Typing in the Settings text boxes wrote to storage on every keystroke.
- The warning bubble could stay on screen after a chat app removed the composer.

## 1.0.0

First release. Backslash shortcuts, smart operators, templates with boxes, plain English conversion with an optional AI key, four output formats, custom shortcuts and paused sites.
