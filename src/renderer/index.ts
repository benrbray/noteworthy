import Renderer from './render';

// other imports
import { Titlebar, Color } from "custom-electron-titlebar";
import path from "path";

// library css
import "@lib/prosemirror-math/style/math.css";
import "@root/node_modules/prosemirror-view/style/prosemirror.css";
import "@root/node_modules/katex/dist/katex.min.css";
import "@root/node_modules/prosemirror-gapcursor/style/gapcursor.css";
import "./codicon/codicon.css";

// project css
import "./main.css";
import "./editor.css";

////////////////////////////////////////////////////////////

let renderer:Renderer;

onload = function(){

	// create titlebar
	/*new Titlebar({
		backgroundColor: Color.fromHex("#DDDDDD")
	});*/

	renderer = new Renderer();
	renderer.init();

	/* HOT MODULE REPLACEMENT */

	if (module.hot) {

		module.hot.accept('./render', () => {
			require('./render').default();
		});

	}
}