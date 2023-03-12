import { Event, ipcMain as ipc, shell } from 'electron';
import Route from './route';
import NoteworthyApp from '@main/app';

////////////////////////////////////////////////////////////

export default class MainWindow extends Route {
	
	/** @todo (9/13/20) what is name="main" for? */
	constructor(name="main", private _app:NoteworthyApp){
		super(name);
	}

	load(){
		super.load();
		setTimeout(this.__didFinishLoad, 500);
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

	attach__navigateUrl = () => {
		this.window.webContents.setWindowOpenHandler(this.__navigateUrl)
	}

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

	__navigateUrl = (details: Electron.HandlerDetails) => {
		if (details.url === this.window.webContents.getURL()) {
			return { "action": "deny" as const };
		}
		// TODO (Ben @ 2023/03/01) is this working properly? if so, delete comment
		//shell.openExternal(url);
		return { "action" : "allow" as const }
	}
}