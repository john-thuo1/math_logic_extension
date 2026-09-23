# Math Logic

Type math and logic notation straight into ChatGPT, Claude, Gemini or any other text box. No separate equation editor, no copy and paste.

**[Install from the Chrome Web Store](https://chromewebstore.google.com/detail/oghlchnfcdnkjdobefjplbefaomcephi)**

| You type | You get (Unicode mode) |
|---|---|
| `\forall x \in \RR` then Space | `∀x ∈ ℝ` |
| `x^2 + a_1 -> b <= c != d` | `x² + a₁ → b ≤ c ≠ d` |
| `\intab` then Tab through the boxes | `∫_(0)^(1) x² dx` |
| `/math sum of 1/n^2 from n=1 to infinity` then Enter | `∑_(n=1)^∞ 1/n²` |
| select text, then Alt or Option with M | converts the selection in place |

## What it does

**Shortcuts.** Type a backslash and a name. A popup ranks the matches. Tab or Enter inserts the top one, Space accepts an exact name. Over 250 entries cover logic, sets, number systems, calculus, relations, arrows, Greek letters, probability and computer science.

**Smart operators.** `->`, `<=`, `!=`, `x^2` and `a_n` become `→ ≤ ≠ x² aₙ` as you type. Code blocks and code editors are left alone.

**Templates with boxes.** `\frac`, `\sumto`, `\intab`, set builder and more insert ⬚ boxes. Tab jumps to the next one. Sizes go in the name, so `\mat2x3` is two rows by three columns, `\vec5` has five entries and `\cases3` has three branches.

**Plain English.** Type `/math` and what you mean, then press Enter. The offline converter handles common phrasing for free. For anything it cannot read you can add your own free API key.

**Temporal logic.** Standalone operators for LTL, LTLf, past time LTL, CTL and PCTL. Brackets stay optional, so `G p` and `G F p` are fine, and `\Gof` inserts `G(⬚)` when the argument is compound. Next comes in three forms: `\X` for plain next, `\Xs` for strong next and `\Xw` for weak next.

**Automata and formal models.** `\dfa`, `\nfa`, `\pda`, `\tm`, `\cfg`, `\kripke`, `\mdp` and more insert the standard tuple with its transition function. Add `def` to any of them for the full definition with a box for each part.

**Target syntax.** Tools disagree about what a bare `X` means on a finite trace. It is strong next in LTLf2DFA, while Spot and PyLogics read it as weak next and write strong next as `X[!]`. Pick your tool in Settings and ASCII output uses its spelling. Unicode and LaTeX display never change.

**Formula check.** When a line looks like a formula, a small note points out, worst first:

| Level | What it means | Example |
|---|---|---|
| error | it will not parse | `G(a -> F(b)` or `c U` with nothing after it |
| target | the chosen tool will not take it | `W` under LTLf2DFA |
| semantic | it parses but may not mean what you think | a bare `X` under Spot |
| style | valid but inconsistent | one formula using both `⇒` and `→` |
| info | grouping is easy to misread | `a U b U c` without brackets |

It only reports. It never rewrites what you typed, and Esc hides it.

**Formula inspector.** Paste a formula into Settings and see its structure as a tree. A requirement that ended up inside `G(start ⇒ …)` instead of beside it looks almost the same in text and obvious in the tree.

**Four output formats.** Unicode, LaTeX, ASCII and Auto. LaTeX is wrapped in the delimiters each chat renders best.

## Install for development

1. Open `chrome://extensions` and turn on Developer mode.
2. Click Load unpacked and pick the `extension/` folder.
3. Open any chat site and type `\forall`.

## What is in this folder

```
extension/         The Chrome extension, Manifest V3
  engine.js        Shared engine: entries, renderer, parser, checker, settings
  content.js       Shared controller: keys, caret, popup, boxes, warnings
  options.js/.html Settings, playground, inspector, recipes, cheat sheet
  popup.js/.html   Toolbar popup
  background.js    Service worker, used only for the optional AI call
site/              The demo site: App.tsx, components/, the typed engine bridge
public/            Static files the site ships, including the privacy policy
tests/unit/        299 tests with node:test
tests/e2e/         210 tests with Playwright, against the real extension
```

`store/` is the submission kit: the listing text, the screenshots, the promo tile and the script that makes them. It is kept out of the repo, so it lives only on the maintainer's machine. `npm run store:images` needs it.

The website and the extension share `engine.js` and `content.js`, so the demo behaves exactly like the extension.

## Commands

```bash
npm install
npm run dev              # website at http://localhost:3000
npm run build            # rebuilds the extension zip, then the website
npm run setup:browsers   # once, for the end to end tests
npm run test:all         # typecheck, unit tests, end to end tests
npm run store:images     # regenerates the store screenshots
```

## Releasing

The zip is made by the build, so it is not in the repo.

```bash
npm run test:all     # must be green first
npm run zip:ext      # writes public/mathlogic-extension.zip
```

Where each output goes:

| Output | Where it goes |
|---|---|
| `public/mathlogic-extension.zip` | Chrome Web Store, Package tab, and attached to the GitHub release |
| `store/screenshot-*.png`, `store/promo-small-440x280.png` | Web Store listing graphics, 5 screenshots and 1 tile |
| text in `store/STORE_LISTING.md` | the listing fields, field by field |

The `store/` folder is not in the repo. Keep your own copy of it.

### Steps for a release

1. Raise `"version"` in `extension/manifest.json` and add a section to `CHANGELOG.md`.
2. Run the two commands above.
3. Tag and push: `git tag v1.1.0 && git push --tags`.
4. Update the existing store item, never a new one, so the ID and the users are kept.

`.github/workflows/test.yml` runs the whole suite on every push and pull request.

`.github/workflows/release.yml` runs on a `v*` tag. It checks the tag against the manifest version, runs the tests, builds the zip and creates the GitHub release with that version's changelog section. It can also upload the package to the store item, which it skips unless four secrets exist: `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN` and `CWS_EXTENSION_ID`. The store API covers the package only. Listing text, screenshots and privacy answers stay manual in the dashboard, and every upload still goes through Google's review.

### The website

`site/` is a demo of the same engine, plus the privacy policy the store listing points at. `npm run build` writes it to `dist/` and `npm run dev` serves it locally. Nothing deploys it automatically. The privacy policy has to stay reachable at the URL in the listing, so keep that page online wherever it is hosted.

## Design rules

These are enforced by tests in `tests/unit/dry.test.mjs` and `tests/unit/robust.test.mjs`, not left to discipline.

**One concept, one place.** Each machine, operator, mode and target is written down once, and every surface renders from it. Adding a target means editing one table.

**The engine stays pure.** No DOM, no chrome APIs, no timers. Even fetch is passed in. That is what lets the same file run in the content script, both pages, the website and Node.

**Host pages are not ours to break.** Every listener is wrapped. If our code throws, the UI is dropped and the key reaches the page.

**Stored settings are never trusted.** Unknown values fall back to defaults, and a version stamp gives a future migration something to read.

**Insertions are clean replacements.** A property test types shortcuts at random caret positions in three editor kinds and checks that the text on both sides survives exactly.

## Privacy

Everything runs in your browser. No accounts, no analytics, no server of ours.

The AI conversion for `/math` is optional and off by default. When you turn it on, only the phrase being converted is sent, straight from your browser to the provider you chose, with your own key. The key is stored in local extension storage on that computer and is never synced. See `extension/privacy.html`.

## Acknowledgements

Built with help from Claude, Anthropic's AI assistant, model `claude-opus-5`. Math Logic is an independent project and is not affiliated with or endorsed by Anthropic.
