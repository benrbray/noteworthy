
/* IMPORT */

import * as path from 'path';
import { format as formatURL } from 'url';
import Environment from '@common/environment';
import { Settings } from '@common/settings';
import Window from './window';

/* ROUTE */

class Route extends Window {

	load() {
		console.log("route :: load", __dirname)
		const route = this.name;

		// the `Environment.isDevelopment` flag is defined with a plugin in webpack.base.js
		if (Environment.isDevelopment) {
			const { protocol, hostname, port } = Environment.wds;
			let url = `${protocol}://${hostname}:${port}?route=${route}`;
			console.log("route :: development :: url", url);
			this.window.loadURL(url);
		} else {
			let url = formatURL({
				pathname: path.join(__dirname, "../renderer/index.html"),
				protocol: 'file',
				slashes: true,
				query: {
					route,
				}
			})
			console.log("route :: production :: url", url);
			this.window.loadURL(url);
		}
	}

}

/* EXPORT */

export default Route;