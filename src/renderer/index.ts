import Renderer from './render';

// css
import "./main.less";
import "@root/node_modules/prosemirror-view/style/prosemirror.css";
import "@root/node_modules/katex/dist/katex.min.css";
import "@lib/prosemirror-math/style/math.css";

////////////////////////////////////////////////////////////

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