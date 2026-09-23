/*
 * MathLogic engine — shared by the Chrome extension and the demo website.
 *
 * Pure logic, no DOM: symbol/template dictionary, suggestion ranking,
 * "smart operator" autocorrect rules, an offline natural-language → notation
 * parser, LaTeX → Unicode/ASCII rendering, and the request builder for the
 * optional AI fallback (any OpenAI-compatible API: Groq, Gemini, OpenRouter…).
 *
 * Loaded as a classic script (content script / service worker) or imported
 * for side effects by the website. Exposes globalThis.MathLogicEngine.
 */
(function (root) {
  'use strict';

  /** Placeholder used inside templates. Tab jumps between them. */
  var PH = '⬚'; // ⬚

  var MODES = { UNICODE: 'UNICODE', LATEX: 'LATEX', ASCII: 'ASCII', AUTO: 'AUTO' };

  // ---------------------------------------------------------------------------
  // Symbols: [trigger, unicode, latex, ascii, category, name, aliases]
  // ---------------------------------------------------------------------------
  var RAW_SYMBOLS = [
    // Logic
    ['forall', '∀', '\\forall', 'forall', 'Logic', 'for all', 'all fa'],
    ['exists', '∃', '\\exists', 'exists', 'Logic', 'there exists', 'ex'],
    ['nexists', '∄', '\\nexists', 'not exists', 'Logic', 'there does not exist', ''],
    ['existsone', '∃!', '\\exists!', 'exists!', 'Logic', 'there exists a unique', 'unique'],
    ['and', '∧', '\\land', '/\\', 'Logic', 'logical and', 'land wedge'],
    ['or', '∨', '\\lor', '\\/', 'Logic', 'logical or', 'lor vee'],
    ['not', '¬', '\\neg', '~', 'Logic', 'negation', 'neg lnot'],
    ['xor', '⊕', '\\oplus', 'xor', 'Logic', 'exclusive or', 'oplus'],
    ['implies', '⇒', '\\implies', '=>', 'Logic', 'implies', 'imp Rightarrow'],
    ['impliedby', '⇐', '\\impliedby', '<=', 'Logic', 'is implied by', 'Leftarrow'],
    ['iff', '⇔', '\\iff', '<=>', 'Logic', 'if and only if', 'Leftrightarrow equiv'],
    ['entails', '⊨', '\\models', '|=', 'Logic', 'models / entails', 'models'],
    ['proves', '⊢', '\\vdash', '|-', 'Logic', 'proves / turnstile', 'vdash turnstile'],
    ['nproves', '⊬', '\\nvdash', '|/-', 'Logic', 'does not prove', 'nvdash'],
    ['top', '⊤', '\\top', 'T', 'Logic', 'true / top', 'true verum'],
    ['bot', '⊥', '\\bot', 'F', 'Logic', 'false / bottom', 'false falsum bottom'],
    ['therefore', '∴', '\\therefore', 'therefore', 'Logic', 'therefore', 'thus'],
    ['because', '∵', '\\because', 'because', 'Logic', 'because', 'since'],
    ['box', '□', '\\Box', '[]', 'Logic', 'necessarily (modal)', 'necessarily nec'],
    ['diamond', '◇', '\\Diamond', '<>', 'Logic', 'possibly (modal)', 'possibly pos'],
    ['nand', '↑', '\\uparrow', 'nand', 'Logic', 'NAND (Sheffer stroke)', 'sheffer'],
    ['nor', '↓', '\\downarrow', 'nor', 'Logic', 'NOR (Peirce arrow)', 'peirce'],
    ['qed', '∎', '\\blacksquare', 'QED', 'Logic', 'end of proof', 'endproof'],

    // Sets
    ['in', '∈', '\\in', 'in', 'Sets', 'element of', 'elem member'],
    ['notin', '∉', '\\notin', 'not in', 'Sets', 'not an element of', 'nin'],
    ['ni', '∋', '\\ni', 'contains', 'Sets', 'contains as member', 'owns'],
    ['subseteq', '⊆', '\\subseteq', 'subseteq', 'Sets', 'subset or equal', 'sube'],
    ['subset', '⊂', '\\subset', 'subset', 'Sets', 'proper subset', 'sub'],
    ['nsubseteq', '⊈', '\\nsubseteq', 'not subseteq', 'Sets', 'not a subset', 'nsub'],
    ['supseteq', '⊇', '\\supseteq', 'supseteq', 'Sets', 'superset or equal', 'supe'],
    ['supset', '⊃', '\\supset', 'supset', 'Sets', 'proper superset', 'sup superset'],
    ['cup', '∪', '\\cup', 'union', 'Sets', 'union', 'union'],
    ['cap', '∩', '\\cap', 'intersect', 'Sets', 'intersection', 'intersect inter'],
    ['bigcup', '⋃', '\\bigcup', 'Union', 'Sets', 'big union', 'Union'],
    ['bigcap', '⋂', '\\bigcap', 'Intersect', 'Sets', 'big intersection', 'Intersect'],
    ['setminus', '∖', '\\setminus', '\\', 'Sets', 'set difference', 'minus diff'],
    ['symdiff', '△', '\\triangle', 'symdiff', 'Sets', 'symmetric difference', 'triangle'],
    ['emptyset', '∅', '\\emptyset', '{}', 'Sets', 'empty set', 'empty null'],
    ['powerset', '𝒫', '\\mathcal{P}', 'P', 'Sets', 'power set', 'pset'],
    ['complement', '∁', '\\complement', "'", 'Sets', 'complement', 'comp'],
    ['aleph', 'ℵ', '\\aleph', 'aleph', 'Sets', 'aleph (cardinality)', ''],
    ['mid', '|', '\\mid', '|', 'Sets', 'such that / divides', 'st divides'],
    ['nmid', '∤', '\\nmid', '!|', 'Sets', 'does not divide', 'ndivides'],
    ['times', '×', '\\times', 'x', 'Operators', 'times / Cartesian product', 'cross cartesian'],

    // Number sets
    ['NN', 'ℕ', '\\mathbb{N}', 'N', 'Numbers', 'natural numbers', 'naturals nat'],
    ['ZZ', 'ℤ', '\\mathbb{Z}', 'Z', 'Numbers', 'integers', 'integers int'],
    ['QQ', 'ℚ', '\\mathbb{Q}', 'Q', 'Numbers', 'rationals', 'rationals'],
    ['RR', 'ℝ', '\\mathbb{R}', 'R', 'Numbers', 'real numbers', 'reals real'],
    ['CC', 'ℂ', '\\mathbb{C}', 'C', 'Numbers', 'complex numbers', 'complex'],
    ['PP', 'ℙ', '\\mathbb{P}', 'P', 'Numbers', 'primes / probability', 'primes prob'],
    ['EE', '𝔼', '\\mathbb{E}', 'E', 'Numbers', 'expectation', 'expect expectation'],

    // Operators
    ['pm', '±', '\\pm', '+/-', 'Operators', 'plus-minus', 'plusminus'],
    ['mp', '∓', '\\mp', '-/+', 'Operators', 'minus-plus', 'minusplus'],
    ['cdot', '·', '\\cdot', '*', 'Operators', 'dot / multiply', 'dot mul'],
    ['div', '÷', '\\div', '/', 'Operators', 'divide', 'divide'],
    ['circ', '∘', '\\circ', 'o', 'Operators', 'compose', 'compose comp'],
    ['otimes', '⊗', '\\otimes', '(x)', 'Operators', 'tensor product', 'tensor'],
    ['sum', '∑', '\\sum', 'sum', 'Operators', 'summation', 'sigma'],
    ['prod', '∏', '\\prod', 'prod', 'Operators', 'product', 'product'],
    ['coprod', '∐', '\\coprod', 'coprod', 'Operators', 'coproduct', ''],
    ['sqrt', '√', '\\sqrt{}', 'sqrt', 'Operators', 'square root', 'root'],
    ['cbrt', '∛', '\\sqrt[3]{}', 'cbrt', 'Operators', 'cube root', ''],
    ['fact', '!', '!', '!', 'Operators', 'factorial', 'factorial'],
    ['lfloor', '⌊', '\\lfloor', 'floor(', 'Operators', 'floor (left)', 'floor'],
    ['rfloor', '⌋', '\\rfloor', ')', 'Operators', 'floor (right)', ''],
    ['lceil', '⌈', '\\lceil', 'ceil(', 'Operators', 'ceiling (left)', 'ceil'],
    ['rceil', '⌉', '\\rceil', ')', 'Operators', 'ceiling (right)', ''],
    ['langle', '⟨', '\\langle', '<', 'Operators', 'left angle bracket', 'lang'],
    ['rangle', '⟩', '\\rangle', '>', 'Operators', 'right angle bracket', 'rang'],
    ['dagger', '†', '\\dagger', '^H', 'Operators', 'conjugate transpose', 'adjoint'],
    ['star', '⋆', '\\star', '*', 'Operators', 'star', ''],
    ['ell', 'ℓ', '\\ell', 'l', 'Operators', 'script l', ''],
    ['hbar', 'ℏ', '\\hbar', 'hbar', 'Operators', 'reduced Planck constant', 'planck'],
    ['prime', '′', "'", "'", 'Operators', 'prime', ''],

    // Calculus
    ['int', '∫', '\\int', 'int', 'Calculus', 'integral', 'integral'],
    ['iint', '∬', '\\iint', 'iint', 'Calculus', 'double integral', ''],
    ['iiint', '∭', '\\iiint', 'iiint', 'Calculus', 'triple integral', ''],
    ['oint', '∮', '\\oint', 'oint', 'Calculus', 'contour integral', 'contour'],
    ['partial', '∂', '\\partial', 'd', 'Calculus', 'partial derivative', 'pd'],
    ['nabla', '∇', '\\nabla', 'grad', 'Calculus', 'nabla / gradient', 'grad del'],
    ['infty', '∞', '\\infty', 'inf', 'Calculus', 'infinity', 'inf infinity oo'],
    ['Delta', 'Δ', '\\Delta', 'Delta', 'Greek', 'capital delta / change', 'change'],
    ['degree', '°', '^\\circ', 'deg', 'Calculus', 'degree', 'deg'],
    ['to', '→', '\\to', '->', 'Arrows', 'to / tends to', 'arrow rightarrow'],

    // Relations
    ['neq', '≠', '\\neq', '!=', 'Relations', 'not equal', 'ne'],
    ['leq', '≤', '\\leq', '<=', 'Relations', 'less or equal', 'le'],
    ['geq', '≥', '\\geq', '>=', 'Relations', 'greater or equal', 'ge'],
    ['ll', '≪', '\\ll', '<<', 'Relations', 'much less than', ''],
    ['gg', '≫', '\\gg', '>>', 'Relations', 'much greater than', ''],
    ['approx', '≈', '\\approx', '~=', 'Relations', 'approximately', 'ap'],
    ['equiv', '≡', '\\equiv', '==', 'Relations', 'equivalent / congruent', 'cong3'],
    ['cong', '≅', '\\cong', '~=', 'Relations', 'isomorphic / congruent', 'iso'],
    ['sim', '∼', '\\sim', '~', 'Relations', 'similar / distributed as', 'tilde'],
    ['simeq', '≃', '\\simeq', '~=', 'Relations', 'asymptotically equal', ''],
    ['propto', '∝', '\\propto', 'prop', 'Relations', 'proportional to', 'prop'],
    ['defeq', '≔', ':=', ':=', 'Relations', 'defined as', 'def coloneq'],
    ['perp', '⊥', '\\perp', '_|_', 'Relations', 'perpendicular / independent', 'orth'],
    ['parallel', '∥', '\\parallel', '||', 'Relations', 'parallel', 'par'],
    ['prec', '≺', '\\prec', '<', 'Relations', 'precedes', ''],
    ['succ', '≻', '\\succ', '>', 'Relations', 'succeeds', ''],
    ['sqsubseteq', '⊑', '\\sqsubseteq', '<=', 'Relations', 'refinement / less informative', 'refines'],
    ['angle', '∠', '\\angle', 'angle', 'Relations', 'angle', ''],
    ['triangle', '△', '\\triangle', 'triangle', 'Relations', 'triangle', ''],

    // Arrows
    ['gets', '←', '\\leftarrow', '<-', 'Arrows', 'left arrow / assignment', 'leftarrow'],
    ['leftrightarrow', '↔', '\\leftrightarrow', '<->', 'Arrows', 'left-right arrow', 'lr biconditional'],
    ['mapsto', '↦', '\\mapsto', '|->', 'Arrows', 'maps to', 'maps'],
    ['longrightarrow', '⟶', '\\longrightarrow', '-->', 'Arrows', 'long arrow', 'lto'],
    ['hookrightarrow', '↪', '\\hookrightarrow', '->', 'Arrows', 'injection', 'inj'],
    ['twoheadrightarrow', '↠', '\\twoheadrightarrow', '->>', 'Arrows', 'surjection', 'surj'],
    ['uparrow', '↑', '\\uparrow', '^', 'Arrows', 'up arrow', 'up'],
    ['downarrow', '↓', '\\downarrow', 'v', 'Arrows', 'down arrow', 'down'],
    ['rightleftharpoons', '⇌', '\\rightleftharpoons', '<=>', 'Arrows', 'equilibrium', 'equilibrium'],

    // Greek lowercase
    ['alpha', 'α', '\\alpha', 'alpha', 'Greek', 'alpha', 'a'],
    ['beta', 'β', '\\beta', 'beta', 'Greek', 'beta', 'b'],
    ['gamma', 'γ', '\\gamma', 'gamma', 'Greek', 'gamma', 'g'],
    ['delta', 'δ', '\\delta', 'delta', 'Greek', 'delta', 'd'],
    ['epsilon', 'ε', '\\varepsilon', 'epsilon', 'Greek', 'epsilon', 'eps e'],
    ['zeta', 'ζ', '\\zeta', 'zeta', 'Greek', 'zeta', 'z'],
    ['eta', 'η', '\\eta', 'eta', 'Greek', 'eta', ''],
    ['theta', 'θ', '\\theta', 'theta', 'Greek', 'theta', 'th'],
    ['iota', 'ι', '\\iota', 'iota', 'Greek', 'iota', ''],
    ['kappa', 'κ', '\\kappa', 'kappa', 'Greek', 'kappa', 'k'],
    ['lambda', 'λ', '\\lambda', 'lambda', 'Greek', 'lambda', 'l lam'],
    ['mu', 'μ', '\\mu', 'mu', 'Greek', 'mu', 'm'],
    ['nu', 'ν', '\\nu', 'nu', 'Greek', 'nu', 'n'],
    ['xi', 'ξ', '\\xi', 'xi', 'Greek', 'xi', ''],
    ['pi', 'π', '\\pi', 'pi', 'Greek', 'pi', 'p'],
    ['rho', 'ρ', '\\rho', 'rho', 'Greek', 'rho', 'r'],
    ['sigma', 'σ', '\\sigma', 'sigma', 'Greek', 'sigma', 's'],
    ['tau', 'τ', '\\tau', 'tau', 'Greek', 'tau', 't'],
    ['upsilon', 'υ', '\\upsilon', 'upsilon', 'Greek', 'upsilon', 'u'],
    ['phi', 'φ', '\\varphi', 'phi', 'Greek', 'phi', 'f'],
    ['chi', 'χ', '\\chi', 'chi', 'Greek', 'chi', 'x'],
    ['psi', 'ψ', '\\psi', 'psi', 'Greek', 'psi', 'y'],
    ['omega', 'ω', '\\omega', 'omega', 'Greek', 'omega', 'w'],
    // Greek uppercase
    ['Gamma', 'Γ', '\\Gamma', 'Gamma', 'Greek', 'capital gamma', 'G'],
    ['Theta', 'Θ', '\\Theta', 'Theta', 'Greek', 'capital theta / big theta', 'Th'],
    ['Lambda', 'Λ', '\\Lambda', 'Lambda', 'Greek', 'capital lambda', 'L'],
    ['Xi', 'Ξ', '\\Xi', 'Xi', 'Greek', 'capital xi', ''],
    ['Pi', 'Π', '\\Pi', 'Pi', 'Greek', 'capital pi', 'P'],
    ['Sigma', 'Σ', '\\Sigma', 'Sigma', 'Greek', 'capital sigma / alphabet', 'S'],
    ['Phi', 'Φ', '\\Phi', 'Phi', 'Greek', 'capital phi', 'F'],
    ['Psi', 'Ψ', '\\Psi', 'Psi', 'Greek', 'capital psi', 'Y'],
    ['Omega', 'Ω', '\\Omega', 'Omega', 'Greek', 'capital omega / big omega', 'W'],

    // CS / automata
    ['Sigmastar', 'Σ*', '\\Sigma^*', 'Sigma*', 'CS', 'all strings over Σ', 'kleene'],
    ['emptystr', 'ε', '\\varepsilon', 'eps', 'CS', 'empty string', 'epsilon'],
    ['bigO', '𝒪', '\\mathcal{O}', 'O', 'CS', 'big O', 'bigo'],
    ['vee', '⋁', '\\bigvee', 'OR', 'CS', 'big OR', 'bigvee'],
    ['wedge', '⋀', '\\bigwedge', 'AND', 'CS', 'big AND', 'bigwedge'],

    // Temporal logic: standalone operators with a fixed arity, composed freely
    // (e.g. G(request ⇒ X(p U q))). Letter forms are the convention in papers.
    // LTL / LTLf
    ['X', 'X', '\\mathbf{X}', 'X', 'Temporal', 'next · unary (LTL)', 'next nxt'],
    ['Xs', 'X', '\\mathbf{X}', 'X', 'Temporal', 'strong next · unary (LTLf)', 'strongnext snext'],
    ['F', 'F', '\\mathbf{F}', 'F', 'Temporal', 'eventually / finally · unary (LTL)', 'eventually finally'],
    ['G', 'G', '\\mathbf{G}', 'G', 'Temporal', 'globally / always · unary (LTL)', 'globally always'],
    ['U', 'U', '\\mathbf{U}', 'U', 'Temporal', 'until (strong: ψ must happen) · binary: φ U ψ', 'until stronguntil'],
    ['R', 'R', '\\mathbf{R}', 'R', 'Temporal', 'release · binary: φ R ψ', 'release weakrelease V'],
    ['W', 'W', '\\mathbf{W}', 'W', 'Temporal', 'weak until · binary: φ W ψ', 'weakuntil'],
    ['M', 'M', '\\mathbf{M}', 'M', 'Temporal', 'strong release · binary: φ M ψ', 'strongrelease'],
    ['Xw', 'X\u0303', '\\tilde{\\mathbf{X}}', 'WX', 'Temporal', 'weak next · unary (LTLf)', 'weaknext wnext'],
    ['last', 'last', '\\mathit{last}', 'last', 'Finite traces', 'last position — helper, support varies by tool', 'end final'],
    ['start', 'start', '\\mathit{start}', 'start', 'Finite traces', 'first position — helper, support varies by tool', 'first initial'],
    ['next', '◯', '\\bigcirc', '()', 'Temporal', 'next, symbol form · unary', 'bigcirc'],
    ['always', '□', '\\Box', '[]', 'Temporal', 'always, symbol form · unary', ''],
    ['eventually', '◇', '\\Diamond', '<>', 'Temporal', 'eventually, symbol form · unary', ''],
    // past-time LTL
    ['Y', 'Y', '\\mathbf{Y}', 'Y', 'Temporal', 'previous · unary (past LTL, also called yesterday)', 'yesterday previous before'],
    ['S', 'S', '\\mathbf{S}', 'S', 'Temporal', 'since · binary: φ S ψ (past LTL)', 'since'],
    ['O', 'O', '\\mathbf{O}', 'O', 'Temporal', 'once · unary (past LTL)', 'once'],
    ['H', 'H', '\\mathbf{H}', 'H', 'Temporal', 'historically · unary (past LTL)', 'historically'],
    // CTL path quantifiers (combine: A G, E F …)
    ['Apath', 'A', '\\mathbf{A}', 'A', 'Temporal', 'for all paths (CTL)', 'allpaths'],
    ['Epath', 'E', '\\mathbf{E}', 'E', 'Temporal', 'there exists a path (CTL)', 'somepath'],
    // PCTL / CSL
    ['Pop', 'P', '\\mathbf{P}', 'P', 'Temporal', 'probability operator (PCTL): P⋈p [φ]', 'pctl'],
    ['steady', 'S', '\\mathbf{S}', 'S', 'Temporal', 'steady-state operator (CSL)', 'csl'],
    ['bowtie', '⋈', '\\bowtie', '~', 'Temporal', 'bound comparison, one of <, ≤, ≥, >', 'join'],

    // Automata & formal models: the standard tuple plus the type of its transition function
    // Automata rows are generated from MACHINE_DEFS below: one definition each.
  ];

  // ---------------------------------------------------------------------------
  // Templates: [trigger, name, unicode, latex, ascii]   (⬚ = placeholder)
  // ---------------------------------------------------------------------------
  var P = PH;
  var RAW_TEMPLATES = [
    ['frac', 'Fraction', '(' + P + ')/(' + P + ')', '\\frac{' + P + '}{' + P + '}', '(' + P + ')/(' + P + ')'],
    ['root', 'Square root', '√(' + P + ')', '\\sqrt{' + P + '}', 'sqrt(' + P + ')'],
    ['nroot', 'n-th root', '(' + P + ')^(1/' + P + ')', '{' + P + '}^{1/' + P + '}', 'root(' + P + ', ' + P + ')'],
    ['pow', 'Power', P + '^(' + P + ')', P + '^{' + P + '}', P + '^(' + P + ')'],
    ['sub', 'Subscript', P + '_(' + P + ')', P + '_{' + P + '}', P + '_' + P],
    ['sumto', 'Summation Σ from..to', '∑_(' + P + '=' + P + ')^(' + P + ') ' + P, '\\sum_{' + P + '=' + P + '}^{' + P + '} ' + P, 'sum_(' + P + '=' + P + ')^(' + P + ') ' + P],
    ['prodto', 'Product Π from..to', '∏_(' + P + '=' + P + ')^(' + P + ') ' + P, '\\prod_{' + P + '=' + P + '}^{' + P + '} ' + P, 'prod_(' + P + '=' + P + ')^(' + P + ') ' + P],
    ['intab', 'Definite integral', '∫_(' + P + ')^(' + P + ') ' + P + ' d' + P, '\\int_{' + P + '}^{' + P + '} ' + P + ' \\, d' + P, 'integral from ' + P + ' to ' + P + ' of ' + P + ' d' + P],
    ['intx', 'Indefinite integral', '∫ ' + P + ' d' + P, '\\int ' + P + ' \\, d' + P, 'integral of ' + P + ' d' + P],
    ['lim', 'Limit', 'lim_(' + P + '→' + P + ') ' + P, '\\lim_{' + P + ' \\to ' + P + '} ' + P, 'lim_(' + P + '->' + P + ') ' + P],
    ['deriv', 'Derivative d/dx', 'd' + P + '/d' + P, '\\frac{d' + P + '}{d' + P + '}', 'd' + P + '/d' + P],
    ['pderiv', 'Partial derivative ∂/∂x', '∂' + P + '/∂' + P, '\\frac{\\partial ' + P + '}{\\partial ' + P + '}', 'd' + P + '/d' + P],
    ['grad', 'Gradient', '∇' + P, '\\nabla ' + P, 'grad(' + P + ')'],
    ['abs', 'Absolute value', '|' + P + '|', '\\left|' + P + '\\right|', 'abs(' + P + ')'],
    ['norm', 'Norm', '‖' + P + '‖', '\\left\\|' + P + '\\right\\|', '||' + P + '||'],
    ['floor', 'Floor', '⌊' + P + '⌋', '\\lfloor ' + P + ' \\rfloor', 'floor(' + P + ')'],
    ['ceil', 'Ceiling', '⌈' + P + '⌉', '\\lceil ' + P + ' \\rceil', 'ceil(' + P + ')'],
    ['inner', 'Inner product', '⟨' + P + ', ' + P + '⟩', '\\langle ' + P + ', ' + P + ' \\rangle', '<' + P + ', ' + P + '>'],
    ['binom', 'Binomial coefficient', 'C(' + P + ', ' + P + ')', '\\binom{' + P + '}{' + P + '}', 'C(' + P + ', ' + P + ')'],
    ['setb', 'Set builder', '{' + P + ' ∈ ' + P + ' | ' + P + '}', '\\{ ' + P + ' \\in ' + P + ' \\mid ' + P + ' \\}', '{' + P + ' in ' + P + ' | ' + P + '}'],
    ['set', 'Set { }', '{' + P + '}', '\\{' + P + '\\}', '{' + P + '}'],
    ['allin', '∀x ∈ S, P(x)', '∀' + P + ' ∈ ' + P + ', ' + P, '\\forall ' + P + ' \\in ' + P + ',\\ ' + P, 'forall ' + P + ' in ' + P + ', ' + P],
    ['exin', '∃x ∈ S : P(x)', '∃' + P + ' ∈ ' + P + ' : ' + P, '\\exists ' + P + ' \\in ' + P + ' : ' + P, 'exists ' + P + ' in ' + P + ' : ' + P],
    ['func', 'Function f: A → B', P + ': ' + P + ' → ' + P, P + '\\colon ' + P + ' \\to ' + P, P + ': ' + P + ' -> ' + P],
    ['prob', 'Conditional probability', 'P(' + P + ' | ' + P + ')', 'P(' + P + ' \\mid ' + P + ')', 'P(' + P + ' | ' + P + ')'],
    ['ev', 'Expected value', '𝔼[' + P + ']', '\\mathbb{E}[' + P + ']', 'E[' + P + ']'],
    ['var', 'Variance', 'Var(' + P + ')', '\\operatorname{Var}(' + P + ')', 'Var(' + P + ')'],
    ['normal', 'Normal distribution', P + ' ∼ 𝒩(' + P + ', ' + P + '²)', P + ' \\sim \\mathcal{N}(' + P + ', ' + P + '^2)', P + ' ~ N(' + P + ', ' + P + '^2)'],
    ['modeq', 'Congruence mod n', P + ' ≡ ' + P + ' (mod ' + P + ')', P + ' \\equiv ' + P + ' \\pmod{' + P + '}', P + ' == ' + P + ' (mod ' + P + ')'],
    ['bigOf', 'Big-O of', '𝒪(' + P + ')', '\\mathcal{O}(' + P + ')', 'O(' + P + ')'],
    ['sumover', 'Summation over any index or set: ∑_(i∈S)', '∑_(' + P + ') ' + P, '\\sum_{' + P + '} ' + P, 'sum_(' + P + ') ' + P],
    ['prodover', 'Product over any index or set: ∏_(i∈S)', '∏_(' + P + ') ' + P, '\\prod_{' + P + '} ' + P, 'prod_(' + P + ') ' + P],
    ['unionover', 'Union over any index or set: ⋃_(i∈I)', '⋃_(' + P + ') ' + P, '\\bigcup_{' + P + '} ' + P, 'Union_(' + P + ') ' + P],
    ['interover', 'Intersection over any index or set: ⋂_(i∈I)', '⋂_(' + P + ') ' + P, '\\bigcap_{' + P + '} ' + P, 'Intersect_(' + P + ') ' + P],
    ['unionto', 'Union i=1..n', '⋃_(' + P + '=' + P + ')^(' + P + ') ' + P, '\\bigcup_{' + P + '=' + P + '}^{' + P + '} ' + P, 'Union_(' + P + '=' + P + ')^(' + P + ') ' + P],
    ['interto', 'Intersection i=1..n', '⋂_(' + P + '=' + P + ')^(' + P + ') ' + P, '\\bigcap_{' + P + '=' + P + '}^{' + P + '} ' + P, 'Intersect_(' + P + '=' + P + ')^(' + P + ') ' + P],
    ['infer', 'Inference rule', P + ' / ' + P, '\\frac{' + P + '}{' + P + '}', P + ' / ' + P],
    ['hoare', 'Hoare triple', '{' + P + '} ' + P + ' {' + P + '}', '\\{' + P + '\\}\\ ' + P + '\\ \\{' + P + '\\}', '{' + P + '} ' + P + ' {' + P + '}'],
    // temporal-logic bounds: one box for the bound, the operators themselves are symbols
    ['Pbound', 'PCTL probability bound, e.g. P≥0.9', 'P' + P, '\\mathbf{P}_{' + P + '}', 'P' + P],
    ['Uleq', 'Bounded until U≤k', 'U≤' + P, '\\mathbf{U}^{\\leq ' + P + '}', 'U<=' + P],
    ['Fleq', 'Bounded eventually F≤k', 'F≤' + P, '\\mathbf{F}^{\\leq ' + P + '}', 'F<=' + P],
    ['Gleq', 'Bounded always G≤k', 'G≤' + P, '\\mathbf{G}^{\\leq ' + P + '}', 'G<=' + P]
  ];

  function buildSymbols() {
    return RAW_SYMBOLS.map(function (r) {
      return {
        kind: 'symbol', trigger: r[0], unicode: r[1], latex: r[2], ascii: r[3],
        category: r[4], name: r[5], aliases: r[6] ? r[6].split(/\s+/) : []
      };
    });
  }
  function buildTemplates() {
    return RAW_TEMPLATES.map(function (r) {
      return { kind: 'template', trigger: r[0], name: r[1], unicode: r[2], latex: r[3], ascii: r[4], category: 'Template', aliases: [] };
    });
  }
  // ---------------------------------------------------------------------------
  // Sized templates: the size is part of the shortcut, because matrices,
  // vectors and piecewise definitions have no fixed size.
  //   \mat2 (2×2)  \mat2x3 (2 rows × 3 columns)  \vec5  \cases3 (3 branches)
  // ---------------------------------------------------------------------------
  var SIZE_MAX = { rows: 10, cols: 10, vec: 20, cases: 10 };
  function repeat(n, f) { var a = []; for (var i = 0; i < n; i++) a.push(f(i)); return a; }

  function sizedTemplate(trigger) {
    var m, t = { kind: 'template', trigger: trigger, category: 'Template', aliases: [], sized: true };
    if ((m = /^mat([1-9]\d?)(?:x([1-9]\d?))?$/.exec(trigger))) {
      var r = +m[1], c = m[2] ? +m[2] : r;
      if (r > SIZE_MAX.rows || c > SIZE_MAX.cols) return null;
      var row = function () { return repeat(c, function () { return P; }); };
      var rowsU = repeat(r, function () { return '[' + row().join(', ') + ']'; });
      t.name = 'Matrix ' + r + '×' + c + ' (any size: \\mat2x3, \\mat4…)';
      t.unicode = t.ascii = '[' + rowsU.join(', ') + ']';
      t.latex = '\\begin{pmatrix} ' + repeat(r, function () { return row().join(' & '); }).join(' \\\\ ') + ' \\end{pmatrix}';
      return t;
    }
    if ((m = /^ttable(?:([1-9]\d?)x([1-9]\d?))?$/.exec(trigger))) {
      var st = m[1] ? +m[1] : 3, sy = m[2] ? +m[2] : 2;
      if (st > SIZE_MAX.rows || sy > SIZE_MAX.cols) return null;
      var head = repeat(sy, function () { return P; });
      var body = repeat(st, function () { return '| ' + [P].concat(repeat(sy, function () { return P; })).join(' | ') + ' |'; });
      t.glyph = '▦';
      t.name = 'Transition table: ' + st + ' states × ' + sy + ' symbols (any size: \\ttable4x3)';
      t.unicode = t.ascii = ['| δ | ' + head.join(' | ') + ' |', '|' + repeat(sy + 1, function () { return '---'; }).join('|') + '|'].concat(body).join('\n');
      t.ascii = t.ascii.replace('| δ |', '| delta |');
      t.latex = '\\begin{array}{c|' + repeat(sy, function () { return 'c'; }).join('') + '} \\delta & ' + head.join(' & ') + ' \\\\ \\hline ' +
        repeat(st, function () { return [P].concat(repeat(sy, function () { return P; })).join(' & '); }).join(' \\\\ ') + ' \\end{array}';
      return t;
    }
    if ((m = /^vec([1-9]\d?)?$/.exec(trigger))) {
      var n = m[1] ? +m[1] : 3;
      if (n < 2 || n > SIZE_MAX.vec) return null;
      var cells = repeat(n, function () { return P; });
      t.name = 'Vector with ' + n + ' entries (any size: \\vec2 … \\vec' + SIZE_MAX.vec + ')';
      t.unicode = t.ascii = '(' + cells.join(', ') + ')';
      t.latex = '\\begin{pmatrix} ' + cells.join(' \\\\ ') + ' \\end{pmatrix}';
      return t;
    }
    if ((m = /^cases([1-9]\d?)?$/.exec(trigger))) {
      var k = m[1] ? +m[1] : 2;
      if (k < 2 || k > SIZE_MAX.cases) return null;
      var condU = repeat(k - 1, function () { return P + ' if ' + P; }).concat([P + ' otherwise']);
      var condL = repeat(k - 1, function () { return P + ' & \\text{if } ' + P; }).concat([P + ' & \\text{otherwise}']);
      t.name = 'Piecewise with ' + k + ' branches (any number: \\cases2 … \\cases' + SIZE_MAX.cases + ')';
      t.unicode = t.ascii = P + ' = { ' + condU.join('; ') + ' }';
      t.latex = P + ' = \\begin{cases} ' + condL.join(' \\\\ ') + ' \\end{cases}';
      return t;
    }
    return null;
  }

  var SYMBOLS = buildSymbols();
  // The default sizes are listed and searchable. Any other size is built on demand
  // any other size is generated on demand from what the user types.
  // Diagram blocks: code the AI can read (and many chat UIs can render) as a picture.
  // The same text in every output format, since it is code, not notation.
  var MERMAID = ['```mermaid', 'stateDiagram-v2', '    direction LR', '    [*] --> ' + P,
    '    ' + P + ' --> ' + P + ': ' + P, '    ' + P + ' --> ' + P + ': ' + P, '    ' + P + ' --> [*]', '```'].join('\n');
  var GRAPHVIZ = ['```dot', 'digraph M {', '  rankdir=LR;', '  node [shape=doublecircle]; ' + P + ';', '  node [shape=circle];',
    '  start [shape=point]; start -> ' + P + ';', '  ' + P + ' -> ' + P + ' [label="' + P + '"];', '  ' + P + ' -> ' + P + ' [label="' + P + '"];', '}', '```'].join('\n');
  var DIAGRAMS = [
    { kind: 'template', trigger: 'graph', glyph: '⇄', name: 'State diagram (Mermaid code block)', category: 'Diagrams', aliases: ['mermaid', 'diagram'], unicode: MERMAID, latex: MERMAID, ascii: MERMAID, multiline: true },
    { kind: 'template', trigger: 'graphviz', glyph: '⇄', name: 'State diagram (Graphviz DOT code block)', category: 'Diagrams', aliases: ['dot'], unicode: GRAPHVIZ, latex: GRAPHVIZ, ascii: GRAPHVIZ, multiline: true }
  ];

  // ---------------------------------------------------------------------------
  // Full definitions of automata / models: the tuple, then "where" with a box
  // for every component the user must supply. Signatures are fixed text.
  // ---------------------------------------------------------------------------
  var C = { // component names in [Unicode, LaTeX, ASCII]
    Q: ['Q', 'Q', 'Q'], Sig: ['Σ', '\\Sigma', 'Sigma'], Gam: ['Γ', '\\Gamma', 'Gamma'], Lam: ['Λ', '\\Lambda', 'Lambda'],
    q0: ['q₀', 'q_0', 'q0'], Z0: ['Z₀', 'Z_0', 'Z0'], F: ['F', 'F', 'F'], V: ['V', 'V', 'V'], R: ['R', 'R', 'R'],
    S: ['S', 'S', 'S'], S0: ['S₀', 'S_0', 'S0'], s0: ['s₀', 's_0', 's0'], AP: ['AP', 'AP', 'AP'], A: ['A', 'A', 'A'],
    qa: ['q_accept', 'q_{\\text{accept}}', 'q_accept'], qr: ['q_reject', 'q_{\\text{reject}}', 'q_reject'], Start: ['S', 'S', 'S']
  };
  var SIG = { // fixed signatures in [Unicode, LaTeX, ASCII]
    dfa: ['δ: Q × Σ → Q', '\\delta\\colon Q \\times \\Sigma \\to Q', 'delta: Q x Sigma -> Q'],
    nfa: ['δ: Q × Σ → 𝒫(Q)', '\\delta\\colon Q \\times \\Sigma \\to \\mathcal{P}(Q)', 'delta: Q x Sigma -> P(Q)'],
    enfa: ['δ: Q × (Σ ∪ {ε}) → 𝒫(Q)', '\\delta\\colon Q \\times (\\Sigma \\cup \\{\\varepsilon\\}) \\to \\mathcal{P}(Q)', 'delta: Q x (Sigma U {eps}) -> P(Q)'],
    pda: ['δ: Q × (Σ ∪ {ε}) × Γ → 𝒫(Q × Γ*)', '\\delta\\colon Q \\times (\\Sigma \\cup \\{\\varepsilon\\}) \\times \\Gamma \\to \\mathcal{P}(Q \\times \\Gamma^*)', 'delta: Q x (Sigma U {eps}) x Gamma -> P(Q x Gamma*)'],
    tm: ['δ: Q × Γ → Q × Γ × {L, R}', '\\delta\\colon Q \\times \\Gamma \\to Q \\times \\Gamma \\times \\{L, R\\}', 'delta: Q x Gamma -> Q x Gamma x {L, R}'],
    mealyD: ['δ: Q × Σ → Q', '\\delta\\colon Q \\times \\Sigma \\to Q', 'delta: Q x Sigma -> Q'],
    mealyL: ['λ: Q × Σ → Λ', '\\lambda\\colon Q \\times \\Sigma \\to \\Lambda', 'lambda: Q x Sigma -> Lambda'],
    mooreL: ['λ: Q → Λ', '\\lambda\\colon Q \\to \\Lambda', 'lambda: Q -> Lambda'],
    kripkeL: ['L: S → 2ᴬᴾ', 'L\\colon S \\to 2^{AP}', 'L: S -> 2^AP'],
    dtmcP: ['P: S × S → [0, 1]', 'P\\colon S \\times S \\to [0, 1]', 'P: S x S -> [0, 1]'],
    mdpP: ['P: S × A × S → [0, 1]', 'P\\colon S \\times A \\times S \\to [0, 1]', 'P: S x A x S -> [0, 1]'],
    mdpR: ['R: S × A → ℝ', 'R\\colon S \\times A \\to \\mathbb{R}', 'R: S x A -> R'],
    cfgR: ['R ⊆ V × (V ∪ Σ)*', 'R \\subseteq V \\times (V \\cup \\Sigma)^*', 'R subseteq V x (V U Sigma)*'],
    kripkeR: ['R ⊆ S × S', 'R \\subseteq S \\times S', 'R subseteq S x S']
  };
  /**
   * One record per machine. \dfa, \dfadef, the popup label and the hints all come
   * from here.
   *   head   the tuple in [Unicode, LaTeX, ASCII]
   *   sigs   SIG keys shown after the tuple in the heading row
   *   parts  boxes of the full definition: ['set'|'elem', C.x] or ['sig', SIG.x]
   */
  var MACHINE_DEFS = [
    { t: 'dfa', label: 'DFA', glyph: 'DFA', name: 'DFA 5-tuple', defName: 'DFA, full definition', aliases: 'deterministic',
      head: ['M = (Q, Σ, δ, q₀, F)', 'M = (Q, \\Sigma, \\delta, q_0, F)', 'M = (Q, Sigma, delta, q0, F)'],
      sigs: ['dfa'], parts: [['set', C.Q], ['set', C.Sig], ['sig', SIG.dfa], ['elem', C.q0], ['set', C.F]],
      next: 'then add δ with \\ttable (e.g. \\ttable3x2) or \\graph' },
    { t: 'nfa', label: 'NFA', glyph: 'NFA', name: 'NFA 5-tuple', defName: 'NFA, full definition', aliases: 'nondeterministic',
      head: ['M = (Q, Σ, δ, q₀, F)', 'M = (Q, \\Sigma, \\delta, q_0, F)', 'M = (Q, Sigma, delta, q0, F)'],
      sigs: ['nfa'], parts: [['set', C.Q], ['set', C.Sig], ['sig', SIG.nfa], ['elem', C.q0], ['set', C.F]],
      next: 'then add δ with \\ttable or \\graph (a cell may list several states)' },
    { t: 'enfa', label: 'ε-NFA', glyph: 'εNFA', name: 'ε-NFA 5-tuple', defName: 'ε-NFA, full definition', aliases: 'epsilon',
      head: ['M = (Q, Σ, δ, q₀, F)', 'M = (Q, \\Sigma, \\delta, q_0, F)', 'M = (Q, Sigma, delta, q0, F)'],
      sigs: ['enfa'], parts: [['set', C.Q], ['set', C.Sig], ['sig', SIG.enfa], ['elem', C.q0], ['set', C.F]],
      next: 'then add δ with \\ttable or \\graph (include an ε column)' },
    { t: 'pda', label: 'PDA', glyph: 'PDA', name: 'pushdown automaton 7-tuple', defName: 'Pushdown automaton, full definition', aliases: 'pushdown',
      head: ['M = (Q, Σ, Γ, δ, q₀, Z₀, F)', 'M = (Q, \\Sigma, \\Gamma, \\delta, q_0, Z_0, F)', 'M = (Q, Sigma, Gamma, delta, q0, Z0, F)'],
      sigs: ['pda'], parts: [['set', C.Q], ['set', C.Sig], ['set', C.Gam], ['sig', SIG.pda], ['elem', C.q0], ['elem', C.Z0], ['set', C.F]],
      next: 'then list δ as rules, e.g. δ(q0, a, Z0) = {(q0, AZ0)}' },
    { t: 'tm', label: 'Turing machine', glyph: 'TM', name: 'Turing machine 7-tuple (Sipser)', defName: 'Turing machine, full definition', aliases: 'turing',
      head: ['M = (Q, Σ, Γ, δ, q₀, q_accept, q_reject)', 'M = (Q, \\Sigma, \\Gamma, \\delta, q_0, q_{\\text{accept}}, q_{\\text{reject}})', 'M = (Q, Sigma, Gamma, delta, q0, q_accept, q_reject)'],
      sigs: ['tm'], parts: [['set', C.Q], ['set', C.Sig], ['set', C.Gam], ['sig', SIG.tm], ['elem', C.q0], ['elem', C.qa], ['elem', C.qr]],
      next: 'then add δ with \\ttable (cells like q1, X, R)' },
    { t: 'cfg', label: 'grammar', glyph: 'CFG', name: 'context-free grammar 4-tuple', defName: 'Context-free grammar, full definition', aliases: 'grammar',
      head: ['G = (V, Σ, R, S)', 'G = (V, \\Sigma, R, S)', 'G = (V, Sigma, R, S)'],
      sigs: ['cfgR'], parts: [['set', C.V], ['set', C.Sig], ['set', C.R], ['elem', C.Start]],
      next: 'write the rules in R, e.g. S → aSb | ε' },
    { t: 'mealy', label: 'Mealy machine', glyph: 'Mealy', name: 'Mealy machine 6-tuple', defName: 'Mealy machine, full definition', aliases: 'transducer',
      head: ['M = (Q, Σ, Λ, δ, λ, q₀)', 'M = (Q, \\Sigma, \\Lambda, \\delta, \\lambda, q_0)', 'M = (Q, Sigma, Lambda, delta, lambda, q0)'],
      sigs: ['mealyD', 'mealyL'], parts: [['set', C.Q], ['set', C.Sig], ['set', C.Lam], ['sig', SIG.mealyD], ['sig', SIG.mealyL], ['elem', C.q0]],
      next: 'then add δ and λ with \\ttable (cells like q1 / 0)' },
    { t: 'moore', label: 'Moore machine', glyph: 'Moore', name: 'Moore machine 6-tuple', defName: 'Moore machine, full definition', aliases: '',
      head: ['M = (Q, Σ, Λ, δ, λ, q₀)', 'M = (Q, \\Sigma, \\Lambda, \\delta, \\lambda, q_0)', 'M = (Q, Sigma, Lambda, delta, lambda, q0)'],
      sigs: ['mealyD', 'mooreL'], parts: [['set', C.Q], ['set', C.Sig], ['set', C.Lam], ['sig', SIG.mealyD], ['sig', SIG.mooreL], ['elem', C.q0]],
      next: 'then add δ with \\ttable and list λ per state' },
    { t: 'buchi', label: 'Büchi automaton', glyph: 'NBA', name: 'Büchi automaton (accepts runs visiting F infinitely often)', defName: 'Büchi automaton, full definition', aliases: 'omega',
      head: ['A = (Q, Σ, δ, q₀, F)', 'A = (Q, \\Sigma, \\delta, q_0, F)', 'A = (Q, Sigma, delta, q0, F)'],
      sigs: ['nfa'], parts: [['set', C.Q], ['set', C.Sig], ['sig', SIG.nfa], ['elem', C.q0], ['set', C.F]],
      next: 'then add δ with \\ttable or \\graph' },
    { t: 'kripke', label: 'Kripke structure', glyph: 'KS', name: 'Kripke structure', defName: 'Kripke structure, full definition', aliases: 'model',
      head: ['K = (S, S₀, R, L)', 'K = (S, S_0, R, L)', 'K = (S, S0, R, L)'],
      sigs: ['kripkeR', 'kripkeL'], parts: [['set', C.S], ['set', C.S0], ['set', C.R], ['set', C.AP], ['sig', SIG.kripkeL]],
      next: 'list R as pairs, e.g. (s0, s1), then give L per state' },
    { t: 'dtmc', label: 'Markov chain', glyph: 'DTMC', name: 'discrete-time Markov chain', defName: 'Markov chain (DTMC), full definition', aliases: 'markov',
      head: ['D = (S, s₀, P, L)', 'D = (S, s_0, P, L)', 'D = (S, s0, P, L)'],
      sigs: ['dtmcP', 'kripkeL'], parts: [['set', C.S], ['elem', C.s0], ['sig', SIG.dtmcP], ['set', C.AP], ['sig', SIG.kripkeL]],
      next: 'then give P as a matrix with \\mat3 (each row sums to 1)' },
    { t: 'mdp', label: 'MDP', glyph: 'MDP', name: 'Markov decision process', defName: 'Markov decision process, full definition', aliases: 'decision',
      head: ['M = (S, A, P, R)', 'M = (S, A, P, R)', 'M = (S, A, P, R)'],
      sigs: ['mdpP', 'mdpR'], parts: [['set', C.S], ['set', C.A], ['sig', SIG.mdpP], ['sig', SIG.mdpR]],
      next: 'then describe P and R in a table or in words' }
  ];

  var SEP = [', ', ',\\ ', ', ']; // between the tuple and its signatures, per mode
  /** \dfa and friends: the tuple plus the type of its transition function. */
  function machineSymbol(m) {
    function line(i) { return m.head[i] + m.sigs.map(function (k) { return SEP[i] + SIG[k][i]; }).join(''); }
    return { kind: 'symbol', trigger: m.t, unicode: line(0), latex: line(1), ascii: line(2),
      category: 'Automata', name: m.name, aliases: m.aliases ? m.aliases.split(/\s+/) : [], glyph: m.glyph };
  }
  var DEFS = MACHINE_DEFS.map(function (m) { return [m.t + 'def', m.defName, m.head, m.parts, m.glyph]; });
  SYMBOLS.push.apply(SYMBOLS, MACHINE_DEFS.map(machineSymbol)); // \dfa … \mdp

  function defTemplate(d) {
    function part(p, i) {
      if (p[0] === 'sig') return p[1][i];
      var box = p[0] === 'set' ? (i === 1 ? '\\{' + P + '\\}' : '{' + P + '}') : P;
      return p[1][i] + ' = ' + box;
    }
    function build(i, where, sep) { return d[2][i] + where + d[3].map(function (p) { return part(p, i); }).join(sep); }
    return {
      kind: 'template', trigger: d[0], name: d[1], category: 'Automata', aliases: [], glyph: d[4],
      unicode: build(0, ' where ', ', '), latex: build(1, ' \\text{ where } ', ',\\ '), ascii: build(2, ' where ', ', ')
    };
  }
  // ---------------------------------------------------------------------------
  // Bracketed forms, for when the argument is a compound formula. The plain
  // operators stay standalone because "G p" and "G F p" are valid notation.
  // ---------------------------------------------------------------------------
  // Only the trigger and the spoken word live here. Spellings come from the
  // operator's own row, so the two cannot disagree.
  var PAREN_UNARY = [['G', 'always'], ['F', 'eventually'], ['X', 'next'], ['Xs', 'strong next'], ['Xw', 'weak next'],
    ['Y', 'previous'], ['O', 'once'], ['H', 'historically']].map(withSpellings);
  var PAREN_BINARY = [['U', 'until'], ['R', 'release'], ['W', 'weak until'], ['M', 'strong release'], ['S', 'since']].map(withSpellings);
  function withSpellings(o) {
    var sym = symbolFor(o[0]);
    return [o[0], sym.unicode, sym.latex, o[1], sym.ascii];
  }
  function symbolFor(trigger) {
    for (var i = 0; i < SYMBOLS.length; i++) if (SYMBOLS[i].trigger === trigger) return SYMBOLS[i];
    return null;
  }
  var PAREN_TEMPLATES = PAREN_UNARY.map(function (o) {
    return { kind: 'template', trigger: o[0] + 'of', category: 'Temporal', aliases: [o[3].replace(/\s+/g, ''), o[0] + 'paren'],
      glyph: o[1] + '( )', name: o[1] + '(…) — ' + o[3] + ', brackets around a compound argument',
      unicode: o[1] + '(' + P + ')', latex: o[2] + '(' + P + ')', ascii: o[4] + '(' + P + ')' };
  }).concat(PAREN_BINARY.map(function (o) {
    return { kind: 'template', trigger: o[0] + 'of', category: 'Temporal', aliases: [o[3].replace(/\s+/g, ''), o[0] + 'paren'],
      glyph: '( ' + o[1] + ' )', name: '(… ' + o[1] + ' …) — ' + o[3] + ', bracketed',
      unicode: '(' + P + ' ' + o[1] + ' ' + P + ')', latex: '(' + P + ' ' + o[2] + ' ' + P + ')', ascii: '(' + P + ' ' + o[4] + ' ' + P + ')' };
  }));

  var DEF_TEMPLATES = DEFS.map(defTemplate);

  var TEMPLATES = buildTemplates().concat(['mat2', 'mat3', 'vec', 'cases', 'ttable'].map(sizedTemplate), DIAGRAMS, PAREN_TEMPLATES, DEF_TEMPLATES);
  TEMPLATES.forEach(function (t) { if (t.unicode.indexOf('\n') >= 0) t.multiline = true; });

  // ---------------------------------------------------------------------------
  // How-to hints, shown in the suggestion popup and the cheat sheet.
  // ---------------------------------------------------------------------------
  var HINTS = {
    // temporal logic
    X: 'X φ: φ holds at the next step.', F: 'F φ: φ holds at some future step.', G: 'G φ: φ holds at every step from now on.',
    U: 'φ U ψ: φ holds until ψ does, and ψ does happen.', R: 'φ R ψ: ψ holds up to and including the step where φ first holds (or forever).',
    W: 'φ W ψ: like U, but ψ need never happen.', M: 'φ M ψ: like R, but φ must eventually hold.',
    Xw: 'X̃ φ: if there is a next step, φ holds there (LTLf).', last: 'True only at the final step of a finite trace (LTLf).',
    next: '◯φ: same as X φ.', always: '□φ: same as G φ.', eventually: '◇φ: same as F φ.',
    Y: 'Y φ: φ held at the previous step.', S: 'φ S ψ: ψ held at some past step and φ has held since.', O: 'O φ: φ held at some past step.', H: 'H φ: φ held at every past step.',
    Apath: 'A φ: φ holds on every path, e.g. A G safe.', Epath: 'E φ: φ holds on some path, e.g. E F goal.',
    Pop: 'P⋈p [φ]: the probability of φ compared with p. For a bound use \\Pbound, e.g. P≥0.9 [F goal].',
    steady: 'S⋈p [φ]: long-run probability of being in states satisfying φ (CSL).', bowtie: 'Stands for any of <, ≤, ≥, > in a probability bound.',
    Pbound: 'Type the bound in the box, e.g. >=0.9 gives P≥0.9, then write [ φ ].',
    Uleq: 'Type the step bound, e.g. 10: φ U≤10 ψ.', Fleq: 'Type the step bound, e.g. 5: F≤5 goal.', Gleq: 'Type the step bound, e.g. 5: G≤5 safe.',
    // sized, big operators, diagrams
    mat2: 'Put the size in the name: \\mat2x3 is 2 rows × 3 columns. Tab moves through the entries row by row.',
    vec: 'Put the length in the name: \\vec5 has 5 entries.',
    cases: 'Put the number of branches in the name: \\cases3. Boxes: the function, then value/condition pairs, then the “otherwise” value.',
    ttable: 'First row: the input symbols. Then one row per state: the state, then where each symbol takes it. Size in the name: \\ttable4x3.',
    graph: 'Boxes: start state, two transitions “from --> to: symbol”, an accepting state. Copy a line to add more transitions.',
    graphviz: 'Boxes: accepting state, start state, then transitions “from -> to” with their labels.',
    sumover: 'First box: the index or set, e.g. i ∈ S. Second box: the term.',
    prodover: 'First box: the index or set, e.g. i ∈ S. Second box: the term.',
    unionover: 'First box: the index or set, e.g. i ∈ I. Second box: the set.',
    interover: 'First box: the index or set, e.g. i ∈ I. Second box: the set.',
    sumto: 'Boxes: index, start, end, term. For a sum over a set use \\sumover.',
    frac: 'Boxes: numerator, then denominator.', lim: 'Boxes: variable, value it approaches, expression.',
    intab: 'Boxes: lower bound, upper bound, integrand, variable.', setb: 'Boxes: variable, the set it ranges over, the condition.'
  };
  HINTS.mat3 = HINTS.mat2; // same rule, one sentence
  MACHINE_DEFS.forEach(function (m) {
    HINTS[m.t] = 'Heading only, for when you’ll describe the ' + m.label + ' in your own words. For the full definition with boxes use \\' + m.t + 'def.';
    var ex = m.t === 'cfg' ? 'e.g. S, A' : /^(kripke|dtmc|mdp)$/.test(m.t) ? 'e.g. s0, s1' : 'e.g. q0, q1';
    HINTS[m.t + 'def'] = 'Fill each box with Tab, listing elements with commas (' + ex + '); ' + m.next + '; then ask your question.';
  });
  PAREN_TEMPLATES.forEach(function (t) {
    var op = t.trigger.slice(0, -2);
    HINTS[t.trigger] = PAREN_BINARY.some(function (o) { return o[0] === op; })
      ? 'Brackets are optional in LTL: “a ' + op + ' b” is valid too. Use this when either side is a compound formula.'
      : 'Brackets are optional in LTL: “' + op + ' p” and “' + op + ' F p” are valid too. Use this when the argument is a compound formula.';
  });
  HINTS.X = 'X φ: φ holds at the next position. On finite traces say which one you mean: \\Xs (strong next) or \\Xw (weak next) — tools read a bare X differently.';
  HINTS.Xs = 'Strong next: there must be a next position and φ holds there, so it is false at the final position. ASCII: X in LTLf2DFA, X[!] in Spot and PyLogics.';
  HINTS.Xw = 'Weak next: if a next position exists φ holds there, and it is true at the final position. ASCII: WX in LTLf2DFA, plain X in Spot and PyLogics.';
  HINTS.R = 'φ R ψ: ψ holds up to and including the step where φ first holds (or forever). Called weak release when contrasted with \\M; some tools spell the token V.';
  HINTS.W = 'φ W ψ: like U, but ψ need never happen. LTLf2DFA has no W — rewrite it with U there.';
  HINTS.M = 'φ M ψ: like R, but φ must eventually hold. LTLf2DFA has no M — rewrite it with R there.';
  HINTS.U = 'φ U ψ: φ holds until ψ does, and ψ does happen (strong until). For the version where ψ need never happen use \\W.';
  HINTS.Y = 'Y φ: φ held at the previous step (also called yesterday). Past operators need a tool that supports them: PLTLf in LTLf2DFA, not Spot.';
  HINTS.start = 'A finite-trace helper, not an operator: true only at the first position. Whether it exists, and exactly what it means, depends on the tool — LTLf2DFA has it in its past-time (PLTLf) grammar; check your target before using it.';
  HINTS.last = 'A finite-trace helper, not an operator: true only at the final position. Whether it exists, and exactly what it means, depends on the tool — check your target before using it.';
  HINTS.G += ' Brackets are optional (G p, G F p); \\Gof inserts G(⬚).';
  HINTS.F += ' Brackets are optional (F p); \\Fof inserts F(⬚).';
  HINTS.U += ' \\Uof inserts the bracketed form (⬚ U ⬚).';

  /**
   * The small label shown for an entry in the popup and the cheat sheet. `word`
   * marks word labels such as DFA, which are set in sans rather than a maths face.
   */
  function glyphFor(e) {
    if (!e) return { text: '', word: false };
    var word = e.category === 'Automata';
    if (e.glyph) return { text: e.glyph, word: word };
    if (e.kind !== 'template') return { text: e.unicode, word: word };
    var core = e.unicode.replace(new RegExp(PH, 'g'), '').replace(/[\s()[\]{},_^=]/g, '');
    return { text: core ? core.slice(0, 3) : PH, word: word };
  }

  /** One recipe key: a named key to press, or literal text to type. */
  function recipeKey(k) {
    var m = /^\{(Tab|Enter|Space)\}$/.exec(k);
    return m ? { press: m[1] } : { type: k };
  }

  /** Everything a cheat-sheet search should look at for one entry. */
  function searchText(e) {
    return (e.trigger + ' ' + e.name + ' ' + e.unicode + ' ' + e.latex + ' ' + e.ascii + ' ' + e.aliases.join(' ')).toLowerCase();
  }

  function hintFor(e) {
    if (!e) return '';
    if (HINTS[e.trigger]) return HINTS[e.trigger];
    if (/^mat\d/.test(e.trigger)) return HINTS.mat2;
    if (/^vec\d/.test(e.trigger)) return HINTS.vec;
    if (/^cases\d/.test(e.trigger)) return HINTS.cases;
    if (/^ttable\d/.test(e.trigger)) return HINTS.ttable;
    return '';
  }

  // ---------------------------------------------------------------------------
  // Guided recipes, shown in Settings and on the website. Every recipe is
  // replayed by the end-to-end tests, so the documented result is guaranteed.
  // Keys: plain text is typed. {Tab}, {Enter} and {Space} are key presses.
  // ---------------------------------------------------------------------------
  var RECIPES = [
    { id: 'symbols', title: 'Symbols as you type', keys: ['\\forall x \\in \\RR, x^2 >= 0', '{Space}'], result: '∀x ∈ ℝ, x² ≥ 0 ',
      tip: 'Type \\ and a name, then Space, Tab or Enter. Operators like -> <= != ^2 convert on their own.' },
    { id: 'english', title: 'Describe it in plain English', keys: ['/math sum of 1/n^2 from n=1 to infinity', '{Enter}'], result: '∑_(n=1)^∞ 1/n²',
      tip: 'Enter converts; press Enter again to send. Or select any text and press Alt/⌥+M.' },
    { id: 'matrix', title: 'A matrix of any size', keys: ['A = \\mat2x3', '{Space}', '1', '{Tab}', '2', '{Tab}', '3', '{Tab}', '4', '{Tab}', '5', '{Tab}', '6'],
      result: 'A = [[1, 2, 3], [4, 5, 6]]', tip: 'The size goes in the name. Tab jumps to the next ⬚.' },
    { id: 'ltl', title: 'A temporal-logic property', keys: ['\\G(request \\implies \\F response) \\and \\G \\not(a \\and b)'],
      result: 'G(request ⇒ F response) ∧ G ¬(a ∧ b)', tip: 'Operators are standalone symbols: nest them as deep as you like.' },
    { id: 'dfa', title: 'Ask about a DFA', keys: ['\\dfadef', '{Space}', 'q0, q1', '{Tab}', 'a, b', '{Tab}', 'q0', '{Tab}', 'q1'],
      result: 'M = (Q, Σ, δ, q₀, F) where Q = {q0, q1}, Σ = {a, b}, δ: Q × Σ → Q, q₀ = q0, F = {q1}',
      tip: 'Then add the transitions with \\ttable2x2 (or \\graph) and ask, e.g. “What language does M accept?”' },
    { id: 'ttable', title: 'Its transition table', keys: ['\\ttable2x2', '{Space}', 'a', '{Tab}', 'b', '{Tab}', 'q0', '{Tab}', 'q1', '{Tab}', 'q0', '{Tab}', 'q1', '{Tab}', 'q1', '{Tab}', 'q0'],
      result: '| δ | a | b |\n|---|---|---|\n| q0 | q1 | q0 |\n| q1 | q1 | q0 |',
      tip: 'Header row: the symbols. Each next row: a state, then where each symbol takes it.' }
  ];

  /** Parse user-defined snippets: "trigger = output" per line. */
  function parseCustomSnippets(text) {
    var out = [];
    (text || '').split(/\r?\n/).forEach(function (line) {
      var m = /^\s*\\?([A-Za-z][\w*]*)\s*=\s*(.+?)\s*$/.exec(line);
      if (!m) return;
      var body = m[2];
      out.push({
        kind: body.indexOf(PH) >= 0 || body.indexOf('[]') >= 0 ? 'template' : 'symbol',
        trigger: m[1], name: 'Custom: ' + m[1], category: 'Custom', aliases: [],
        unicode: body.replace(/\[\]/g, PH), latex: body.replace(/\[\]/g, PH), ascii: body.replace(/\[\]/g, PH)
      });
    });
    return out;
  }

  function allEntries(custom) {
    return (custom || []).concat(TEMPLATES, SYMBOLS);
  }

  // ---------------------------------------------------------------------------
  // Suggestions
  // ---------------------------------------------------------------------------
  function scoreEntry(e, q, ql) {
    var t = e.trigger, tl = t.toLowerCase();
    if (t === q) return 1000 - (e.kind === 'template' ? 1 : 0) + (e.category === 'Custom' ? 5 : 0);
    if (tl === ql) return 900;
    var tp = e.kind === 'template' ? 0.5 : 0; // on ties, plain symbols first
    if (t.indexOf(q) === 0) return 800 - t.length - tp;
    if (tl.indexOf(ql) === 0) return 700 - t.length - tp;
    for (var i = 0; i < e.aliases.length; i++) {
      if (e.aliases[i] === q) return 650;
      if (e.aliases[i].toLowerCase().indexOf(ql) === 0 && ql.length >= 2) return 600 - e.aliases[i].length;
    }
    if (ql.length >= 3 && e.name && e.name.toLowerCase().indexOf(ql) >= 0) return 400;
    if (ql.length >= 3 && tl.indexOf(ql) > 0) return 300;
    return 0;
  }

  function getSuggestions(query, opts) {
    opts = opts || {};
    if (!query) return [];
    var ql = query.toLowerCase();
    var scored = [];
    var seen = {};
    allEntries(opts.custom).forEach(function (e) {
      var s = scoreEntry(e, query, ql);
      if (s > 0) { scored.push({ e: e, s: s }); seen[e.trigger] = 1; }
    });
    var sized = sizedTemplate(query);
    if (sized && !seen[query]) scored.push({ e: sized, s: 1000 });
    scored.sort(function (a, b) { return b.s - a.s; });
    return scored.slice(0, opts.limit || 8).map(function (x) { return x.e; });
  }

  function findExact(trigger, custom) {
    var list = allEntries(custom);
    for (var i = 0; i < list.length; i++) if (list[i].trigger === trigger) return list[i];
    return sizedTemplate(trigger);
  }

  /** Text to insert for an entry in a given output mode. */
  function renderEntry(e, mode, target) {
    if (mode === MODES.LATEX) return e.latex;
    if (mode === MODES.ASCII) {
      var tok = targetTokens(target);
      if (tok) {
        if (tok[e.trigger]) return tok[e.trigger];                       // X, Xw, and, or, not, implies, iff
        var m = /^([A-Za-z]+)of$/.exec(e.trigger);                        // \Xof, \Xwof…
        if (m && tok[m[1]]) return tok[m[1]] + '(' + PH + ')';
      }
      return e.ascii;
    }
    return e.unicode; // UNICODE and AUTO
  }

  // ---------------------------------------------------------------------------
  // Smart operators (as-you-type autocorrect, Unicode/Auto modes)
  // ---------------------------------------------------------------------------
  var OP_CHARS = '<>=!~+-|';
  // Runs we never touch: markdown rules/tables (---, ===, ||), ++/--, JS strict (in)equality, HTML comments.
  var SKIP_RUN = /^(?:-{2,}|={2,}|\+{2,}|\|{2,}|~{2,})$|===|!==|<!--/;
  // Longest first: the tokeniser takes the first rule that matches at each position.
  var OP_RULES = [
    ['<==>', '⟺'], ['<=>', '⇔'], ['<->', '↔'], ['==>', '⟹'], ['<==', '⟸'], ['-->', '⟶'], ['|->', '↦'],
    ['=>', '⇒'], ['->', '→'], ['<=', '≤'], ['>=', '≥'], ['!=', '≠'],
    ['~=', '≈'], ['+-', '±'], ['-+', '∓']
  ];

  var SUP = { '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '-': '⁻', '−': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', 'a': 'ᵃ', 'b': 'ᵇ', 'c': 'ᶜ', 'd': 'ᵈ', 'e': 'ᵉ', 'f': 'ᶠ', 'g': 'ᵍ', 'h': 'ʰ', 'i': 'ⁱ', 'j': 'ʲ', 'k': 'ᵏ', 'l': 'ˡ', 'm': 'ᵐ', 'n': 'ⁿ', 'o': 'ᵒ', 'p': 'ᵖ', 'r': 'ʳ', 's': 'ˢ', 't': 'ᵗ', 'u': 'ᵘ', 'v': 'ᵛ', 'w': 'ʷ', 'x': 'ˣ', 'y': 'ʸ', 'z': 'ᶻ', 'T': 'ᵀ', 'A': 'ᴬ', 'B': 'ᴮ', 'D': 'ᴰ', 'E': 'ᴱ', 'G': 'ᴳ', 'H': 'ᴴ', 'I': 'ᴵ', 'J': 'ᴶ', 'K': 'ᴷ', 'L': 'ᴸ', 'M': 'ᴹ', 'N': 'ᴺ', 'O': 'ᴼ', 'P': 'ᴾ', 'R': 'ᴿ', 'U': 'ᵁ', 'V': 'ⱽ', 'W': 'ᵂ', '*': '*', ' ': ' ' };
  var SUB = { '0': '₀', '1': '₁', '2': '₂', '3': '₃', '4': '₄', '5': '₅', '6': '₆', '7': '₇', '8': '₈', '9': '₉', '+': '₊', '-': '₋', '−': '₋', '=': '₌', '(': '₍', ')': '₎', 'a': 'ₐ', 'e': 'ₑ', 'h': 'ₕ', 'i': 'ᵢ', 'j': 'ⱼ', 'k': 'ₖ', 'l': 'ₗ', 'm': 'ₘ', 'n': 'ₙ', 'o': 'ₒ', 'p': 'ₚ', 'r': 'ᵣ', 's': 'ₛ', 't': 'ₜ', 'u': 'ᵤ', 'v': 'ᵥ', 'x': 'ₓ', ' ': ' ' };

  function mapChars(s, table) {
    var out = '';
    for (var i = 0; i < s.length; i++) {
      var c = table[s[i]];
      if (c === undefined) return null;
      out += c;
    }
    return out;
  }
  function toSup(s) { return mapChars(s, SUP); }
  function toSub(s) { return mapChars(s, SUB); }

  /**
   * Called just before a non-operator character is typed.
   * @param {string} before text before the caret (current line/block)
   * @param {string} nextChar the character about to be inserted
   * @returns {{remove:number, insert:string}|null}
   */
  function smartOperator(before, nextChar) {
    if (!before) return null;
    var alnum = nextChar !== undefined && /[A-Za-z0-9]/.test(nextChar);

    // 1. ^2 ^-1 ^n ^T → superscripts, x_1 a_n → subscripts.
    //    Fires only once the exponent is finished (next char is not a letter/digit).
    //    A following "." is ambiguous (x^2.5 vs end of sentence): leave it alone.
    if (!alnum && nextChar !== '.' && nextChar !== '^' && nextChar !== '_') {
      var m = /([^\s^_\\])\^(-?\d{1,3}|-?[a-zA-Z])$/.exec(before);
      if (m && !/\\[A-Za-z]+\^[^\^]*$/.test(before)) { // not right after a LaTeX command (\alpha^2)
        var sup = toSup(m[2]);
        if (sup) return { remove: m[2].length + 1, insert: sup };
      }
      // single-letter base only, so snake_case / file_names are never touched
      var s = /(?:^|[^A-Za-z0-9_\\])[A-Za-z]_(\d{1,2}|[aeijkmnptx])$/.exec(before);
      if (s) {
        var sub = toSub(s[1]);
        if (sub) return { remove: s[1].length + 1, insert: sub };
      }
    }

    // 2. A finished run of operator characters → greedy longest-match tokenisation.
    if (nextChar !== undefined && OP_CHARS.indexOf(nextChar) >= 0) return null; // still typing the operator
    var run = /[<>=!~+|\-]+$/.exec(before);
    if (!run) return null;
    var str = run[0];
    if (str.length < 2) return null;
    if (SKIP_RUN.test(str)) return null;
    var out = '', i = 0, changed = false;
    while (i < str.length) {
      var hit = null;
      for (var k = 0; k < OP_RULES.length; k++) {
        if (str.substr(i, OP_RULES[k][0].length) === OP_RULES[k][0]) { hit = OP_RULES[k]; break; }
      }
      if (hit) { out += hit[1]; i += hit[0].length; changed = true; }
      else { out += str[i]; i++; }
    }
    if (!changed) return null;
    return { remove: str.length, insert: out };
  }

  // ---------------------------------------------------------------------------
  // LaTeX → Unicode / ASCII renderer
  // ---------------------------------------------------------------------------
  var BB = { N: 'ℕ', Z: 'ℤ', Q: 'ℚ', R: 'ℝ', C: 'ℂ', P: 'ℙ', E: '𝔼', H: 'ℍ', F: '𝔽', K: '𝕂', '1': '𝟙' };
  var CAL = { P: '𝒫', O: '𝒪', N: '𝒩', L: 'ℒ', F: 'ℱ', A: '𝒜', B: 'ℬ', C: '𝒞', H: 'ℋ', M: 'ℳ', S: '𝒮', T: '𝒯', G: '𝒢', D: '𝒟', E: 'ℰ', I: 'ℐ', R: 'ℛ', X: '𝒳', Y: '𝒴', U: '𝒰', V: '𝒱', W: '𝒲', Z: '𝒵', K: '𝒦', J: '𝒥', Q: '𝒬' };

  var CMD_U = {}, CMD_A = {};
  SYMBOLS.forEach(function (s) {
    var m = /^\\([A-Za-z]+)$/.exec(s.latex);
    if (m && (!CMD_U[m[1]] || s.trigger === m[1])) { CMD_U[m[1]] = s.unicode; CMD_A[m[1]] = s.ascii; }
  });
  var EXTRA = {
    le: ['≤', '<='], ge: ['≥', '>='], ne: ['≠', '!='], lnot: ['¬', '~'], land: ['∧', '/\\'], lor: ['∨', '\\/'],
    wedge: ['∧', '/\\'], vee: ['∨', '\\/'], rightarrow: ['→', '->'], Rightarrow: ['⇒', '=>'], Leftarrow: ['⇐', '<='],
    Leftrightarrow: ['⇔', '<=>'], leftarrow: ['←', '<-'], longmapsto: ['⟼', '|->'], implies: ['⇒', '=>'], iff: ['⇔', '<=>'],
    epsilon: ['ϵ', 'epsilon'], varepsilon: ['ε', 'epsilon'], phi: ['ϕ', 'phi'], varphi: ['φ', 'phi'], vartheta: ['ϑ', 'theta'],
    Delta: ['Δ', 'Delta'], Upsilon: ['Υ', 'Upsilon'], omicron: ['ο', 'o'],
    cdots: ['⋯', '...'], ldots: ['…', '...'], dots: ['…', '...'], vdots: ['⋮', ':'], ddots: ['⋱', '...'],
    times: ['×', 'x'], ast: ['∗', '*'], bullet: ['•', '*'], cdot: ['·', '*'], colon: [':', ':'],
    lvert: ['|', '|'], rvert: ['|', '|'], vert: ['|', '|'], lVert: ['‖', '||'], rVert: ['‖', '||'], Vert: ['‖', '||'],
    mid: ['|', '|'], infty: ['∞', 'inf'], emptyset: ['∅', '{}'], varnothing: ['∅', '{}'],
    circ: ['∘', 'o'], prime: ['′', "'"], Box: ['□', '[]'], Diamond: ['◇', '<>'], square: ['□', '[]'],
    blacksquare: ['∎', 'QED'], checkmark: ['✓', 'ok'], neq: ['≠', '!='], to: ['→', '->'], gets: ['←', '<-'],
    bmod: [' mod ', ' mod '], mod: [' mod ', ' mod '], dagger: ['†', '^H'], ell: ['ℓ', 'l'], hbar: ['ℏ', 'hbar'],
    bigvee: ['⋁', 'OR'], bigwedge: ['⋀', 'AND'], bigoplus: ['⨁', 'XOR'], quad: ['  ', '  '], qquad: ['    ', '    ']
  };
  // EXTRA only covers commands no symbol row defines. The symbol table stays the
  // single source of truth for anything in both.
  Object.keys(EXTRA).forEach(function (k) {
    if (CMD_U[k] === undefined) { CMD_U[k] = EXTRA[k][0]; CMD_A[k] = EXTRA[k][1]; }
  });

  var FUNCS = ['sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'arcsin', 'arccos', 'arctan', 'sinh', 'cosh', 'tanh',
    'log', 'ln', 'lg', 'exp', 'lim', 'liminf', 'limsup', 'max', 'min', 'sup', 'inf', 'det', 'gcd', 'lcm', 'deg', 'dim',
    'ker', 'arg', 'Pr', 'tr', 'rank', 'sgn', 'Var', 'Cov', 'argmax', 'argmin'];
  var NO_SPACE_AFTER = { forall: 1, exists: 1, nexists: 1, neg: 1, lnot: 1, nabla: 1, partial: 1, Box: 1, Diamond: 1, pm: 0 };
  var BIG_OPS = '∑∏∐∫∬∭∮⋃⋂⋁⋀⨁';

  function skipSpaces(s, i) { while (i < s.length && s[i] === ' ') i++; return i; }

  function readGroup(s, i) { // s[i] === '{'
    var depth = 0;
    for (var j = i; j < s.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s[j] === '{') depth++;
      else if (s[j] === '}') { depth--; if (depth === 0) return [s.slice(i + 1, j), j + 1]; }
    }
    return [s.slice(i + 1), s.length];
  }
  function readArg(s, i) {
    i = skipSpaces(s, i);
    if (i >= s.length) return ['', i];
    if (s[i] === '{') return readGroup(s, i);
    if (s[i] === '\\') {
      var m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
      return [m[0], i + m[0].length];
    }
    return [s[i], i + 1];
  }
  function readOptional(s, i) { // [ ... ]
    var j = skipSpaces(s, i);
    if (s[j] !== '[') return [null, i];
    var end = s.indexOf(']', j);
    if (end < 0) return [null, i];
    return [s.slice(j + 1, end), end + 1];
  }

  function isSimple(x) {
    if (/^[\p{L}\p{N}.′!∂∇]+$/u.test(x) || /^[+\-−]?[\p{L}\p{N}.]+$/u.test(x)) return true;
    // one atomic group: (…), f(…), P(…), 𝔼[…] — the whole string must be a single balanced call
    var m = /^([\p{L}\p{N}]*)([(\[])([\s\S]*)([)\]])$/u.exec(x);
    return !!m && ((m[2] === '(') === (m[4] === ')')) && balanced(m[3].replace(/\[/g, '(').replace(/\]/g, ')'));
  }
  function balanced(x) { // parentheses only; [ ] are normalised by the caller
    var d = 0;
    for (var i = 0; i < x.length; i++) { if (x[i] === '(') d++; else if (x[i] === ')') { d--; if (d < 0) return false; } }
    return d === 0;
  }
  function wrap(x) { return isSimple(x) ? x : '(' + x + ')'; }

  function endsWithBigOp(out) {
    var t = out.replace(/\s+$/, '');
    if (!t) return false;
    t = t.replace(/[_^](?:\([^()]*\)|\S)$/, '');
    if (!t) return false;
    if (BIG_OPS.indexOf(t[t.length - 1]) >= 0) return true;
    return /(?:lim|max|min|sup|inf|argmax|argmin|sum|prod|int|Union|Intersect|liminf|limsup)$/.test(t);
  }

  function texRender(s, ascii, ctx) {
    var out = '', i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === '\\') {
        var m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
        if (!m) { out += c; i++; continue; }
        var name = m[1];
        i += m[0].length;
        var a, b, r;
        switch (name) {
          case 'frac': case 'dfrac': case 'tfrac': case 'cfrac':
            r = readArg(s, i); a = texRender(r[0], ascii, ctx); i = r[1];
            r = readArg(s, i); b = texRender(r[0], ascii, ctx); i = r[1];
            if (!isSimple(a) || !isSimple(b)) ctx.lossy = ctx.lossy || (a.length + b.length > 18);
            out += wrap(a) + '/' + wrap(b);
            break;
          case 'sqrt':
            var o = readOptional(s, i); i = o[1];
            r = readArg(s, i); a = texRender(r[0], ascii, ctx); i = r[1];
            if (ascii) out += o[0] ? 'root(' + a + ', ' + o[0] + ')' : 'sqrt(' + a + ')';
            else {
              var pre = !o[0] ? '√' : o[0] === '3' ? '∛' : o[0] === '4' ? '∜' : (toSup(o[0]) || '(' + o[0] + ')') + '√';
              out += pre + wrap(a);
            }
            break;
          case 'binom': case 'dbinom': case 'tbinom':
            r = readArg(s, i); a = texRender(r[0], ascii, ctx); i = r[1];
            r = readArg(s, i); b = texRender(r[0], ascii, ctx); i = r[1];
            out += 'C(' + a + ', ' + b + ')';
            break;
          case 'mathbb': case 'Bbb': case 'mathbbm':
            r = readArg(s, i); i = r[1];
            out += ascii ? r[0] : (BB[r[0]] || r[0]);
            break;
          case 'mathcal': case 'mathscr':
            r = readArg(s, i); i = r[1];
            out += ascii ? r[0] : (CAL[r[0]] || r[0]);
            break;
          case 'text': case 'textrm': case 'textit': case 'textbf': case 'mbox': case 'mathrm': case 'mathit': case 'mathbf':
          case 'mathsf': case 'mathtt': case 'operatorname': case 'boldsymbol': case 'bm': case 'textnormal':
            r = readArg(s, i); i = r[1];
            out += /^(text|mbox)/.test(name) ? r[0] : texRender(r[0], ascii, ctx);
            break;
          case 'left': case 'right': case 'big': case 'Big': case 'bigg': case 'Bigg': case 'bigl': case 'bigr':
          case 'Bigl': case 'Bigr': case 'displaystyle': case 'limits': case 'nolimits':
            if (s[i] === '.') i++;
            break;
          case 'begin':
            r = readArg(s, i); var env = r[0]; i = r[1];
            var endTag = '\\end{' + env + '}';
            var endAt = s.indexOf(endTag, i);
            var body = endAt < 0 ? s.slice(i) : s.slice(i, endAt);
            i = endAt < 0 ? s.length : endAt + endTag.length;
            out += renderEnv(env, body, ascii, ctx);
            break;
          case 'end':
            r = readArg(s, i); i = r[1];
            break;
          case ',': case ';': case ':': case ' ': case '>':
            out += ' '; break;
          case '!': break;
          case '{': out += '{'; break;
          case '}': out += '}'; break;
          case '|': out += ascii ? '||' : '‖'; break;
          case '\\': out += '; '; break;
          case '_': out += '_'; break;
          case '%': case '$': case '&': case '#': out += name; break;
          case 'pmod':
            r = readArg(s, i); i = r[1];
            out += ' (mod ' + texRender(r[0], ascii, ctx) + ')';
            break;
          case 'overline': case 'bar':
            r = readArg(s, i); i = r[1]; a = texRender(r[0], ascii, ctx);
            out += ascii ? 'bar(' + a + ')' : (a.length === 1 ? a + '̅' : 'bar(' + a + ')');
            break;
          case 'hat':
            r = readArg(s, i); i = r[1]; a = texRender(r[0], ascii, ctx);
            out += ascii ? 'hat(' + a + ')' : (a.length === 1 ? a + '̂' : 'hat(' + a + ')');
            break;
          case 'vec':
            r = readArg(s, i); i = r[1]; a = texRender(r[0], ascii, ctx);
            out += ascii ? 'vec(' + a + ')' : (a.length === 1 ? a + '⃗' : 'vec(' + a + ')');
            break;
          case 'dot':
            r = readArg(s, i); i = r[1]; a = texRender(r[0], ascii, ctx);
            out += ascii ? a + "'" : (a.length === 1 ? a + '̇' : a + "'");
            break;
          case 'tilde':
            r = readArg(s, i); i = r[1]; a = texRender(r[0], ascii, ctx);
            out += ascii ? '~' + a : (a.length === 1 ? a + '̃' : '~' + a);
            break;
          case 'not':
            r = readArg(s, i); i = r[1]; a = texRender(r[0], ascii, ctx);
            out += ascii ? '!' + a : (a === '=' ? '≠' : a === '∈' ? '∉' : a === '⊂' ? '⊄' : a === '⊆' ? '⊈' : a + '̸');
            break;
          default:
            if (FUNCS.indexOf(name) >= 0) { out += name; break; }
            var tbl = ascii ? CMD_A : CMD_U;
            if (tbl[name] !== undefined) {
              var sym = tbl[name];
              if (ascii && /^[A-Za-z!]+$/.test(sym) && sym.length > 1) {
                // word-like ascii operators need breathing room: "x in A", "forall x"
                if (out && !/[\s(\[{]$/.test(out)) out += ' ';
                i = skipSpaces(s, i);
                out += sym + (s[i] === '_' || s[i] === '^' ? '' : ' ');
              } else {
                out += sym;
                if (NO_SPACE_AFTER[name]) i = skipSpaces(s, i);
                else if (/^[A-Za-z]/.test(s[i] || '') && s[i - 1] !== ' ') out += ' ';
              }
            } else {
              out += '\\' + name;
              ctx.lossy = true;
            }
        }
      } else if (c === '^' || c === '_') {
        i++;
        var rr = readArg(s, i); i = rr[1];
        var inner = texRender(rr[0], ascii, ctx).trim();
        var big = endsWithBigOp(out);
        if (big) inner = inner.replace(/\s*(→|->)\s*/g, '$1');
        if (ascii || big) {
          out = out.replace(/\s+$/, '');
          out += c + (inner.length === 1 ? inner : '(' + inner + ')');
        } else {
          var mapped = c === '^' ? toSup(inner) : toSub(inner);
          if (inner === '∘' && c === '^') mapped = '°';
          if (inner === '*' && c === '^') mapped = '*';
          if (inner === '′' || inner === "'") mapped = '′';
          if (mapped) out += mapped;
          else {
            out += c + (inner.length === 1 ? inner : '(' + inner + ')');
            if (inner.length > 1) ctx.lossy = true;
          }
        }
      } else if (c === '{') {
        var g = readGroup(s, i); i = g[1];
        out += texRender(g[0], ascii, ctx);
      } else if (c === '}') {
        i++;
      } else if (c === '~') {
        out += ' '; i++;
      } else {
        out += c; i++;
      }
    }
    return out;
  }

  function renderEnv(env, body, ascii, ctx) {
    var rows = body.split(/\\\\/).map(function (r) { return r.trim(); }).filter(Boolean);
    if (/matrix|array/.test(env)) {
      ctx.lossy = true;
      var cells = rows.map(function (r) {
        return '[' + r.split('&').map(function (x) { return texRender(x.trim(), ascii, ctx).trim(); }).join(', ') + ']';
      });
      return rows.length === 1 && env !== 'pmatrix' ? cells[0] : '[' + cells.join(', ') + ']';
    }
    if (/cases/.test(env)) {
      ctx.lossy = true;
      return '{ ' + rows.map(function (r) {
        var parts = r.split('&');
        var val = texRender(parts[0].trim(), ascii, ctx).trim();
        var cond = parts[1] ? texRender(parts[1].trim(), ascii, ctx).trim() : '';
        cond = cond.replace(/^if\s+/, '');
        return cond ? (cond === 'otherwise' ? val + ' otherwise' : val + ' if ' + cond) : val;
      }).join('; ') + ' }';
    }
    // aligned / align / gather etc.
    return rows.map(function (r) { return texRender(r.replace(/&/g, ''), ascii, ctx); }).join('; ');
  }

  function tidy(s) {
    return s
      .replace(/[ \t]+/g, ' ')
      .replace(/\( /g, '(').replace(/ \)/g, ')')
      .replace(/ ,/g, ',')
      .replace(/\s+([²³¹⁰⁴-⁹ⁿᵀ′])/g, '$1')
      .replace(/([∀∃∄]!?)\s+(?=[\p{L}(])/gu, '$1')          // ∀x, ∃!n
      .replace(/‖\s*([^‖]*?)\s*‖/g, '‖$1‖')                  // ‖v‖
      .replace(/([⌊⌈⟨])\s+/g, '$1').replace(/\s+([⌋⌉⟩])/g, '$1')
      .trim();
  }

  function stripMathDelims(s) {
    s = s.trim();
    var m = /^\$\$([^$]*)\$\$$/.exec(s) || /^\$([^$]*)\$$/.exec(s) || /^\\\(((?:[^\\]|\\(?!\)))*)\\\)$/.exec(s) || /^\\\[((?:[^\\]|\\(?!\]))*)\\\]$/.exec(s);
    return m ? m[1].trim() : s;
  }

  /** Render LaTeX into the requested output mode. Returns {text, lossy}. */
  // ---------------------------------------------------------------------------
  // Math delimiters: each chat site renders a different flavour.
  // ---------------------------------------------------------------------------
  var DELIMS = { dollar: ['$', '$'], paren: ['\\(', '\\)'], double: ['$$', '$$'] };
  var SITE_DELIMS = [
    [/(^|\.)(chatgpt\.com|chat\.openai\.com)$/, 'paren'],   // ChatGPT renders \( … \) and \[ … \]
    [/(^|\.)claude\.ai$/, 'double'],                          // Claude renders $$ … $$ reliably
    [/(^|\.)(gemini\.google\.com|aistudio\.google\.com)$/, 'dollar']
  ];
  /** Which delimiter style to use: an explicit preference, or the best one for this site. */
  function delimsFor(hostname, pref) {
    if (pref && pref !== 'auto' && DELIMS[pref]) return pref;
    for (var i = 0; i < SITE_DELIMS.length; i++) if (SITE_DELIMS[i][0].test(hostname || '')) return SITE_DELIMS[i][1];
    return 'dollar';
  }
  function wrapMath(latex, style) {
    var d = DELIMS[style] || DELIMS.dollar;
    return d[0] + stripMathDelims(latex) + d[1];
  }

  function renderLatex(latex, mode, opts) {
    opts = opts || {};
    latex = stripMathDelims(latex);
    var ctx = { lossy: false };
    if (mode === MODES.LATEX) {
      var t = latex.replace(/\s+/g, ' ').trim();
      return { text: opts.wrapLatex ? wrapMath(t, opts.delims) : t, lossy: false };
    }
    var ascii = mode === MODES.ASCII;
    var text = tidy(texRender(latex, ascii, ctx));
    if (mode === MODES.AUTO && ctx.lossy) {
      var l = latex.replace(/\s+/g, ' ').trim();
      return { text: opts.wrapLatex === false ? l : wrapMath(l, opts.delims), lossy: true, format: 'LATEX' };
    }
    return { text: text, lossy: ctx.lossy, format: ascii ? 'ASCII' : 'UNICODE' };
  }

  // ---------------------------------------------------------------------------
  // Offline natural language → LaTeX
  // ---------------------------------------------------------------------------
  var NUMBER_WORDS = { zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10', hundred: '100' };
  var GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'];
  var GREEK_UPPER = { gamma: 'Gamma', delta: 'Delta', theta: 'Theta', lambda: 'Lambda', xi: 'Xi', pi: 'Pi', sigma: 'Sigma', phi: 'Phi', psi: 'Psi', omega: 'Omega', upsilon: 'Upsilon' };

  // Order matters: longer / more specific phrases first.
  var PHRASES = [
    ['if and only if', '\\iff'], ['is equivalent to', '\\iff'], ['iff', '\\iff'],
    ['implies that', '\\implies'], ['implies', '\\implies'], ['entails', '\\models'], ['proves', '\\vdash'],
    ['therefore', '\\therefore'], ['because', '\\because'],
    ['for all', '\\forall'], ['for every', '\\forall'], ['for each', '\\forall'], ['for any', '\\forall'],
    ['there exists a unique', '\\exists!'], ['there exists exactly one', '\\exists!'], ['there is a unique', '\\exists!'],
    ['there does not exist', '\\nexists'], ['there is no', '\\nexists'],
    ['there exists an', '\\exists'], ['there exists a', '\\exists'], ['there exists', '\\exists'], ['there exist', '\\exists'],
    ['there is an', '\\exists'], ['there is a', '\\exists'], ['there is', '\\exists'], ['there are', '\\exists'],
    ['such that', ':'], ['so that', ':'],
    ['is not rational', '\\notin \\mathbb{Q}'], ['is irrational', '\\notin \\mathbb{Q}'], ['is not an integer', '\\notin \\mathbb{Z}'], ['is not real', '\\notin \\mathbb{R}'],
    ['is not a subset of', '\\nsubseteq'], ['is not a superset of', '\\nsupseteq'], ['is not a proper subset of', '\\not\\subset'],
    ['is not a member of', '\\notin'], ['is not equal to', '\\neq'], ['not equal to', '\\neq'], ['does not equal', '\\neq'], ['is not', '\\neq'],
    ['is less than or equal to', '\\leq'], ['less than or equal to', '\\leq'], ['less than or equal', '\\leq'], ['is at most', '\\leq'], ['at most', '\\leq'],
    ['is greater than or equal to', '\\geq'], ['greater than or equal to', '\\geq'], ['greater than or equal', '\\geq'], ['is at least', '\\geq'], ['at least', '\\geq'],
    ['is much less than', '\\ll'], ['much less than', '\\ll'], ['is much greater than', '\\gg'], ['much greater than', '\\gg'],
    ['is less than', '<'], ['less than', '<'], ['is smaller than', '<'], ['is greater than', '>'], ['greater than', '>'], ['is bigger than', '>'], ['is larger than', '>'],
    ['is approximately equal to', '\\approx'], ['approximately equal to', '\\approx'], ['is approximately', '\\approx'], ['approximately', '\\approx'], ['roughly', '\\approx'],
    ['is congruent to', '\\equiv'], ['congruent to', '\\equiv'], ['is identical to', '\\equiv'],
    ['is proportional to', '\\propto'], ['proportional to', '\\propto'], ['is similar to', '\\sim'], ['is distributed as', '\\sim'], ['is isomorphic to', '\\cong'], ['isomorphic to', '\\cong'],
    ['is perpendicular to', '\\perp'], ['perpendicular to', '\\perp'], ['is parallel to', '\\parallel'], ['parallel to', '\\parallel'],
    ['is equal to', '='], ['equal to', '='], ['equals', '='], ['is the same as', '='],
    ['is not an element of', '\\notin'], ['is not a member of', '\\notin'], ['is not in', '\\notin'], ['not an element of', '\\notin'], ['not in', '\\notin'],
    ['is a real number', '\\in \\mathbb{R}'], ['is real', '\\in \\mathbb{R}'], ['is an integer', '\\in \\mathbb{Z}'], ['is a natural number', '\\in \\mathbb{N}'], ['is rational', '\\in \\mathbb{Q}'], ['is a complex number', '\\in \\mathbb{C}'],
    ['are real numbers', '\\in \\mathbb{R}'], ['are real', '\\in \\mathbb{R}'], ['are integers', '\\in \\mathbb{Z}'],
    ['is positive', '> 0'], ['is negative', '< 0'], ['is nonnegative', '\\geq 0'], ['is non-negative', '\\geq 0'], ['is nonzero', '\\neq 0'], ['is non-zero', '\\neq 0'], ['is zero', '= 0'],
    ['is an element of', '\\in'], ['is a member of', '\\in'], ['an element of', '\\in'], ['element of', '\\in'], ['elements of', '\\in'], ['belongs to', '\\in'], ['belong to', '\\in'], ['is in', '\\in'], ['are in', '\\in'], ['in', '\\in'],
    ['is a proper subset of', '\\subset'], ['proper subset of', '\\subset'], ['is a subset of', '\\subseteq'], ['subset of', '\\subseteq'], ['is contained in', '\\subseteq'],
    ['is a superset of', '\\supseteq'], ['superset of', '\\supseteq'], ['contains', '\\ni'],
    ['union', '\\cup'], ['intersected with', '\\cap'], ['intersection', '\\cap'], ['intersect', '\\cap'], ['set minus', '\\setminus'], ['minus the set', '\\setminus'],
    ['the empty set', '\\emptyset'], ['empty set', '\\emptyset'], ['cartesian product', '\\times'], ['cross product', '\\times'], ['cross', '\\times'],
    ['the natural numbers', '\\mathbb{N}'], ['natural numbers', '\\mathbb{N}'], ['naturals', '\\mathbb{N}'],
    ['the integers', '\\mathbb{Z}'], ['integers', '\\mathbb{Z}'], ['the rational numbers', '\\mathbb{Q}'], ['rational numbers', '\\mathbb{Q}'], ['rationals', '\\mathbb{Q}'],
    ['the real numbers', '\\mathbb{R}'], ['real numbers', '\\mathbb{R}'], ['the reals', '\\mathbb{R}'], ['reals', '\\mathbb{R}'],
    ['the complex numbers', '\\mathbb{C}'], ['complex numbers', '\\mathbb{C}'],
    ['plus or minus', '\\pm'], ['plus minus', '\\pm'], ['plus', '+'], ['minus', '-'], ['times', '\\cdot'], ['multiplied by', '\\cdot'],
    ['divided by', '/'], ['modulo', '\\bmod'], ['mod', '\\bmod'], ['composed with', '\\circ'], ['dot product', '\\cdot'],
    ['negative infinity', '-\\infty'], ['minus infinity', '-\\infty'], ['infinity', '\\infty'], ['infty', '\\infty'],
    ['approaches', '\\to'], ['goes to', '\\to'], ['tends to', '\\to'], ['maps to', '\\mapsto'],
    ['gradient of', '\\nabla'], ['does not divide', '\\nmid'], ['divides', '\\mid'], ['degrees', '^{\\circ}'],
    ['logical and', '\\land'], ['and', '\\land'], ['or', '\\lor'], ['not', '\\neg'], ['xor', '\\oplus'],
  ];
  // Longest phrase first, so "is not in" wins over "is not" and "in".
  PHRASES.sort(function (a, b) { return b[0].length - a[0].length; });

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  var PHRASE_RES = PHRASES.map(function (p) {
    return [new RegExp('(?<![\\\\\\w])' + escapeRe(p[0]).replace(/ /g, '\\s+') + '(?![\\w])', 'gi'), p[1]];
  });

  var STOP = '(?=\\s*(?:[,;.?]\\s|[,;.?]?$|\\s(?:equals|is equal to|is|=|and|where|which|for all)\\s))';
  var TOK = '([^\\s,;]+)';
  var END = '(?=\\s*(?:[,;.?](?:\\s|$)|$))';

  function guessVar(body, fallback) {
    var m = /_\{?([a-z])\}?/.exec(body) || /(?:^|[^a-zA-Z\\])([a-z])(?![a-zA-Z])/.exec(body);
    return m ? m[1] : fallback;
  }

  function nlToLatex(input) {
    var s = ' ' + String(input || '').trim().replace(/\s+/g, ' ').replace(/[?]+$/, '').replace(/\.$/, '') + ' ';

    // 0. normalise typed operators / unicode the user might already have used
    s = s.replace(/<=>/g, ' \\iff ').replace(/==>|=>/g, ' \\implies ').replace(/->|→/g, ' \\to ')
      .replace(/<=|≤/g, ' \\leq ').replace(/>=|≥/g, ' \\geq ').replace(/!=|≠/g, ' \\neq ')
      .replace(/\+-|±/g, ' \\pm ').replace(/∞/g, ' \\infty ')
      .replace(/(\w)\s*\*\s*(\w)/g, '$1 \\cdot $2');
    s = s.replace(/\^\(([^()]*)\)/g, '^{$1}').replace(/_\(([^()]*)\)/g, '_{$1}');
    s = s.replace(/\bsqrt\s*\(([^()]*)\)/gi, '\\sqrt{$1}');
    s = s.replace(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|hundred)\b/gi, function (w) { return NUMBER_WORDS[w.toLowerCase()]; });
    s = s.replace(/\b(negative|minus) infinity\b/gi, '-infinity');
    s = s.replace(/\b(to|from|->)\s+(-?)inf\b/gi, '$1 $2infinity'); // "n to inf" (but "inf of S" is an infimum)
    s = s.replace(/\bcapital (alpha|beta|gamma|delta|theta|lambda|xi|pi|sigma|phi|psi|omega|upsilon)\b/gi, function (_, g) { return '\\' + (GREEK_UPPER[g.toLowerCase()] || g); });
    s = s.replace(/\b(sum|product|union|intersection)\s+over\s+/gi, '$1 ');

    // 1. powers, roots and small operators on tokens
    s = s.replace(new RegExp(TOK + '\\s+squared\\b', 'gi'), '$1^{2}');
    s = s.replace(new RegExp(TOK + '\\s+cubed\\b', 'gi'), '$1^{3}');
    s = s.replace(new RegExp(TOK + '\\s+(?:raised\\s+)?to\\s+the\\s+(?:power\\s+of\\s+)?([^\\s,;]+(?:\\s+(?:pi|\\\\pi|x|t|theta))?)(?:\\s+power)?', 'gi'), function (_, b, e) {
      return b + '^{' + e.replace(/(st|nd|rd|th)$/i, '') + '}';
    });
    s = s.replace(new RegExp(TOK + '\\s+raised\\s+to\\s+' + TOK, 'gi'), '$1^{$2}');
    s = s.replace(new RegExp('\\b(?:the\\s+)?square\\s+root\\s+of\\s+' + TOK, 'gi'), '\\sqrt{$1}');
    s = s.replace(new RegExp('\\b(?:the\\s+)?cube\\s+root\\s+of\\s+' + TOK, 'gi'), '\\sqrt[3]{$1}');
    s = s.replace(new RegExp('\\b(?:the\\s+)?(\\w+?)(?:st|nd|rd|th)\\s+root\\s+of\\s+' + TOK, 'gi'), '\\sqrt[$1]{$2}');
    s = s.replace(new RegExp('\\b(?:the\\s+)?absolute\\s+value\\s+of\\s+' + TOK, 'gi'), '\\left|$1\\right|');
    s = s.replace(new RegExp('\\b(?:the\\s+)?norm\\s+of\\s+' + TOK, 'gi'), '\\|$1\\|');
    s = s.replace(new RegExp('\\b(?:the\\s+)?floor\\s+of\\s+' + TOK, 'gi'), '\\lfloor $1 \\rfloor');
    s = s.replace(new RegExp('\\b(?:the\\s+)?ceiling\\s+of\\s+' + TOK, 'gi'), '\\lceil $1 \\rceil');
    s = s.replace(new RegExp('\\b(?:the\\s+)?factorial\\s+of\\s+' + TOK, 'gi'), '$1!');
    s = s.replace(new RegExp(TOK + '\\s+factorial\\b', 'gi'), '$1!');
    s = s.replace(new RegExp(TOK + '\\s+choose\\s+' + TOK, 'gi'), '\\binom{$1}{$2}');
    s = s.replace(new RegExp(TOK + '\\s+sub\\s+' + TOK, 'gi'), '$1_{$2}');
    s = s.replace(new RegExp('\\b(?:the\\s+)?complement\\s+of\\s+' + TOK, 'gi'), '$1^{c}');
    s = s.replace(new RegExp('\\b(?:the\\s+)?power\\s*set\\s+of\\s+' + TOK, 'gi'), '\\mathcal{P}($1)');
    s = s.replace(new RegExp('\\blog\\s+base\\s+' + TOK + '\\s+of\\s+' + TOK, 'gi'), '\\log_{$1} $2');
    s = s.replace(new RegExp('\\b(?:the\\s+)?(?:natural\\s+log(?:arithm)?|ln)\\s+of\\s+' + TOK, 'gi'), '\\ln $1');
    s = s.replace(new RegExp('\\b(?:the\\s+)?log(?:arithm)?\\s+of\\s+' + TOK, 'gi'), '\\log $1');
    s = s.replace(new RegExp('\\b(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|exp)(?:e)?\\s+of\\s+' + TOK, 'gi'), function (_, f, a) {
      return '\\' + f.toLowerCase() + (a[0] === '(' ? a : '(' + a + ')');
    });
    s = s.replace(new RegExp('\\b(?:the\\s+)?expect(?:ed\\s+value|ation)\\s+of\\s+' + TOK, 'gi'), '\\mathbb{E}[$1]');
    s = s.replace(new RegExp('\\b(?:the\\s+)?variance\\s+of\\s+' + TOK, 'gi'), '\\operatorname{Var}($1)');
    s = s.replace(new RegExp('\\b(?:the\\s+)?gcd\\s+of\\s+' + TOK + '\\s+and\\s+' + TOK, 'gi'), '\\gcd($1, $2)');
    s = s.replace(new RegExp('\\b(?:the\\s+)?big\\s*o\\s+of\\s+' + TOK, 'gi'), '\\mathcal{O}($1)');
    // fractions between simple tokens: "1 over n^2", "a divided by b"
    s = replaceOver(s);

    // 2. structures
    // sum/product: "sum from i=1 to n of BODY"
    s = s.replace(new RegExp('\\b(?:the\\s+)?(sum|summation|product|union|intersection)\\s+(?:from\\s+)?([a-z])\\s*(?:=|equals|from)\\s*' + TOK + '\\s+(?:to|through|up\\s+to)\\s+' + TOK + '\\s+of\\s+', 'gi'),
      function (_, op, v, lo, hi) { return bigOp(op) + '_{' + v + '=' + lo + '}^{' + hi + '} '; });
    // "sum of BODY from n=1 to infinity" / "sum of BODY for i from 1 to n"
    s = s.replace(new RegExp('\\b(?:the\\s+)?(sum|summation|product|union|intersection)\\s+of\\s+(.+?)\\s+(?:for\\s+|as\\s+|where\\s+|with\\s+)?(?:(?:from\\s+)?([a-z])\\s*(?:=|equals|goes\\s+from|runs\\s+from|ranging\\s+from|from)\\s*|from\\s+)' + TOK + '\\s+(?:to|through|up\\s+to)\\s+' + TOK, 'gi'),
      function (_, op, body, v, lo, hi) { v = v || guessVar(body, 'i'); return bigOp(op) + '_{' + v + '=' + lo + '}^{' + hi + '} ' + body; });

    // integrals
    s = s.replace(new RegExp('\\b(?:the\\s+)?(?:definite\\s+)?integral\\s+from\\s+' + TOK + '\\s+to\\s+' + TOK + '\\s+of\\s+(.+?)' + STOP, 'gi'),
      function (_, lo, hi, body) { return integral(body, lo, hi); });
    s = s.replace(new RegExp('\\b(?:the\\s+)?(?:definite\\s+)?integral\\s+of\\s+(.+?)\\s+from\\s+' + TOK + '\\s+to\\s+' + TOK + '((?:\\s+(?:with\\s+respect\\s+to|wrt)\\s+[a-z])|(?:\\s+d[a-z]\\b))?', 'gi'),
      function (_, body, lo, hi, wrt) { return integral(body + (wrt || ''), lo, hi); });
    s = s.replace(new RegExp('\\b(?:the\\s+)?(?:indefinite\\s+)?integral\\s+of\\s+(.+?)' + STOP, 'gi'),
      function (_, body) { return integral(body, null, null); });

    // limits
    s = s.replace(new RegExp('\\b(?:the\\s+)?limit\\s+as\\s+([a-z])\\s+(?:approaches|goes\\s+to|tends\\s+to|\\\\to)\\s+' + TOK + '(\\s+from\\s+the\\s+(?:left|right|above|below))?\\s+of\\s+', 'gi'),
      function (_, v, to, side) { return limit(v, to, side); });
    s = s.replace(new RegExp('\\b(?:the\\s+)?limit\\s+of\\s+(.+?)\\s+as\\s+([a-z])\\s+(?:approaches|goes\\s+to|tends\\s+to|\\\\to)\\s+' + TOK + '(\\s+from\\s+the\\s+(?:left|right|above|below))?', 'gi'),
      function (_, body, v, to, side) { return limit(v, to, side) + body; });

    // derivatives
    s = s.replace(new RegExp('\\b(?:the\\s+)?(second\\s+|third\\s+)?(partial\\s+)?derivative\\s+of\\s+(.+?)\\s+(?:with\\s+respect\\s+to|wrt)\\s+([a-z])', 'gi'),
      function (_, ord, partial, body, v) { return derivative(body, v, ord, partial); });
    s = s.replace(new RegExp('\\b(?:the\\s+)?(second\\s+|third\\s+)?(partial\\s+)?derivative\\s+of\\s+(.+?)' + STOP, 'gi'),
      function (_, ord, partial, body) { return derivative(body, guessVar(body.replace(/^[a-z]\(/, '('), 'x'), ord, partial); });

    // set builder
    s = s.replace(new RegExp('\\b(?:the\\s+)?set\\s+of\\s+(?:all\\s+)?([a-z])\\s+(?:in|element\\s+of|from|belonging\\s+to)\\s+(.+?)\\s+(?:such\\s+that|where|with|for\\s+which)\\s+(.+?)' + END, 'gi'),
      '\\{ $1 \\in $2 \\mid $3 \\}');
    s = s.replace(new RegExp('\\b(?:the\\s+)?set\\s+of\\s+(?:all\\s+)?([a-z])\\s+(?:such\\s+that|where|with|for\\s+which)\\s+(.+?)' + END, 'gi'),
      '\\{ $1 \\mid $2 \\}');

    // probability
    s = s.replace(new RegExp('\\b(?:the\\s+)?probability\\s+(?:of\\s+)?(.+?)\\s+given\\s+(.+?)' + STOP, 'gi'), 'P($1 \\mid $2)');
    s = s.replace(new RegExp('(^|\\s)P\\((.+?)\\s+given\\s+(.+?)\\)', 'g'), '$1P($2 \\mid $3)');
    s = s.replace(new RegExp('\\b(?:the\\s+)?probability\\s+(?:of\\s+|that\\s+)(.+?)' + STOP, 'gi'), 'P($1)');

    // functions: "function f from A to B", "f maps A to B"
    s = s.replace(new RegExp('\\b(?:a\\s+|the\\s+)?function\\s+([a-zA-Z])\\s+from\\s+' + TOK + '\\s+(?:to|into|onto)\\s+' + TOK, 'gi'), '$1\\colon $2 \\to $3');
    s = s.replace(new RegExp('(^|\\s)([a-zA-Z])\\s+maps\\s+' + TOK + '\\s+(?:to|into|onto)\\s+' + TOK, 'g'), '$1$2\\colon $3 \\to $4');

    // single-letter functions: "f of x" → f(x)
    s = s.replace(new RegExp('(^|\\s)([A-Za-z])\\s+of\\s+' + TOK, 'g'), function (_, sp, f, a) {
      return sp + f + (a[0] === '(' ? a : '(' + a + ')');
    });
    // if … then …
    s = s.replace(/\bif\s+(.+?),?\s+then\s+(.+)$/i, function (_, a, b) {
      var cx = /\b(and|or|implies|iff)\b/i;
      return (cx.test(a) ? '\\left(' + a + '\\right)' : a) + ' \\implies ' + (cx.test(b) ? '\\left(' + b + '\\right)' : b);
    });

    // 3. word-level phrases
    PHRASE_RES.forEach(function (p) { s = s.replace(p[0], ' ' + p[1] + ' '); });
    GREEK.forEach(function (g) {
      s = s.replace(new RegExp('(?<![\\\\\\w])' + g + '(?![\\w])', 'g'), '\\' + (g === 'epsilon' ? 'varepsilon' : g === 'phi' ? 'varphi' : g));
      var G = GREEK_UPPER[g];
      if (G) s = s.replace(new RegExp('(?<![\\\\\\w])' + G + '(?![\\w])', 'g'), '\\' + G); // "Gamma" → Γ
    });
    s = s.replace(/\bpercent\b/g, '\\%');

    // 4. clean-up
    // "x in R" → ℝ, but only if the phrase isn't naming its own sets (A, B, C…)
    var caps = (String(input).match(/(?:^|[^A-Za-z])([A-Z])(?![A-Za-z])/g) || []).map(function (x) { return x.slice(-1); });
    var ownSets = caps.some(function (c) { return 'RNZQC'.indexOf(c) < 0; });
    if (!ownSets) {
      s = s.replace(/(\\in|\\notin|\\subseteq|\\subset|\\to|\\colon)\s+([RNZQC])(?![\w{])/g, '$1 \\mathbb{$2}');
      s = s.replace(/(^|[\s(])([RNZQC])\^/g, '$1\\mathbb{$2}^');
    }
    s = s.replace(/(?<![\\\w])is\s+(?=[\d(\\\-]|[a-zA-Z](?:\b|\())/g, '= ');       // "... is n(n+1)/2"
    s = s.replace(/(?<![\\\w])(?:the|we have|holds)\s+/gi, '');
    s = s.replace(/(?<![\\\w])then(?!\w)/gi, '');
    s = s.replace(/\s*:\s*/g, ' : ').replace(/\s*,\s*/g, ', ');
    s = s.replace(/(?<![\\\w])(sin|cos|tan|sec|csc|cot|arcsin|arccos|arctan|sinh|cosh|tanh|log|ln|exp|max|min|gcd|det)(?=\s*[(\w])/g, '\\$1');
    s = s.replace(/\s+/g, ' ').trim();
    s = s.replace(/([_^])\{\s*([^{}]*?)\s*\}/g, '$1{$2}');
    s = s.replace(/\\(forall|exists!?|nexists)\s+([a-zA-Z])\b/g, '\\$1 $2');
    s = s.replace(/^[,:\s]+|[,:\s]+$/g, '');
    s = fixPrecedence(s).replace(/\s+/g, ' ').trim();
    return s;
  }

  /**
   * Logical precedence guard. In standard notation ∧/∨ bind tighter than ⇒/⇔,
   * so "p implies q and q implies r" must become (p ⇒ q) ∧ (q ⇒ r), not
   * p ⇒ (q ∧ q) ⇒ r. Wrap any ∧/∨ operand that itself contains ⇒ or ⇔.
   */
  var WEAK_OP = /\\(?:implies|iff|impliedby)(?![A-Za-z])/;
  function splitTop(s, re) { // split on regex matches at paren/brace depth 0
    var parts = [], depth = 0, last = 0, i = 0;
    while (i < s.length) {
      var c = s[i];
      if (c === '\\' && /^\\[{}]/.test(s.slice(i))) { depth += s[i + 1] === '{' ? 1 : -1; i += 2; continue; }
      if (c === '(' || c === '[' || c === '{') depth++;
      else if (c === ')' || c === ']' || c === '}') depth--;
      else if (depth === 0) {
        var m = re.exec(s.slice(i));
        if (m && m.index === 0) { parts.push(s.slice(last, i)); parts.push(m[0]); i += m[0].length; last = i; continue; }
      }
      i++;
    }
    parts.push(s.slice(last));
    return parts; // [operand, sep, operand, sep, ...]
  }
  function hasTopWeak(s) {
    var p = splitTop(s, /^\\(?:implies|iff|impliedby)(?![A-Za-z])/);
    return p.length > 1;
  }
  function fixPrecedence(s) {
    // recurse into \left( … \right) and plain ( … ) groups first
    s = s.replace(/\\left\(((?:[^()]|\([^()]*\))*)\\right\)/g, function (_, inner) { return '\\left(' + fixPrecedence(inner) + '\\right)'; });
    return splitTop(s, /^\s*[,;:]\s*/).map(function (seg, idx) {
      if (idx % 2) return seg; // separator
      var parts = splitTop(seg, /^\s*\\(?:land|lor)(?![A-Za-z])\s*/);
      if (parts.length < 3 || !WEAK_OP.test(seg)) return seg;
      // Only when two or more operands are themselves implications do we read the
      // English as a conjunction of implications. "p and q implies r" keeps the
      // standard reading (p ∧ q) ⇒ r, which precedence already gives.
      var weakCount = parts.filter(function (p, j) { return j % 2 === 0 && hasTopWeak(p.trim()); }).length;
      if (weakCount < 2) return seg;
      return parts.map(function (p, j) {
        if (j % 2) return ' ' + p.trim() + ' ';
        var t = p.trim();
        return hasTopWeak(t) ? '\\left(' + t + '\\right)' : t;
      }).join('');
    }).join('');
  }

  /**
   * "a over b" / "a divided by b" → \frac{a}{b}, where each side is one token or one
   * balanced (…) group, so "P(A and B) over P(B)" keeps its parentheses intact.
   */
  function replaceOver(s) {
    var re = /\s+(?:over|divided\s+by)\s+/i, m, guard = 0;
    while ((m = re.exec(s)) && guard++ < 20) {
      var L = m.index, R = m.index + m[0].length;
      var a = L; // scan numerator leftwards
      if (s[a - 1] === ')') {
        var d = 0;
        while (a > 0) { a--; if (s[a] === ')') d++; else if (s[a] === '(') { d--; if (d === 0) break; } }
        while (a > 0 && /[A-Za-z\\]/.test(s[a - 1])) a--; // function name before "(": P(…), \sin(…)
      } else {
        while (a > 0 && !/[\s,;(]/.test(s[a - 1])) a--;
      }
      var b = R; // scan denominator rightwards
      while (b < s.length && /[A-Za-z0-9\\^_.]/.test(s[b])) b++;
      if (s[b] === '(') {
        var d2 = 0;
        while (b < s.length) { if (s[b] === '(') d2++; else if (s[b] === ')') { d2--; if (d2 === 0) { b++; break; } } b++; }
      }
      var num = s.slice(a, L), den = s.slice(R, b);
      if (!num || !den) break;
      s = s.slice(0, a) + '\\frac{' + num + '}{' + den + '}' + s.slice(b);
    }
    return s;
  }

  function bigOp(op) {
    op = op.toLowerCase();
    return op === 'product' ? '\\prod' : op === 'union' ? '\\bigcup' : op === 'intersection' ? '\\bigcap' : '\\sum';
  }
  function bound(x) { return /^-?infinity$/i.test(x) ? x.replace(/infinity/i, '\\infty') : x; }
  function integral(body, lo, hi) {
    var v = null;
    body = body.trim().replace(/\s+(?:with\s+respect\s+to|wrt)\s+([a-z])$/i, function (_, x) { v = x; return ''; })
      .replace(/\s*\bd\s?([a-z])$/i, function (_, x) { v = x; return ''; });
    if (!v) v = guessVar(body.replace(/^[a-zA-Z]\(/, '('), 'x');
    var lim = lo !== null ? '_{' + bound(lo) + '}^{' + bound(hi) + '}' : '';
    return '\\int' + lim + ' ' + body + ' \\, d' + v;
  }
  function limit(v, to, side) {
    var sup = '';
    if (side) sup = /left|below/i.test(side) ? '^{-}' : '^{+}';
    return '\\lim_{' + v + ' \\to ' + bound(to) + sup + '} ';
  }
  function derivative(body, v, ord, partial) {
    body = body.trim();
    var n = ord ? (/second/i.test(ord) ? 2 : 3) : 1;
    var d = partial ? '\\partial' : 'd';
    var sp = partial ? ' ' : '';
    var num = n > 1 ? d + '^{' + n + '}' : d;
    var den = d + sp + v + (n > 1 ? '^{' + n + '}' : '');
    if (/^[a-zA-Z]$/.test(body)) return '\\frac{' + num + sp + body + '}{' + den + '}';
    body = body.replace(/^([a-zA-Z])\s+of\s+([a-zA-Z][a-zA-Z0-9]*)$/, '$1($2)'); // "f of x" → f(x)
    return '\\frac{' + num + '}{' + den + '} ' + (/^[a-zA-Z]\(.*\)$/.test(body) ? body : '\\left(' + body + '\\right)');
  }

  var KNOWN_WORDS = FUNCS.concat(['mod', 'otherwise', 'if', 'Var', 'infty']);
  /** How much of the phrase did we understand? */
  function assess(latex) {
    var stripped = latex.replace(/\\text\{[^}]*\}/g, '').replace(/\\(?:operatorname|mathbb|mathcal|mathbf)\{[^}]*\}/g, '').replace(/\\[A-Za-z]+/g, ' ');
    var words = (stripped.match(/[A-Za-z]{3,}/g) || [])
      .concat(stripped.match(/(?:^|\s)of(?=\s|$)/g) || []); // a stray "of" means a phrase was missed
    var left = words.map(function (w) { return w.trim(); })
      .filter(function (w) { return KNOWN_WORDS.indexOf(w) < 0 && KNOWN_WORDS.indexOf(w.toLowerCase()) < 0; });
    return { confident: left.length === 0, leftover: left };
  }

  /** Offline conversion: phrase → {latex, text, confident, leftover} */
  function convertOffline(phrase, mode, opts) {
    var latex = nlToLatex(phrase);
    var a = assess(latex);
    var r = renderLatex(latex, mode, opts);
    return { latex: latex, text: r.text, confident: a.confident, leftover: a.leftover, source: 'offline' };
  }

  // ---------------------------------------------------------------------------
  // AI fallback (OpenAI-compatible chat completions)
  // ---------------------------------------------------------------------------
  var PROVIDERS = {
    groq: {
      label: 'Groq (free tier — recommended)',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'openai/gpt-oss-20b',
      keyUrl: 'https://console.groq.com/keys',
      extra: { reasoning_effort: 'low' }
    },
    gemini: {
      label: 'Google Gemini (free tier)',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-3.1-flash-lite',
      keyUrl: 'https://aistudio.google.com/apikey',
      extra: {}
    },
    openrouter: {
      label: 'OpenRouter (free models)',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/free',
      keyUrl: 'https://openrouter.ai/keys',
      extra: {}
    },
    custom: {
      label: 'Custom OpenAI-compatible (Ollama, LM Studio, OpenAI…)',
      baseUrl: 'http://localhost:11434/v1',
      model: 'qwen2.5:7b',
      keyUrl: '',
      extra: {}
    }
  };

  function buildAIRequest(phrase, mode, ai) {
    var preset = PROVIDERS[ai.provider] || PROVIDERS.groq;
    var base = (ai.baseUrl || preset.baseUrl).replace(/\/+$/, '');
    var body = {
      model: ai.model || preset.model,
      temperature: 0,
      max_tokens: 600,
      messages: [
        {
          role: 'system',
          content: 'You convert natural-language mathematics and logic into precise notation for pasting into a chat message. ' +
            'Output format: ' + modeInfo(mode).ai + ' ' +
            'For temporal logic use the standard operators X, F, G, U, R, W (past: Y, S, O, H; CTL path quantifiers A, E; PCTL P⋈p); in LaTeX write them as \\mathbf{G} etc. ' +
            'Reply with the notation ONLY — no explanation, no code fences, no quotes. Keep any surrounding plain words that are not math as words.'
        },
        { role: 'user', content: 'for all x in the reals, x squared is at least 0' },
        { role: 'assistant', content: mode === 'LATEX' ? '\\forall x \\in \\mathbb{R},\\ x^2 \\geq 0' : mode === 'ASCII' ? 'forall x in R, x^2 >= 0' : '∀x ∈ ℝ, x² ≥ 0' },
        { role: 'user', content: phrase }
      ]
    };
    Object.keys(preset.extra || {}).forEach(function (k) { if (!ai.baseUrl || ai.provider !== 'custom') body[k] = preset.extra[k]; });
    var headers = { 'Content-Type': 'application/json' };
    if (ai.apiKey) headers.Authorization = 'Bearer ' + ai.apiKey;
    if (ai.provider === 'openrouter') { headers['X-Title'] = 'MathLogic'; }
    return { url: base + '/chat/completions', init: { method: 'POST', headers: headers, body: JSON.stringify(body) } };
  }

  function parseAIResponse(json, mode) {
    var t = json && json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
    if (!t) throw new Error((json && json.error && (json.error.message || json.error)) || 'Empty AI response');
    t = String(t).trim().replace(/^```[a-z]*\s*|\s*```$/g, '').replace(/^["'`]|["'`]$/g, '').trim();
    if (mode !== 'LATEX') t = stripMathDelims(t);
    return t;
  }

  /** Performs the AI request with fetch (used by background worker and website). */
  function callAI(phrase, mode, ai, fetchImpl) {
    var req = buildAIRequest(phrase, mode, ai);
    var f = fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
    return f(req.url, req.init).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok) throw new Error((json.error && (json.error.message || json.error)) || ('HTTP ' + res.status));
        return parseAIResponse(json, mode);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Target syntax. Meaning is canonical, characters are not: "strong next" is X
  // for LTLf2DFA and X[!] for Spot and PyLogics, where a bare X is weak next.
  // A preset changes ASCII output and what the checker warns about, nothing else.
  //   LTLf2DFA  https://whitemech.github.io/LTLf2DFA/grammars/
  //   PyLogics  https://whitemech.github.io/pylogics/grammars/
  //   Spot      https://spot.lre.epita.fr/tut12.html
  // ---------------------------------------------------------------------------
  var TARGETS = {
    generic: { label: 'Generic — no parser in mind', tokens: null,
      help: 'ASCII output stays plain readable text, and the checker says nothing about tool syntax. Pick a tool if you paste formulas into one.' },
    ltlf2dfa: {
      label: 'LTLf2DFA', tokens: { and: '&', or: '|', not: '!', implies: '->', iff: '<->', Xs: 'X', Xw: 'WX' },
      bareX: 'X is strong next in LTLf2DFA — write WX if you meant weak next',
      missing: { W: 'rewrite it with U, or pick another target', M: 'rewrite it with R, or pick another target' },
      wrong: { 'X[!]': 'LTLf2DFA writes strong next as X, and weak next as WX' }
    },
    spot: {
      label: 'Spot (LTLf)', tokens: { and: '&', or: '|', not: '!', implies: '->', iff: '<->', Xs: 'X[!]', Xw: 'X' },
      bareX: 'X is weak next in Spot — write X[!] if you meant strong next',
      missing: { Y: 'Spot’s LTL operators are future-only', S: 'Spot’s LTL operators are future-only',
        O: 'Spot’s LTL operators are future-only', H: 'Spot’s LTL operators are future-only' },
      wrong: { WX: 'Spot writes weak next as X and strong next as X[!]' }
    },
    pylogics: {
      label: 'PyLogics', tokens: { and: '&', or: '|', not: '!', implies: '->', iff: '<->', Xs: 'X[!]', Xw: 'X' },
      bareX: 'X is weak next in PyLogics — write X[!] if you meant strong next',
      missing: {}, wrong: { WX: 'PyLogics writes weak next as X and strong next as X[!]' }
    }
  };
  // The help line is the token table in words, so the two cannot drift.
  Object.keys(TARGETS).forEach(function (k) {
    var t = TARGETS[k];
    if (!t.tokens) return;
    var missing = Object.keys(t.missing || {});
    t.help = 'ASCII output uses ' + [t.tokens.not, t.tokens.and, t.tokens.or, t.tokens.implies, t.tokens.iff].join(' ') +
      ', ' + t.tokens.Xs + ' for strong next and ' + t.tokens.Xw + ' for weak next' +
      (missing.length ? '. No ' + missing.join(', ') + ' in this target.' : '.');
  });

  function targetTokens(target) {
    var t = TARGETS[target];
    return t && t.tokens ? t.tokens : null;
  }

  // ---------------------------------------------------------------------------
  // Bracket check. Math Logic inserts operators, not grammar, so this never
  // assumes an operator needs brackets. It reports brackets the user opened and
  // did not close, and only for text that looks like a formula.
  // ---------------------------------------------------------------------------
  // Severity, worst first: cannot parse, the tool will not take it, it parses but
  // may not mean what the user thinks, style, grouping. Nothing here rewrites text.
  var LEVELS = {
    error: { rank: 4, tail: 'this will not parse' },
    target: { rank: 3, tail: 'the chosen target won’t take this' },
    semantic: { rank: 2, tail: 'parses, but may not mean this' },
    style: { rank: 1, tail: 'style' },
    info: { rank: 0, tail: 'grouping' }
  };
  var PAIRS = { ')': '(', ']': '[', '}': '{' };
  var MATH_SIGNAL = /[∀∃∧∨¬⇒⇔→↔∈∉⊆⊇⊂∪∩≤≥≠≢≡⊨⊢∑∏∫√∞±□◇◯⋈×·⌊⌈𝔼ℝℕℤℚ]|->|=>|<->|<=>|&&|\|\||(?:^|[\s(!¬])[GFXURWMYOHS](?=[\s(!¬])/g;

  function looksLikeFormula(text) {
    if (!text || text.length > 600) return false;
    MATH_SIGNAL.lastIndex = 0;
    var n = 0;
    while (MATH_SIGNAL.exec(text)) { n++; if (n >= 2) return true; }
    return false;
  }

  /** The first bracket problem in a formula-looking text, or null. */
  function checkBrackets(text) {
    var stack = [];
    for (var i = 0; i < text.length; i++) {
      var c = text.charAt(i);
      if (c === '(' || c === '[' || c === '{') stack.push({ ch: c, at: i });
      else if (PAIRS[c]) {
        if (!stack.length) return { type: 'extra', level: 'error', ch: c, at: i, count: 1, message: 'an extra “' + c + '” with nothing to close' };
        var top = stack.pop();
        if (top.ch !== PAIRS[c]) return { type: 'mismatch', level: 'error', ch: c, at: i, count: 1, message: '“' + c + '” closes a “' + top.ch + '”' };
      }
    }
    if (!stack.length) return null;
    var open = stack[0].ch;
    var same = stack.filter(function (x) { return x.ch === open; }).length === stack.length;
    return { type: 'unclosed', level: 'error', ch: open, at: stack[0].at, count: stack.length,
      message: stack.length + (same ? ' unclosed “' + open + '”' : ' unclosed brackets') };
  }

  // ---------------------------------------------------------------------------
  // Parser for Boolean and temporal formulas. Aliases collapse to one semantic
  // token first, so ¬ ! ~ are one operator, and the checks read the parse rather
  // than more regexes. Precedence, loosest first:
  //   ↔ , → , ∨ , ∧ , binary temporal (U R W M S), unary operators.
  // ---------------------------------------------------------------------------
  var TOK_WORD = {
    G: 'G', F: 'F', X: 'X', WX: 'Xw', U: 'U', R: 'R', V: 'R', W: 'W', M: 'M',
    Y: 'Y', S: 'S', O: 'O', H: 'H', A: 'A', E: 'E',
    last: 'last', start: 'start', true: 'true', false: 'false'
  };
  var TOK_SYMBOL = [
    ['X[!]', 'Xs'], ['<->', 'iff'], ['<=>', 'iff'], ['->', 'implies'], ['=>', 'implies'],
    ['&&', 'and'], ['||', 'or'], ['&', 'and'], ['|', 'or'], ['!', 'not'], ['~', 'not'],
    ['¬', 'not'], ['∧', 'and'], ['∨', 'or'], ['⇒', 'implies'], ['→', 'implies'], ['↔', 'iff'], ['⇔', 'iff'],
    ['□', 'G'], ['◇', 'F'], ['○', 'X'], ['◯', 'X'], ['X̃', 'Xw'], ['(', '('], [')', ')']
  ];
  var UNARY = { not: 1, G: 1, F: 1, X: 1, Xs: 1, Xw: 1, Y: 1, O: 1, H: 1, A: 1, E: 1 };
  var BINARY = { iff: 1, implies: 2, or: 3, and: 4, U: 5, R: 5, W: 5, M: 5, S: 5 };
  var RIGHT_ASSOC = { implies: 1, iff: 1, U: 1, R: 1, W: 1, M: 1, S: 1 };
  var OP_LABEL = {
    not: 'NOT', and: 'AND', or: 'OR', implies: 'IMPLIES', iff: 'IFF',
    G: 'G', F: 'F', X: 'X', Xs: 'X[!] (strong next)', Xw: 'WX (weak next)',
    U: 'U (until)', R: 'R (release)', W: 'W (weak until)', M: 'M (strong release)',
    Y: 'Y (previous)', S: 'S (since)', O: 'O (once)', H: 'H (historically)', A: 'A (all paths)', E: 'E (some path)'
  };
  var OP_WORD = {
    not: 'negation', and: 'conjunction', or: 'disjunction', implies: 'implication', iff: 'equivalence',
    G: 'always (G)', F: 'eventually (F)', X: 'next (X)', Xs: 'strong next (X[!])', Xw: 'weak next (WX)',
    U: 'until (U)', R: 'release (R)', W: 'weak until (W)', M: 'strong release (M)',
    Y: 'previous (Y)', S: 'since (S)', O: 'once (O)', H: 'historically (H)', A: 'A', E: 'E'
  };

  /** Text → tokens. Returns null when the text is not a Boolean/temporal formula. */
  function tokenize(text) {
    var out = [], i = 0;
    while (i < text.length) {
      var c = text.charAt(i);
      if (/\s/.test(c)) { i++; continue; }
      var hit = null, k;
      for (k = 0; k < TOK_SYMBOL.length; k++) {
        if (text.substr(i, TOK_SYMBOL[k][0].length) === TOK_SYMBOL[k][0]) { hit = TOK_SYMBOL[k]; break; }
      }
      if (hit) { out.push({ t: hit[1], at: i }); i += hit[0].length; continue; }
      var word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i));
      if (word) {
        var w = word[0];
        out.push(TOK_WORD[w] ? { t: TOK_WORD[w], at: i } : { t: 'atom', v: w, at: i });
        i += w.length;
        continue;
      }
      return null; // ∀, ∈, =, digits… this is not a temporal-logic formula
    }
    return out;
  }

  /**
   * Pratt parser. Returns { ast } or { error: { message, at } }.
   * Nodes: { op, args: [] } and { atom } / { const }.
   */
  function parseTokens(toks) {
    var i = 0, err = null;
    function fail(message, at) { if (!err) err = { message: message, at: at == null ? (toks[i] ? toks[i].at : -1) : at }; return null; }
    function peek() { return toks[i]; }

    function parseUnary() {
      var tk = peek();
      if (!tk) return fail('the formula stops early');
      if (tk.t === '(') {
        i++;
        var inner = parseExpr(0);
        if (!inner) return null;
        if (!peek() || peek().t !== ')') return fail('a “(” is never closed', tk.at);
        i++;
        return inner;
      }
      if (tk.t === ')') return fail('an extra “)” with nothing to close', tk.at);
      if (UNARY[tk.t]) {
        i++;
        var arg = parseUnary();
        if (!arg) { if (err) err.message = OP_WORD[tk.t] + ' has nothing after it'; return null; }
        return { op: tk.t, args: [arg] };
      }
      if (tk.t === 'atom') { i++; return { atom: tk.v }; }
      if (tk.t === 'true' || tk.t === 'false' || tk.t === 'last' || tk.t === 'start') { i++; return { atom: tk.t, helper: true }; }
      if (BINARY[tk.t]) return fail(OP_WORD[tk.t] + ' has nothing before it', tk.at);
      return fail('unexpected “' + tk.t + '”', tk.at);
    }

    function parseExpr(minPrec) {
      var left = parseUnary();
      if (!left) return null;
      while (peek() && BINARY[peek().t] && BINARY[peek().t] > minPrec) {
        var op = peek(), prec = BINARY[op.t];
        i++;
        var right = parseExpr(RIGHT_ASSOC[op.t] ? prec - 1 : prec);
        if (!right) { if (err && /stops early/.test(err.message)) err.message = OP_WORD[op.t] + ' has nothing after it'; return null; }
        left = { op: op.t, args: [left, right] };
      }
      return left;
    }

    var ast = parseExpr(0);
    if (err) return { error: err };
    if (!ast) return { error: { message: 'the formula could not be read', at: 0 } };
    if (i < toks.length) return { error: { message: 'unexpected “' + (toks[i].v || toks[i].t) + '”', at: toks[i].at } };
    return { ast: ast };
  }

  /** Parse a line of text. Returns null when it isn't a Boolean/temporal formula at all. */
  function parseFormula(text) {
    var toks = tokenize(String(text || ''));
    if (!toks || !toks.length) return null;
    return parseTokens(toks);
  }

  /** AND/OR chains read better as one n-ary node, the way people think of them. */
  function flatten(node) {
    if (!node || !node.op) return node;
    var args = [];
    node.args.forEach(function (a) {
      var f = flatten(a);
      if ((node.op === 'and' || node.op === 'or') && f.op === node.op) args = args.concat(f.args);
      else args.push(f);
    });
    return { op: node.op, args: args };
  }

  /** An ASCII tree of the formula's structure — what is inside which operator. */
  function formulaTree(text) {
    var r = parseFormula(text);
    if (!r || r.error) return null;
    var lines = [];
    (function walk(node, prefix, branch) {
      var label = node.op ? OP_LABEL[node.op] : node.atom;
      lines.push(prefix + branch + label);
      if (!node.op) return;
      var childPrefix = prefix + (branch ? (branch === '└─ ' ? '   ' : '│  ') : '');
      node.args.forEach(function (a, k) {
        walk(a, childPrefix, k === node.args.length - 1 ? '└─ ' : '├─ ');
      });
    })(flatten(r.ast), '', '');
    return lines.join('\n');
  }

  /** What the formula says at the top, where scope mistakes hide. */
  function describeTop(text) {
    var r = parseFormula(text);
    if (!r || r.error) return null;
    var top = flatten(r.ast);
    if (!top.op) return 'a single proposition';
    if (top.op === 'and' || top.op === 'or') return 'top level: ' + OP_LABEL[top.op] + ' of ' + top.args.length;
    return 'top level: ' + OP_LABEL[top.op];
  }

  /** Two names side by side never happen in a formula, but happen in every sentence. */
  function looksLikeProse(toks) {
    for (var i = 1; i < toks.length; i++) if (toks[i].t === 'atom' && toks[i - 1].t === 'atom') return true;
    return false;
  }

  /**
   * Structure from the parse, not from patterns: a dangling operator, an empty
   * group, a stray token. Text that is not a formula is left alone.
   */
  function checkArity(text) {
    if (/\(\s*\)/.test(text)) return { type: 'empty', level: 'error', ch: '(', at: text.indexOf('()'), count: 1, message: 'an empty ( ) with nothing inside' };
    var toks = tokenize(String(text || ''));
    if (!toks || looksLikeProse(toks)) return null;
    var r = parseTokens(toks);
    if (!r.error) return null;
    if (/never closed|extra “\)”/.test(r.error.message)) return null; // checkBrackets says this better
    return { type: 'parse', level: 'error', ch: '', at: r.error.at, count: 1, message: r.error.message };
  }

  // "a U b U c" parses, but tools group it differently. Two binary temporal
  // operators inside the same brackets are the signal.
  function checkGrouping(text) {
    var toks = tokenize(String(text || ''));
    if (!toks) return null;
    var stack = [{ seen: null }], top;
    for (var i = 0; i < toks.length; i++) {
      var t = toks[i].t;
      if (t === '(') { stack.push({ seen: null }); continue; }
      if (t === ')') { if (stack.length > 1) stack.pop(); continue; }
      if (!/^[URWMS]$/.test(t)) continue;
      top = stack[stack.length - 1];
      if (top.seen) {
        return { type: 'grouping', level: 'info', ch: t, at: toks[i].at, count: 1,
          message: OP_WORD[top.seen] + ' and ' + OP_WORD[t] + ' in a row — add brackets to fix the grouping' };
      }
      top.seen = t;
    }
    return null;
  }

  /** Two spellings of the same connective in one formula. */
  function checkAliases(text) {
    var impl = [];
    if (text.indexOf('⇒') >= 0) impl.push('⇒');
    if (text.indexOf('→') >= 0) impl.push('→');
    if (/(?:^|[^<|=-])->/.test(text)) impl.push('->');
    if (/(?:^|[^<])=>/.test(text)) impl.push('=>');
    if (impl.length > 1) return { type: 'mixed', level: 'style', ch: impl[0], at: text.indexOf(impl[0]), count: impl.length,
      message: 'two implication symbols in one formula: ' + impl.join(' and ') };
    return null;
  }

  /** What the selected tool will not accept. Only runs when a target is chosen. */
  function checkTarget(text, target) {
    var t = TARGETS[target];
    if (!t || !t.tokens) return null;
    var k;
    for (k in t.wrong) if (t.wrong.hasOwnProperty(k) && text.indexOf(k) >= 0) {
      return { type: 'target', level: 'target', ch: k, at: text.indexOf(k), count: 1, message: t.wrong[k] };
    }
    for (k in t.missing) if (t.missing.hasOwnProperty(k) && new RegExp('(?:^|[\\s)])' + k + '(?=[\\s(!¬])').test(text)) {
      return { type: 'target', level: 'target', ch: k, at: text.indexOf(k), count: 1,
        message: t.label + ' has no “' + k + '” — ' + (t.missing[k] || 'pick another target') };
    }
    var uni = /[¬∧∨⇒⇔↔→□◇○●◯]/.exec(text);
    if (uni) return { type: 'target', level: 'target', ch: uni[0], at: uni.index, count: 1,
      message: t.label + ' reads ASCII: ! & | -> <-> — switch output to ASCII' };
    return null;
  }

  /**
   * Bare X parses everywhere and means different things. Strong next in LTLf2DFA,
   * weak next in Spot and PyLogics. The one case where a tool accepts a formula
   * and still reads it differently than the user meant.
   */
  function checkSemantics(text, target) {
    var t = TARGETS[target];
    if (!t || !t.bareX) return null;
    var re = /(?:^|[\s(!¬])X(?!\[!\])(?=[\s(!¬])/;    // X, but not X[!] and not the WX inside a word
    var m = re.exec(text.replace(/WX/g, '··'));
    if (!m) return null;
    return { type: 'semantics', level: 'semantic', ch: 'X', at: m.index, count: 1, message: t.bareX };
  }

  /**
   * Everything the checker knows, worst finding first.
   * It only reports. Nothing here rewrites what the user typed.
   */
  function checkFormula(text, opts) {
    if (!looksLikeFormula(text)) return null;
    var target = (opts || {}).target;
    var found = [checkBrackets(text), checkArity(text), checkTarget(text, target),
      checkSemantics(text, target), checkAliases(text), checkGrouping(text)].filter(Boolean);
    // the worst one wins, by the ranking in LEVELS — the order of the calls above
    // is not a second place where severity is decided
    found.sort(function (a, b) { return LEVELS[b.level].rank - LEVELS[a.level].rank; });
    return found[0] || null;
  }

  /**
   * The four output modes, described once. Labels and samples for the settings
   * pages, the sentence the popup shows, the wording the AI prompt uses.
   */
  var MODE_INFO = [
    { id: 'UNICODE', label: 'Unicode', sample: '∀x ∈ ℝ, x² ≥ 0', short: '∀x ∈ ℝ',
      desc: 'Real symbols. Reads cleanly and every AI understands them.',
      hint: 'Real symbols (∀ ∈ ℝ ∑ x²). Reads cleanly in any chat and every AI understands it.',
      ai: 'Unicode math characters (∀ ∃ ∈ ℝ ∑ ∫ √ ≤ ≠ → x² aₙ). Use _( ) and ^( ) only when no Unicode sub/superscript exists. No LaTeX commands.' },
    { id: 'LATEX', label: 'LaTeX', sample: '\\forall x \\in \\mathbb{R}', short: '\\forall',
      desc: 'Best when you want the answer back as rendered math.',
      hint: 'LaTeX commands. Best when you want the AI to answer in rendered math.',
      ai: 'LaTeX (e.g. \\forall x \\in \\mathbb{R}, \\sum_{n=1}^{\\infty} \\frac{1}{n^2}). No surrounding $ signs.' },
    { id: 'ASCII', label: 'ASCII', sample: 'forall x in R, x^2 >= 0', short: 'forall',
      desc: 'Plain keyboard text. Safe for code and comments.',
      hint: 'Plain keyboard text (forall, ->, <=). Safe everywhere, e.g. code comments.',
      ai: 'plain ASCII that programmers use (forall, exists, in, ->, <=, !=, sum_(i=1)^(n), sqrt(x), x^2).' },
    { id: 'AUTO', label: 'Auto', sample: 'Unicode → $LaTeX$', short: 'best fit',
      desc: 'Unicode, switching to LaTeX when a formula gets complex.',
      hint: 'Unicode for symbols and simple formulas; switches to $LaTeX$ when a formula would be ambiguous in Unicode.',
      ai: 'Unicode math characters if the result stays readable on one line; otherwise LaTeX without $ signs.' }
  ];
  function modeInfo(id) {
    for (var i = 0; i < MODE_INFO.length; i++) if (MODE_INFO[i].id === id) return MODE_INFO[i];
    return MODE_INFO[0];
  }

  /**
   * Every delay the UI waits on, in milliseconds. Tuned together, not scattered
   * across handlers. `settle` is "after the editor has applied its own change".
   */
  var TIMING = {
    settle: 0,        // let a rich editor finish its DOM update before we look
    blur: 120,        // focus often lands elsewhere and comes straight back
    check: 700,       // pause in typing before the formula check speaks up
    toast: 2200,      // a confirmation stays this long
    toastError: 5000, // an error stays longer, it has more to read
    save: 400         // typing in a settings box before it reaches storage
  };

  var SETTINGS_VERSION = 1;
  var DEFAULT_SETTINGS = {
    version: SETTINGS_VERSION,
    enabled: true,
    mode: MODES.UNICODE,
    smartOps: true,
    bracketCheck: true,
    wrapLatex: true,
    latexDelims: 'auto',
    target: 'generic',
    disabledSites: [],
    customSnippets: 'lhs = left-hand side\nrhs = right-hand side',
    // consent: the user has read the disclosure and switched AI conversion on (off by default)
    ai: { provider: 'groq', apiKey: '', model: '', baseUrl: '', preferAI: false, consent: false }
  };

  var LIST_SETTINGS = { disabledSites: 1 };
  var TEXT_SETTINGS = { customSnippets: 1 };
  /**
   * Bring a stored settings object up to this build's shape. Each step upgrades
   * one version, so a profile can skip several builds and still arrive intact.
   */
  function migrateSettings(raw) {
    var s = Object.assign({}, DEFAULT_SETTINGS, raw);
    // No older shapes yet. A step looks like:
    //   if (s.version < 2) { s.newThing = derive(s.oldThing); s.version = 2 }
    s.version = SETTINGS_VERSION;
    return s;
  }

  /**
   * Settings may come from an older build, another machine or a hand-edited
   * profile. Unknown values fall back to the default instead of spreading.
   */
  function normalizeSettings(raw) {
    var s = migrateSettings(raw || {});
    if (!MODES[s.mode]) s.mode = DEFAULT_SETTINGS.mode;
    if (!TARGETS[s.target]) s.target = DEFAULT_SETTINGS.target;
    if (s.latexDelims !== 'auto' && !DELIMS[s.latexDelims]) s.latexDelims = DEFAULT_SETTINGS.latexDelims;
    ['enabled', 'smartOps', 'bracketCheck', 'wrapLatex'].forEach(function (k) { s[k] = s[k] !== false; });
    Object.keys(LIST_SETTINGS).forEach(function (k) {
      s[k] = Array.isArray(s[k]) ? s[k].filter(function (x) { return typeof x === 'string' && x; }) : [];
    });
    Object.keys(TEXT_SETTINGS).forEach(function (k) { if (typeof s[k] !== 'string') s[k] = DEFAULT_SETTINGS[k]; });
    var ai = Object.assign({}, DEFAULT_SETTINGS.ai, s.ai || {});
    if (!PROVIDERS[ai.provider]) ai.provider = DEFAULT_SETTINGS.ai.provider;
    ai.consent = ai.consent === true;
    ai.preferAI = ai.preferAI === true;
    ['apiKey', 'model', 'baseUrl'].forEach(function (k) { if (typeof ai[k] !== 'string') ai[k] = ''; });
    s.ai = ai;
    return s;
  }

  /** AI may be used only after explicit consent, and with a key (or a local custom server). */
  function aiReady(ai) {
    return !!ai && ai.consent === true && (!!ai.apiKey || ai.provider === 'custom');
  }

  root.MathLogicEngine = {
    PH: PH,
    sizedTemplate: sizedTemplate,
    hintFor: hintFor,
    RECIPES: RECIPES,
    delimsFor: delimsFor,
    wrapMath: wrapMath,
    SIZE_MAX: SIZE_MAX,
    MODES: MODES,
    SYMBOLS: SYMBOLS,
    TEMPLATES: TEMPLATES,
    PROVIDERS: PROVIDERS,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    normalizeSettings: normalizeSettings,
    migrateSettings: migrateSettings,
    SETTINGS_VERSION: SETTINGS_VERSION,
    TIMING: TIMING,
    parseCustomSnippets: parseCustomSnippets,
    getSuggestions: getSuggestions,
    findExact: findExact,
    renderEntry: renderEntry,
    MODE_INFO: MODE_INFO,
    modeInfo: modeInfo,
    TARGETS: TARGETS,
    smartOperator: smartOperator,
    looksLikeFormula: looksLikeFormula,
    checkBrackets: checkBrackets,
    checkArity: checkArity,
    checkAliases: checkAliases,
    checkGrouping: checkGrouping,
    glyphFor: glyphFor,
    recipeKey: recipeKey,
    searchText: searchText,
    NOT_A_FORMULA: 'not a formula this parser reads',
    checkSemantics: checkSemantics,
    parseFormula: parseFormula,
    formulaTree: formulaTree,
    describeTop: describeTop,
    LEVELS: LEVELS,
    checkFormula: checkFormula,
    toSup: toSup,
    toSub: toSub,
    renderLatex: renderLatex,
    nlToLatex: nlToLatex,
    convertOffline: convertOffline,
    buildAIRequest: buildAIRequest,
    parseAIResponse: parseAIResponse,
    callAI: callAI,
    aiReady: aiReady
  };
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
