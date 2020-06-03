import * as _ from 'lodash'; // TODO: remove lodash
import * as path from "path";
import {BrowserWindow, BrowserWindowConstructorOptions} from "electron";
import { is } from "electron-util";
import windowStateKeeper from 'electron-window-state';
//import pkg from '@root/package.json';
import Environment from '@common/environment';
import Settings from '@common/settings';

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
		this.initMenu();

		this.load();
		this.events();
	}

	initWindow(){
		this.window = this.makeWindow();
	}

	initDebug(){
		if (!Environment.isDevelopment) return;

		this.window.webContents.openDevTools({
			mode: 'undocked'
		});

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

		options = _.merge(dimensions, {
			frame: !is.macos,
			backgroundColor: (Settings.get('theme') === 'light') ? '#F7F7F7' : '#0F0F0F', //TODO: This won't scale with custom themes
			show: false,
			title: "TypeRight", //pkg.productName,
			titleBarStyle: 'hiddenInset',
			webPreferences: {
				nodeIntegration: true,
				webSecurity: true
			}
		}, options);

		const win = new BrowserWindow(options);
		state.manage(win);

		return win;
	}

	cleanup(){
		this.window.removeAllListeners();
	}

	initMenu(){ }
	load(){ }

	// EVENTS //////////////////////////////////////////////

	events(){
		this.attach__didFinishLoad();
		this.attach__closed();
		this.attach__focus();
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
		this.initMenu();
	}
}

export default Window;