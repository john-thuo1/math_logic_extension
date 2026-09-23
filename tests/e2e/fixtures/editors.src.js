// Test fixture: the same kinds of editors real AI chats use.
//   #ta     <textarea>          (many chat UIs, React-controlled in some)
//   #inp    <input type=text>
//   #ce     bare contenteditable
//   #pm     ProseMirror         (ChatGPT, Claude)
//   #quill  Quill               (Gemini)
// Every editor "sends" on Enter (without Shift) like a chat box: window.sent records it.
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from 'prosemirror-schema-basic';
import { keymap } from 'prosemirror-keymap';
import { baseKeymap } from 'prosemirror-commands';
import { history, undo } from 'prosemirror-history';
import Quill from 'quill';

window.sent = [];
const pm = new EditorView(document.querySelector('#pm'), {
  state: EditorState.create({
    schema,
    plugins: [history(), keymap({ Enter: (st) => { window.sent.push(st.doc.textContent); return true; }, 'Mod-z': undo }), keymap(baseKeymap)],
  }),
});
window.pmView = pm;
const q = new Quill('#quill', {
  modules: { keyboard: { bindings: { send: { key: 'Enter', shiftKey: false, handler: () => { window.sent.push(q.getText().trim()); return false; } } } } },
});
window.quill = q;
for (const id of ['ta', 'inp', 'ce']) {
  document.getElementById(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.defaultPrevented) {
      e.preventDefault();
      window.sent.push(id === 'ce' ? e.target.innerText.trim() : e.target.value);
    }
  });
}
window.fixtureReady = true;
