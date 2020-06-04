import Renderer from './render';

import "./main.css";

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