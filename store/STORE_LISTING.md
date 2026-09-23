# Chrome Web Store kit: Math Logic

Everything to paste into the [developer dashboard](https://chrome.google.com/webstore/devconsole), field by field.

## Before you submit

- [x] Contact email in the privacy policy: johnthuo2024@outlook.com. If it changes, edit `extension/privacy.html` and run `npm run zip:ext`.
- [x] Privacy policy online at https://math-logic.johnmatrixthuo.workers.dev/privacy.html. It is served by the website build, so republish that page after any change to `extension/privacy.html`.
- [ ] Run `npm run test:all`, then `npm run zip:ext`, then upload `public/mathlogic-extension.zip`.
- [ ] Upload 5 screenshots from `store/` and the promo tile.
- [ ] Check the privacy policy URL still loads. It has to stay online for as long as the item is listed.

## 1. Package

Upload `public/mathlogic-extension.zip`. Name, summary and icon come from `manifest.json`.

- **Name:** Math Logic
- **Version:** 1.1.0
- **Summary** (94 of 132 characters): Type math and logic symbols as easily as words, right inside ChatGPT, Claude, Gemini and more.

## 2. Store listing

**Category:** Productivity, Tools
**Language:** English

**Description**, as plain text:

```
Write math and logic in any AI chat without leaving the chat box.

Math Logic is like Grammarly, but for math notation. It works where you type, in ChatGPT, Claude, Gemini or any other text box, so you never need a separate equation editor.

HOW IT WORKS

• Backslash shortcuts: type \forall, \in, \RR, \int, \alpha and more. Pick from the suggestions with Tab or Enter, or press Space after the full name.
   \forall x \in \RR  →  ∀x ∈ ℝ

• Smart operators as you type: -> becomes →, <= becomes ≤, != becomes ≠, x^2 becomes x² and a_n becomes aₙ. Code blocks are left alone.

• Templates with boxes: \frac, \sumto, \intab, set builder and more. Tab jumps from one ⬚ to the next. Sizes go in the shortcut, so \mat2x3 is two rows by three columns, \vec5 has five entries and \cases3 has three branches.
   \intab  →  ∫_(0)^(1) x² dx

• Plain English: type /math followed by what you mean, then press Enter.
   /math sum of 1/n^2 from n=1 to infinity  →  ∑_(n=1)^∞ 1/n²
   Or select any text and press Alt+M, Option+M on a Mac.

• Temporal logic for LTL, LTLf, past time LTL, CTL and PCTL. Operators stand alone, so G p and G F p stay valid, and \Gof inserts G(⬚) when the argument is compound. Next comes in three forms: \X for plain next, \Xs for strong next and \Xw for weak next.

• Automata and formal models: \dfa, \nfa, \pda, \tm, \cfg, \kripke, \mdp and more expand to the standard tuple with its transition function, for example M = (Q, Σ, δ, q₀, F), δ: Q × Σ → Q. Add def to any of them, as in \dfadef, for the full definition with a box for each part.

• Target syntax: tools disagree about what a bare X means on a finite trace. It is strong next in LTLf2DFA, while Spot and PyLogics read it as weak next and write strong next as X[!]. Pick your tool in Settings and ASCII output uses its spelling. Unicode and LaTeX display never change.

• Formula check: when a line looks like a formula, a small note points out what will not parse, what the chosen tool will not accept, what parses but may not mean what you think, and style slips such as mixing ⇒ with →. It only warns. It never rewrites what you typed, and Esc hides it.

• Formula inspector: paste a formula into Settings and see its structure as a tree, so you can tell whether a requirement sits inside G(start ⇒ …) or beside it.

• Diagrams the AI can read: \graph inserts a Mermaid state diagram, \graphviz a DOT block and \ttable3x2 a transition table.

• Four output formats: Unicode, LaTeX, plain ASCII or Auto. LaTeX is wrapped in the delimiters each chat renders best: \( … \) on ChatGPT, $$ … $$ on Claude, $ … $ elsewhere.

• Your own shortcuts: add lines such as "bayes = P(A|B) = P(B|A)P(A)/P(B)" in Settings.

• Safe in chat boxes: Enter never sends your message by accident while a suggestion is open.

PRIVATE BY DESIGN

Everything runs in your browser. No accounts, no analytics, no ads, no server of ours.

AI help is optional. For phrases the built in converter cannot read, you can turn on AI conversion with your own free API key. Groq is recommended, and Gemini, OpenRouter or a local model also work. It is off by default. When it is on, only the phrase being converted is sent, straight to the provider you chose.

Over 250 symbols and templates across logic, sets, number systems, calculus, relations, arrows, Greek letters, probability, computer science, temporal logic and automata.
```

## 3. Graphics

The store takes 5 screenshots. Upload 1, 2, 4, 5 and 6, which cover typing, plain English, settings, the toolbar and the inspector.

| Asset | File | Size |
|---|---|---|
| Store icon | `extension/icons/icon128.png` | 128x128 |
| Suggestions | `store/screenshot-1-suggestions.png` | 1280x800 |
| Plain English | `store/screenshot-2-math-command.png` | 1280x800 |
| Templates | `store/screenshot-3-templates.png` | 1280x800 |
| Settings | `store/screenshot-4-settings.png` | 1280x800 |
| Toolbar popup | `store/screenshot-5-popup.png` | 1280x800 |
| Formula inspector | `store/screenshot-6-inspector.png` | 1280x800 |
| Small promo tile | `store/promo-small-440x280.png` | 440x280 |

## 4. Privacy practices

**Single purpose:**

```
Math Logic helps users type mathematical and logical notation. It converts shortcuts, operators and plain English phrases into symbols and formulas inside the text box the user is typing in.
```

**Permission justifications:**

| Permission | Justification to paste |
|---|---|
| Host permission `<all_urls>` | The extension converts notation in whatever text box the user is typing in, on any website, including AI chats, forums, docs and email. The content script reads only text near the cursor in the focused field, processes it locally and never transmits it. |
| `storage` | Saves the user's settings: output format, target syntax, smart operators, formula check, paused sites and custom shortcuts. The optional AI key is saved in local storage only. |
| `activeTab` | Lets the toolbar popup read the current tab's hostname, so the user can pause the extension on that site. |
| Hosts api.groq.com, generativelanguage.googleapis.com, openrouter.ai, localhost, 127.0.0.1 | Used only by the optional AI conversion, to send the phrase being converted to the provider the user selected with their own key. localhost supports users running a local model. |
| Optional hosts `https://*/*`, `http://*/*` | Requested at runtime only if the user enters a custom OpenAI compatible server address in Settings, and only for that one origin. |

**Remote code:** No. All JavaScript is in the package. The AI provider returns text only.

**Data usage.** Tick these two:

- Authentication information: the user's own AI provider key, if they add one. Stored locally, sent only to that provider as the authorization header.
- Website content: the text of a /math phrase or selection, sent to the provider the user chose, only when AI conversion is on.

Leave the rest unticked. Keystrokes are read locally to detect shortcuts and are never collected or transmitted.

**Certify all three:**

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

Data does reach a third party, the AI provider, but only because the user configured it and asked for it. That is the user facing feature itself, disclosed in the privacy policy and in Settings.

**Privacy policy URL:** `https://math-logic.johnmatrixthuo.workers.dev/privacy.html`

## 5. Distribution

Visibility public, or unlisted to share a link with testers first. All regions. Free.

## 6. Notes for the reviewer

```
Test without any setup: open any site with a text box, for example chatgpt.com, type \forall and press Tab to get ∀. Type "/math x squared is at least 0" and press Enter to get x² ≥ 0.
The optional AI feature is off by default and needs the user's own API key plus an explicit opt in checkbox in Settings. Only the phrase being converted is sent, directly to the chosen provider.
```

## Updating later

1. Raise `"version"` in `extension/manifest.json` and add a section to `CHANGELOG.md`.
2. Run `npm run test:all`, then `npm run zip:ext`.
3. Upload the new zip under Package, update any listing text that changed, and submit.
