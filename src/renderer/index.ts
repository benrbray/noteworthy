import Renderer from './render';

// library css
import "@benrbray/prosemirror-math/style/math.css";
import "@root/node_modules/prosemirror-view/style/prosemirror.css";
import "@root/node_modules/katex/dist/katex.min.css";
import "@root/node_modules/prosemirror-gapcursor/style/gapcursor.css";
import "./codicon/codicon.css";

// project css
import "./main.css";
import "./editor.css";

////////////////////////////////////////////////////////////

let renderer:Renderer;

window.onload = function(){
	renderer = new Renderer();
	renderer.init();
}