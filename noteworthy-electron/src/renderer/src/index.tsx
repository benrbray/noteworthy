import Renderer from './render';

// library css
import "@benrbray/prosemirror-math/style/math.css";
import "prosemirror-view/style/prosemirror.css";
import "katex/dist/katex.min.css";
import "prosemirror-gapcursor/style/gapcursor.css";
import "./codicon/codicon.css";

// project css
import "./assets/main.css";
import "./assets/editor.css";

import { foo } from "@noteworthy/editor";
const x = foo;

////////////////////////////////////////////////////////////

import { render } from "solid-js/web";

window.onload = function() {
  // let renderer: Renderer = new Renderer();
  // renderer.init();
	foo();
	let elt = document.getElementById("main") as HTMLElement;
	render(() => <div>foo</div>, elt);
}
