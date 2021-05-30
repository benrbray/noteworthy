import { EventEmitter } from "events";
import { promises as fs, writeFileSync, readFileSync } from "fs";
import * as pathlib from "path";

// project imports
import hash from "@common/util/hash";
import isFile from "@common/util/is-file";
import isDir from "@common/util/is-dir";
import { ignoreDir } from "@common/util/ignore-dir";
import { ignoreFile } from "@common/util/ignore-file";
import { IFileDesc, IDirectory } from "@common/files";
import { FsalEvents, ChokidarEvents } from "@common/events";
import FSALWatchdog from "@main/fsal/fsal-watcher";
import { FSAL } from "@main/fsal/fsal";

////////////////////////////////////////////////////////////

const FsalNotInitializedError = () => { new Error("[fsal] not initialized!"); }
const FsalAlreadyInitializedError = () => { new Error("[fsal] cannot initialize twice"); }

////////////////////////////////////////////////////////////

export default class FSALSystem extends EventEmitter implements FSAL {

	private _resources: null|{
		watchdog:FSALWatchdog;
		globalWatchdog:FSALWatchdog;
	}

	// == CONSTRUCTOR =================================== //

	constructor(){
		super();
		this._resources = null;
		// bind event listeners
		this.handleChokidarEvent = this.handleChokidarEvent.bind(this);
		this.handleGlobalChokidarEvent = this.handleGlobalChokidarEvent.bind(this);
	}

	// == READ / SAVE =================================== //

	readFile(filePath: string): string | null {
		let fileText = null;
		try {
			fileText = readFileSync(filePath, { encoding: "utf8" });
		} catch (err) {
			console.log(err);
		}
		return fileText;
	}

	saveFile(filePath: string, fileText: string): void {
		console.log("saveFile ::", filePath, fileText);
		try {
			writeFileSync(filePath, fileText, 'UTF-8');
		} catch (err) {
			console.log(err);
		}
	}

	async createFile(path: string, contents: string = ""): Promise<void> {
		// normalize path (in an attempt to prevent different hashes for the same path)
		path = pathlib.normalize(path);
		// write file if doesn't exist
		return await fs.writeFile(path, contents, {flag : "wx" });
	}

	// == FILE / DIR METADATA =========================== //

	async parseDir(dirPath: string, parent: IDirectory | null = null): Promise<IDirectory> {
		let dir:IDirectory = {
			type: "directory",
			parent: parent,
			path: dirPath,
			name: pathlib.basename(dirPath),
			hash: hash(dirPath),
			children: [],
			modTime: 0
		}

		// retrieve directory metadata
		try {
			let stats = await fs.lstat(dir.path);
			dir.modTime = stats.ctimeMs;
		} catch (err){
			console.error(`fsal-dir :: error reading metadata for directory ${dir.path}`, err);
			throw err;
		}

		// parse directory contents recursively
		let children:string[] = await fs.readdir(dir.path);
		for(let child of children){

			/** @todo parse settings from .sptz-directory files */
			/** @todo ignore some files / directories */

			// file or directory?
			let absolutePath: string = pathlib.join(dir.path, child);
			let pathIsDir: boolean = isDir(absolutePath) && !ignoreDir(absolutePath);
			let pathIsFile: boolean = isFile(absolutePath) && !ignoreFile(absolutePath);

			// parse accordingly
			if(pathIsFile){
				let file:IFileDesc|null = await this.parseFile(absolutePath, dir);
				if(file) dir.children.push(file);
			} else if(pathIsDir){
				dir.children.push(await this.parseDir(absolutePath, dir));
			}
		}

		return dir;
	}

	async parseFile(filePath: string, parent: IDirectory | null = null): Promise<IFileDesc | null> {
		let file:IFileDesc = {
			type: "file",
			parent : parent,
			dirPath : pathlib.dirname(filePath),
			path: filePath,
			name : pathlib.basename(filePath),
			hash : hash(filePath),
			ext : pathlib.extname(filePath),
			contents : null,
			modTime: 0,
			creationTime: 0,
			//lineFeed: "\n"
		}

		// determine modify / creation time
		try {
			let stat = await fs.lstat(filePath);
			file.modTime = stat.mtimeMs;
			file.creationTime = stat.birthtimeMs;
		} catch(err) {
			console.error("fsal-file :: file error during lstat", filePath, err);
			return null;
		}

		return file;
	}

	// == LIFECYCLE ===================================== //

	async init(){
		console.log("fsal :: init()");
		if(this._resources) { throw FsalAlreadyInitializedError(); }

		this._resources = {
			watchdog       : new FSALWatchdog(/*ignoreDotfiles=*/true),
			globalWatchdog : new FSALWatchdog(/*ignoreDotfiles=*/false)
		}

		await this._resources.watchdog.init();
		this.attachEvents();
	}

	async close(){
		console.log("fsal :: destroy()");
		this._resources?.watchdog?.unwatchAll();
		this._resources?.watchdog?.destroy();
		this._resources?.globalWatchdog?.unwatchAll();
		this._resources?.globalWatchdog?.destroy();
		this.detachEvents();
		this.emit(FsalEvents.STATE_CHANGED, 'filetree');
	}

	// == EVENTS ======================================== //

	private attachEvents(){
		if(!this._resources) { throw FsalNotInitializedError(); }

		this._resources.watchdog.on(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent);
		this._resources.globalWatchdog.on(FsalEvents.CHOKIDAR_EVENT, this.handleGlobalChokidarEvent);
	}

	private detachEvents(){
		if(this._resources) {
			this._resources.watchdog.off(FsalEvents.CHOKIDAR_EVENT, this.handleChokidarEvent);
			this._resources.globalWatchdog.off(FsalEvents.CHOKIDAR_EVENT, this.handleGlobalChokidarEvent);
		}
	}

	private async handleChokidarEvent(event:ChokidarEvents, info:{path:string}):Promise<void> {
		console.log(`fsal :: chokidar-event :: ${event}`, info.path);

		// handle errors
		if (event == ChokidarEvents.ERROR) {
			throw new Error(`fsal :: chokidar error :: ${info}`);
		}
		
		// emit events
		this.emit(FsalEvents.CHOKIDAR_EVENT, event, info);
		this.emit(FsalEvents.STATE_CHANGED, "filetree");
	}

	private async handleGlobalChokidarEvent(event:ChokidarEvents, info:{path:string}):Promise<void> {
		console.log(`fsal :: global-chokidar-event :: ${event}`, info.path);

		// handle errors
		if (event == ChokidarEvents.ERROR) {
			throw new Error(`fsal :: chokidar error :: ${info}`);
		}
		
		// emit events
		this.emit(FsalEvents.GLOBAL_CHOKIDAR_EVENT, event, info);
	}

	// == WORKSPACE ===================================== //

	watch(p:string) { 
		if(!this._resources){ throw FsalNotInitializedError() };
		this._resources.watchdog.watch(p);
	}

	/** TODO (2021-05-30) FSAL.unwatch() is currently unused */
	unwatch(p:string) {
		if(!this._resources){ throw FsalNotInitializedError() };
		this._resources.watchdog.unwatch(p);
	}

	watchGlobal(p:string) {
		if(!this._resources){ throw FsalNotInitializedError() };
		this._resources.globalWatchdog.watch(p);
	}

	/** TODO (2021-05-30) FSAL.unwatchGlobal() is currently unused */
	unwatchGlobal(p:string) {
		if(!this._resources){ throw FsalNotInitializedError() };
		this._resources.globalWatchdog.unwatch(p);
	}
}