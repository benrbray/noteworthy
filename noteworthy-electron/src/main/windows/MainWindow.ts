// electron
import { shell, BrowserWindow, Event, ipcMain, IpcMainEvent } from 'electron';
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

		mainWindow.webContents.setWindowOpenHandler((details) => {
			// TODO (Ben @ 2023/05/04) this was copied from vite-electron
			shell.openExternal(details.url);
			return { action: 'deny' };
		});

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
		if (global.isQuitting) { return; }
		// otherwise, we need to decide whether it's OK to quit
		event.preventDefault();
		this._app.handle("lifecycle", "requestAppQuit");
	}

}
