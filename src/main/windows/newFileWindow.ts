import { Event, ipcMain as ipc, shell } from 'electron';
import { format as formatURL } from 'url';
import * as path from 'path';
import NoteworthyApp from '@main/app';
import Window from './window';

////////////////////////////////////////////////////////////

export default class NewFileWindow extends Window {
	
	/** @todo (9/13/20) what is name="main" for? */
	constructor(name="newFile", private _app:NoteworthyApp){
		super(name);
	}

	load(){	
		console.log("route :: load", __dirname);
		const route = this.name;

		// the `Environment.isDevelopment` flag is defined with a plugin in webpack.base.js
		// TODO enable development mode again
		if (false /*Environment.isDevelopment*/) {
			// TODO: Environment.wds was defined by electron-webpack -- we must replace it
			// const { protocol, hostname, port } = Environment.wds;
			// let url = `${protocol}://${hostname}:${port}?route=${route}`;
			// console.log("route :: development :: url", url);
			// this.window.loadURL(url);
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

	/* == Cleanup ======================================= */

	cleanup(){
		super.cleanup();
		ipc.removeListener("force-close", this.__forceClose);
	}

	/* == Events ======================================== */

	events(){
		super.events();

		this.attach__blur();
		this.attach__close();
		this.attach__focus();
		this.attach__forceClose();
		this.attach__fullscreenEnter();
		this.attach__fullscreenLeave();
		this.attach__navigateUrl();
	}

	// Attach / Detach ---------------------------------- */

	attach__blur = () => 
		{ this.window.on("blur", this.__blur); }

	attach__close = () =>
		{ this.window.on("close", this.__close); }
	detach__close = () =>
		{ this.window.removeListener("close", this.__close); }

	attach__focus = () =>
		{ this.window.on("focus", this.__focus); }

	attach__forceClose = () =>
		{ ipc.on("force-close", this.__forceClose); }

	attach__fullscreenEnter = () =>
		{ this.window.on("enter-full-screen", this.__fullscreenEnter); }

	attach__fullscreenLeave = () =>
		{ this.window.on("leave-full-screen", this.__fullscreenLeave); }

	attach__navigateUrl = () =>
		{ this.window.webContents.on("new-window", this.__navigateUrl); }

	// Event Handlers ----------------------------------- */

	__blur = () => {
		this.window.webContents.send("window-blur");
	}

	__close = (event: Event) => {
		console.log("main :: __close");
		// when this is true, the app has decided it's OK to quit
		if (global.isQuitting) { return; }
		// otherwise, we need to decide whether it's OK to quit
		event.preventDefault();
		this._app.handle("lifecycle", "requestAppQuit");
	}

	__focus = () => {
		this.window.webContents.send("window-focus");
	}

	__forceClose = () => {
		this.detach__close();
		this.window.close();
	}

	__fullscreenEnter = () => {
		this.window.webContents.send("window-fullscreen-set", true);
	}

	__fullscreenLeave = () => {
		this.window.webContents.send("window-fullscreen-set", false);
	}

	__navigateUrl = (event:Event, url:string) => {
		if (url === this.window.webContents.getURL()) { return; }
		event.preventDefault();
		shell.openExternal(url);
	}
}