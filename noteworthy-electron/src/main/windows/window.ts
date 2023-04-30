// import * as _ from 'lodash'; // TODO: remove lodash
// import { app, BrowserWindow, BrowserWindowConstructorOptions, ipcMain, IpcMainEvent } from "electron";
// import windowStateKeeper from 'electron-window-state';
// //import pkg from '@root/package.json';
// import Environment from '@common/environment';
// import { Settings } from '@common/settings';
// import { randomId } from '@common/util/random';
// import path from "path";

// ////////////////////////////////////////////////////////////////////////////////

// class Window {
// 	name:string;
// 	window: BrowserWindow = {} as BrowserWindow;
// 	options: BrowserWindowConstructorOptions;
// 	stateOptions: windowStateKeeper.Options;
// 	_didFocus:boolean = false;

// 	constructor(name: string, options: BrowserWindowConstructorOptions = {}, stateOptions: windowStateKeeper.Options = {}){
// 		this.name = name;
// 		this.options = options;
// 		this.stateOptions = stateOptions;
// 	}

// 	init(){
// 		this.initWindow();
// 		this.initDebug();

// 		this.load();
// 		this.events();
// 	}

// 	initWindow(){
// 		this.window = this.makeWindow();
// 	}

// 	initDebug(){
// 		if (!Environment.isDevelopment) return;

// 		this.window.webContents.on('devtools-opened', () => {
// 			this.window.focus();
// 			setImmediate(() => this.window.focus());
// 		});
// 	}

// 	makeWindow(id=this.name, options=this.options, stateOptions=this.stateOptions) {
// 		stateOptions = _.merge({
// 			file: `${id}.json`,
// 			defaultWidth: 600,
// 			defaultHeight: 600
// 		}, stateOptions);

// 		const state = windowStateKeeper(stateOptions),
// 			dimensions = _.pick(state, ['x', 'y', 'width', 'height']);

// 		/** @todo get rid of lodash */
// 		options = _.merge(dimensions, {
// 			frame: true,
// 			show: false,
// 			title: "Noteworthy",
// 			webPreferences: {
// 				nativeWindowOpen: true,
// 				webSecurity: true,
// 				sandbox: true,
// 				contextIsolation: true,
// 				preload: path.join(app.getAppPath(), '../preload/preload.js'),
// 			},
// 			icon: "assets/icon/noteworthy-icon-512.png"
// 		}, options);

// 		const mainWindow = new BrowserWindow(options);
// 		state.manage(mainWindow);

// 		// https://www.electronjs.org/docs/api/window-open
// 		mainWindow.webContents.setWindowOpenHandler(({ url }) => {
// 			console.log("window open handler", url);
// 			return {
// 				action: 'allow',
// 				overrideBrowserWindowOptions: {
// 					frame: true,
// 					fullscreenable: false,
// 					backgroundColor: 'black',
// 					webPreferences: {
// 						preload: path.join(__dirname, '../preload/preload.js')
// 					}
// 				}
// 			}
// 		});

// 		return mainWindow;
// 	}

// 	cleanup(){
// 		this.detach__closed();
// 		this.detach__didFinishLoad();
// 		this.detach__focus();
// 	}

// 	load(){ }

// 	// EVENTS //////////////////////////////////////////////

// 	events(){
// 		this.attach__didFinishLoad();
// 		this.attach__closed();
// 		this.attach__focus();
// 	}

// 	/**
// 	 * Wraps window.webContents.send() in a Promise. Expects the render
// 	 * process to send back a response after handling the message.
// 	 *
// 	 * This is needed because unlike `ipcRenderer`, electron `WebContents`
// 	 * has no invoke() method for when we expect a message result.
// 	 */
// 	async invoke<T>(channel:string, ...args:any[]):Promise<T> {
// 		return new Promise<T>((resolve, reject) => {
// 			// generate unique id for event
// 			let responseId = `RENDER_DID_HANDLE::${channel}::${randomId()}`;
// 			// send message from main --> render
// 			this.window.webContents.send(channel, responseId, ...args);
// 			// expect response -- promise won't resolve otherwise
// 			/** @todo (7/12/20) accept timeout (seconds) as argument? */
// 			ipcMain.once(responseId, (evt:IpcMainEvent, success:boolean, result:any) => {
// 				if(success) { resolve(result); }
// 				else        { reject(result);  }
// 			});
// 		});
// 	}

// 	// Attach / Detach Events ------------------------------

// 	attach__didFinishLoad = () =>
// 		{ this.window.webContents.on("did-finish-load", this.__didFinishLoad); }
// 	detach__didFinishLoad = () =>
// 		{ this.window.webContents.removeListener("did-finish-load", this.__didFinishLoad); }

// 	attach__closed = () =>
// 		{ this.window.on("closed", this.__closed); }
// 	detach__closed = () =>
// 		{ this.window.removeListener("closed", this.__closed); }

// 	attach__focus = () =>
// 		{ this.window.on("focus", this.__focused); }
// 	detach__focus = () =>
// 		{ this.window.removeListener("focus", this.__focused); }

// 	// Event Handlers --------------------------------------

// 	__didFinishLoad = () => {
// 		if(this._didFocus) return;
// 		this.window.show();
// 		this.window.focus();
// 	}

// 	__closed = () => {
// 		console.log("window :: closed");
// 		this.cleanup();
// 	}

// 	__focused = () => {
// 		this._didFocus = true;
// 	}
// }

// export default Window;
