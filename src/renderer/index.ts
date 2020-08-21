import Renderer from './render';

// other imports
import { Titlebar, Color } from "custom-electron-titlebar";
import path from "path";

// css
import "./main.css";
import "./editor.css";
import "./codicon/codicon.css";
import "@root/node_modules/prosemirror-view/style/prosemirror.css";
import "@root/node_modules/katex/dist/katex.min.css";
import "@root/node_modules/prosemirror-gapcursor/style/gapcursor.css";
import "@lib/prosemirror-math/style/math.css";

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