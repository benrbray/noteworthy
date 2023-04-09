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

// @ts-ignore
import tikzJaxSource from "@lib/tikzjax/tikzjax.js"
import "@lib/tikzjax/tikzjax.css"

////////////////////////////////////////////////////////////

function loadTikzJax(doc: Document) {
	const s = document.createElement("script");
	s.id = "tikzjax";
	s.type = "text/javascript";
	s.innerText = tikzJaxSource;
	doc.body.appendChild(s);
}

////////////////////////////////////////////////////////////

let renderer:Renderer;

window.onload = function(){
	// tikzjax
	loadTikzJax(window.document);
	// renderer
	renderer = new Renderer();
	renderer.init();
}