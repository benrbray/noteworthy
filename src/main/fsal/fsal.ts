import { EventEmitter } from "events";
import fs from "fs";
import * as pathlib from "path";

// project imports
import { IDirEntry } from "@common/fileio";
import { FsalEvents, ChokidarEvents } from "@common/events";
import FSALWatchdog from "./fsal-watcher";

////////////////////////////////////////////////////////////

export default class FSAL extends EventEmitter {

	private _watchdog:FSALWatchdog;

	// open files
	private _state: {
		/** the full filetree */
		fileTree: IDirEntry[];
	}

	// == CONSTRUCTOR =================================== //

	constructor(){
		super();
		this._watchdog = new FSALWatchdog();
		this._state = { fileTree: [] }

		// bind event listeners
		this.handleChokidarEvent = this.handleChokidarEvent.bind(this);
	}

	// == LIFECYCLE ===================================== //

	async init(){
		console.log("fsal :: init()");
		this._watchdog.init();
		this.attachEvents();
	}

	async destroy(){
		console.log("fsal :: destroy()");
		this._watchdog.destroy();
		this.detachEvents();
	}

	// == EVENTS ======================================== //

	attachEvents(){
		this._watchdog.on(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent);
	}

	detachEvents(){
		this._watchdog.off(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent);
	}

	async handleChokidarEvent(event:ChokidarEvents, info:{path:string}):Promise<void> {
		console.log(`fsal :: chokidar-event :: ${event}`, info.path);

		// handle errors
		if (event == ChokidarEvents.ERROR) {
			throw new Error(`fsal :: chokidar error :: ${info}`);
		}
		
		// emit events
		this.emit(FsalEvents.CHOKIDAR_EVENT, event, info);
		this.emit(FsalEvents.STATE_CHANGED, "filetree");
	}

	// == FILE / DIR UNLOADING ========================== //

	unloadAll():void {
		for(let p of Object.keys(this._state.fileTree)){
			this._watchdog.unwatch(p);
		}

		this._state.fileTree = [];
		this.emit(FsalEvents.STATE_CHANGED, 'filetree')
	}

	// == WORKSPACE ===================================== //

	watch(p:string){ this._watchdog.watch(p); }
	unwatch(p:string){ this._watchdog.unwatch(p); }

	// == OPEN/CLOSE FILES ============================== //

	async createFile(path: string, contents: string = ""): Promise<void> {
		// normalize path (in an attempt to prevent different hashes for the same path)
		path = pathlib.normalize(path);
		// write file if doesn't exist
		return fs.promises.writeFile(path, contents, {flag : "wx" });
	}
}