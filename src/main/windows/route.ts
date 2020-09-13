
/* IMPORT */

import * as path from 'path';
import { format as formatURL } from 'url';
import Environment from '@common/environment';
import Settings from '@common/settings';
import Window from './window';

/* ROUTE */

class Route extends Window {

	load() {
		console.log("route :: load", __dirname)
		const route = this.name;

		if (Environment.isDevelopment) {
			const { protocol, hostname, port } = Environment.wds;
			this.window.loadURL(`${protocol}://${hostname}:${port}?route=${route}`);
		} else {
			this.window.loadURL(formatURL({
				pathname: path.join(__dirname, 'index.html'),
				protocol: 'file',
				slashes: true,
				query: {
					route,
				}
			}));
		}
	}

}

/* EXPORT */

export default Route;