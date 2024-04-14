import Renderer from './render';

// library css
import "@benrbray/prosemirror-math/dist/prosemirror-math.css";
import "prosemirror-view/style/prosemirror.css";
import "katex/dist/katex.min.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "./codicon/codicon.css";

// project css
import "./assets/main.css";
import "./assets/editor.css";

////////////////////////////////////////////////////////////

window.onload = function() {
  let renderer: Renderer = new Renderer();
  renderer.init();
}
