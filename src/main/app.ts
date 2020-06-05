import { app, ipcMain as ipc, Event, Menu, shell } from "electron";
import { enforceMacOSAppLocation, is } from 'electron-util';
import * as fs from "fs";
import Main from "./windows/main";
import Window from "./windows/window";
import MainIPC from "./MainIPC";

export default class App {
	window: Window | undefined;
	_ipc:MainIPC;

	constructor(){
		this._ipc = new MainIPC(this);

		this.init();
		this.events();
	}

	// INITIALIZATION //////////////////////////////////////

	init(){
		this._ipc.init();
		this.initContextMenu();
		this.initMenu();
	}

	initContextMenu(){}
	initMenu(){}
	async initDebug(){}

	quit(){
		console.log("app :: quit");
		global.isQuitting = true;
		this.detach__beforeQuit();
		app.quit();
	}

	load(){
		console.log("app :: load")
		this.window = new Main();
		this.window.init();
	}

	// EVENTS //////////////////////////////////////////////

	events() {
		this.attach__windowAllClosed();
		this.attach__activate();
		this.attach__beforeQuit();
		this.attach__forceQuit();
		this.attach__ready();
		this.attach__cwdChanged();
		this.attach__updaterCheck();
	}

	// Attach / Detach Events ------------------------------

	attach__windowAllClosed = () =>
		{ app.on("window-all-closed", this.__windowAllClosed); }

	attach__activate = () =>
		{ app.on("activate", this.__activate); }

	attach__beforeQuit = () => 
		{ app.on("before-quit", this.__beforeQuit); }
	detach__beforeQuit = () =>
		{ app.removeListener("before-quit", this.__beforeQuit); }

	attach__forceQuit = () => 
		{ ipc.on("force-quit", this.__forceQuit); }

	attach__ready = () => 
		{ app.on("ready", this.__ready); }

	attach__cwdChanged = () =>
		{ ipc.on("cwd-changed", this.__cwdChanged); }

	attach__updaterCheck = () =>
		{ ipc.on("updater-check", this.__updaterCheck); }

	// Event Handlers --------------------------------------

	__windowAllClosed = () => {
		if(is.macos){ return this.initMenu(); };
		this.quit();
	}

	__activate = () => {
		console.log("app :: __activate");
		if(this.window && this.window.window) return;
		this.load();
	}

	__beforeQuit = (event:Event) => {
		console.log("app :: __beforeQuit")
		if (!this.window || !this.window.window) { return; }
		// TODO: this line comes from Notable, but it seems to
		// prevent the application from actually closing.  Why was it here?
		//event.preventDefault();
		this.window.window.webContents.send("app-quit")
	}

	__forceQuit = () => {
		console.log("app :: __forceQuit")
		this.quit();
	}

	__ready = () => {
		enforceMacOSAppLocation();
		this.initDebug();
		this.load();
	}

	__cwdChanged = () => {
		if(this.window && this.window.window){
			this.window.window.once("closed", this.load.bind(this));
			this.window.window.close();
		} else {
			this.load();
		}
	}

	__updaterCheck = () => {
		// updater.removeAllListeners();

		// if (notifications === true) {

		// 	updater.on('update-available', () => Notification.show('A new update is available', 'Downloading it right now...'));
		// 	updater.on('update-not-available', () => Notification.show('No update is available', 'You\'re already using the latest version'));
		// 	updater.on('error', err => {
		// 		Notification.show('An error occurred', err.message);
		// 		Notification.show('Update manually', 'Download the new version manually to update the app');
		// 		shell.openExternal(pkg['download'].url);
		// 	});

		// }

		// updater.checkForUpdatesAndNotify();
	}
}