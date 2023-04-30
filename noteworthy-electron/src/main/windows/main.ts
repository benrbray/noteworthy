// electron
import { BrowserWindow, Event, ipcMain, IpcMainEvent } from 'electron';
import windowStateKeeper from 'electron-window-state';
import { is } from "@electron-toolkit/utils";

// node
import path from "path";

// noteworthy
import NoteworthyApp from '@main/app';
import { randomId } from "@common/util/random";

// assets
// @ts-ignore (vite asset)
import icon from '../../../resources/icon.png?asset'

////////////////////////////////////////////////////////////

export default class MainWindow {

	window: BrowserWindow;

	/* ==== CONSTRUCTOR =================================== */

	constructor(private _app:NoteworthyApp){

		// ---- window -----------------------------------------

		const mainWindow = new BrowserWindow({
			frame: true,
			width: 900,
			height: 760,
			show: false,
			icon: icon,
			title: "Noteworthy",
			webPreferences: {
				webSecurity: true,
				sandbox: true,
				contextIsolation: true,
				preload: path.join(__dirname, '../preload/preload.js'),
			},
			// icon: "assets/icon/noteworthy-icon-512.png"
		});

		this.window = mainWindow;

		mainWindow.on('ready-to-show', () => {
			mainWindow.show()
		})

		// hot module reloading from electron-vite
		if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
			mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
		} else {
			mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
		}

		// ---- events -----------------------------------------

		this.window.on("close", this.handleClose);
	}

	/* ==== IPC =========================================== */

	async invoke<T>(channel:string, ...args:any[]):Promise<T> {
		return new Promise<T>((resolve, reject) => {
			// generate unique id for event
			let responseId = `RENDER_DID_HANDLE::${channel}::${randomId()}`;
			// send message from main --> render
			this.window.webContents.send(channel, responseId, ...args);
			// expect response -- promise won't resolve otherwise
			/** @todo (7/12/20) accept timeout (seconds) as argument? */
			ipcMain.once(responseId, (evt: IpcMainEvent, success:boolean, result:any) => {
				if(success) { resolve(result); }
				else        { reject(result);  }
			});
		});
	}

	/* ==== EVENTS ======================================== */

	handleClose = (event: Event) => {
		console.log("main :: handleClose");
		// when this is true, the app has decided it's OK to quit
		// if (global.isQuitting) { return; }
		// // otherwise, we need to decide whether it's OK to quit
		// event.preventDefault();
		// this._app.handle("lifecycle", "requestAppQuit");
	}

}

////////////////////////////////////////////////////////////

// class MainWindowOld extends Route {

// 	/** @todo (9/13/20) what is name="main" for? */
// 	constructor(name="main", private _app:NoteworthyApp){
// 		super(name);
// 	}

// 	load(){
// 		super.load();
// 		setTimeout(this.__didFinishLoad, 500);
// 	}

// 	/* == Cleanup ======================================= */

// 	cleanup(){
// 		super.cleanup();
// 		ipcMain.removeListener("force-close", this.__forceClose);
// 	}

// 	/* == Events ======================================== */

// 	events(){
// 		super.events();

// 		this.attach__blur();
// 		this.attach__close();
// 		this.attach__focus();
// 		this.attach__forceClose();
// 		this.attach__fullscreenEnter();
// 		this.attach__fullscreenLeave();
// 		this.attach__navigateUrl();
// 	}

// 	// Attach / Detach ---------------------------------- */

// 	attach__blur = () =>
// 		{ this.window.on("blur", this.__blur); }

// 	attach__close = () =>
// 		{ this.window.on("close", this.__close); }
// 	detach__close = () =>
// 		{ this.window.removeListener("close", this.__close); }

// 	attach__focus = () =>
// 		{ this.window.on("focus", this.__focus); }

// 	attach__forceClose = () =>
// 		{ ipcMain.on("force-close", this.__forceClose); }

// 	attach__fullscreenEnter = () =>
// 		{ this.window.on("enter-full-screen", this.__fullscreenEnter); }

// 	attach__fullscreenLeave = () =>
// 		{ this.window.on("leave-full-screen", this.__fullscreenLeave); }

// 	attach__navigateUrl = () => {
// 		this.window.webContents.setWindowOpenHandler(this.__navigateUrl)
// 	}

// 	// Event Handlers ----------------------------------- */

// 	__blur = () => {
// 		this.window.webContents.send("window-blur");
// 	}

// 	__close = (event: Event) => {
// 		console.log("main :: __close");
// 		// when this is true, the app has decided it's OK to quit
// 		if (global.isQuitting) { return; }
// 		// otherwise, we need to decide whether it's OK to quit
// 		event.preventDefault();
// 		this._app.handle("lifecycle", "requestAppQuit");
// 	}

// 	__focus = () => {
// 		this.window.webContents.send("window-focus");
// 	}

// 	__forceClose = () => {
// 		this.detach__close();
// 		this.window.close();
// 	}

// 	__fullscreenEnter = () => {
// 		this.window.webContents.send("window-fullscreen-set", true);
// 	}

// 	__fullscreenLeave = () => {
// 		this.window.webContents.send("window-fullscreen-set", false);
// 	}

// 	__navigateUrl = (details: Electron.HandlerDetails) => {
// 		if (details.url === this.window.webContents.getURL()) {
// 			return { "action": "deny" as const };
// 		}
// 		// TODO (Ben @ 2023/03/01) is this working properly? if so, delete comment
// 		//shell.openExternal(url);
// 		return { "action" : "allow" as const }
// 	}
// }
