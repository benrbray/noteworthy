import * as _ from 'lodash'; // TODO: remove lodash
import {BrowserWindow, BrowserWindowConstructorOptions, ipcMain, IpcMainEvent} from "electron";
import windowStateKeeper from 'electron-window-state';
//import pkg from '@root/package.json';
import Environment from '@common/environment';
import Settings from '@common/settings';
import { randomId } from '@common/util/random';

class Window {
	name:string;
	window: BrowserWindow = {} as BrowserWindow;
	options: BrowserWindowConstructorOptions;
	stateOptions: windowStateKeeper.Options;
	_didFocus:boolean = false;
	
	constructor(name: string, options: BrowserWindowConstructorOptions = {}, stateOptions: windowStateKeeper.Options = {}){
		this.name = name;
		this.options = options;
		this.stateOptions = stateOptions;
	}

	init(){
		this.initWindow();
		this.initDebug();

		this.load();
		this.events();
	}

	initWindow(){
		this.window = this.makeWindow();
	}

	initDebug(){
		if (!Environment.isDevelopment) return;

		this.window.webContents.openDevTools();

		this.window.webContents.on('devtools-opened', () => {
			this.window.focus();
			setImmediate(() => this.window.focus());
		});
	}

	makeWindow(id=this.name, options=this.options, stateOptions=this.stateOptions) {
		stateOptions = _.merge({
			file: `${id}.json`,
			defaultWidth: 600,
			defaultHeight: 600
		}, stateOptions);

		const state = windowStateKeeper(stateOptions),
			dimensions = _.pick(state, ['x', 'y', 'width', 'height']);

		/** @todo get rid of lodash */
		options = _.merge(dimensions, {
			frame: true, //!is.macos,
			show: false,
			title: "Noteworthy", //pkg.productName,
			//titleBarStyle: 'hiddenInset',
			webPreferences: {
				nodeIntegration: true,
				webSecurity: true
			},
			icon: "assets/icon/nwt_large.png"
		}, options);

		const win = new BrowserWindow(options);
		state.manage(win);

		return win;
	}

	cleanup(){
		this.window.removeAllListeners();
	}

	load(){ }

	// EVENTS //////////////////////////////////////////////

	events(){
		this.attach__didFinishLoad();
		this.attach__closed();
		this.attach__focus();
	}

	/**
	 * Wraps window.webContents.send() in a Promise. Expects the render
	 * process to send back a response after handling the message.
	 * 
	 * This is needed because unlike `ipcRenderer`, electron `WebContents`
	 * has no invoke() method for when we expect a message result.  See:
	 *
	 *
	 */
	async invoke<T>(channel:string, ...args:any[]):Promise<T> {
		return new Promise<T>((resolve, reject) => {
			// generate unique id for event
			let responseId = `RENDER_DID_HANDLE::${channel}::${randomId()}`;
			// send message from main --> render
			this.window.webContents.send(channel, responseId, ...args);
			// expect response -- promise won't resolve otherwise
			/** @todo (7/12/20) accept timeout (seconds) as argument? */
			ipcMain.once(responseId, (evt:IpcMainEvent, success:boolean, result:any) => {
				if(success) { resolve(result); }
				else        { reject(result);  }
			});
		});
	}

	// Attach / Detach Events ------------------------------

	attach__didFinishLoad = () =>
		{ this.window.webContents.on("did-finish-load", this.__didFinishLoad); }

	attach__closed = () =>
		{ this.window.on("closed", this.__closed); }

	attach__focus = () =>
		{ this.window.on("focus", this.__focused); }

	// Event Handlers --------------------------------------

	__didFinishLoad = () => {
		if(this._didFocus) return;
		this.window.show();
		this.window.focus();
	}

	__closed = () => {
		console.log("window :: closed");
		this.cleanup();
		delete this.window;
	}

	__focused = () => {
		this._didFocus = true;
	}
}

export default Window;