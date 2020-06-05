import Renderer from './render';

import "./main.less";
import "@root/node_modules/prosemirror-view/style/prosemirror.css";
import "@root/node_modules/katex/dist/katex.min.css";

/* RENDERER */

let renderer:Renderer;

onload = function(){

	renderer = new Renderer();
	renderer.init();

	/* HOT MODULE REPLACEMENT */

	if (module.hot) {

		module.hot.accept('./render', () => {
			require('./render').default();
		});

	}
}