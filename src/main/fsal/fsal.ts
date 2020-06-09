import { EventEmitter } from "events";

// project imports
import { FileHash, IFileDesc, IDirectory, IDirEntry } from "@common/fileio";
import isFile from "@common/util/is-file";
import isDir from "@common/util/is-dir";

// fsal imports
import FSALWatchdog from "./fsal-watcher";
import * as FSALFile from "./fsal-file";
import * as FSALDir from "./fsal-dir";

////////////////////////////////////////////////////////////

export default class FSAL extends EventEmitter {

	private _projectDir:string;
	private _watchdog:FSALWatchdog;

	// open files
	private _state: {
		/** supports working from a single root directory */
		rootDirectory:IDirectory|null;
		/** any number of files can be open within the root dir */
		openFiles:IFileDesc[];
		/** the currently active file */
		activeFile:IFileDesc|null;
		/** the full filetree */
		fileTree: IDirEntry[];
	}

	// == CONSTRUCTOR =================================== //

	constructor(projectDir:string){
		super();

		this._projectDir = projectDir;
		this._watchdog = new FSALWatchdog(projectDir);

		this._state = {
			activeFile : null,
			openFiles  : [],
			rootDirectory: null,
			fileTree: []
		}
	}

	// == LIFECYCLE ===================================== //

	init(){
		console.log("fsal :: init()");
		this._watchdog.init();
	}

	// == EVENTS ======================================== //

	// == FILE / DIR LOADING ============================ //

	/**
	 * Opens, reads, and parses a file.
	 * @param filePath The file to be loaded.
	 * @emits fsal-state-changed (filetree)
	 */
	private async _loadFile(filePath:string):Promise<void> {
		let start:number = Date.now();
		let file:IFileDesc = await FSALFile.parseFile(filePath);
		this._state.fileTree.push(file);
		console.log(`${Date.now() - start} ms: Loaded file ${filePath}`) // DEBUG
		this.emit("fsal-state-changed", "filetree");
	}

	/**
	 * Loads the given directory recursively.
	 * @param dirPath The directory to be loaded.
	 * @emits fsal-state-changed (filetree)
	 */
	private async _loadDir(dirPath:string):Promise<void> {
		let start:number = Date.now();
		let dir:IDirectory = await FSALDir.parseDir(dirPath);
		this._state.fileTree.push(dir);
		console.log(`${Date.now() - start} ms: Loaded directory ${dirPath}`) // DEBUG
		this.emit("fsal-state-changed", "filetree");
	}

	/**
	 * Loads the given file or directory.
	 * @param p The directory to be loaded.
	 * @emits fsal-state-changed (filetree)
	 * @returns TRUE when successfully loaded, FALSE otherwise
	 */
	async loadPath(p:string){
		if(isFile(p)){
			await this._loadFile(p);
			this._watchdog.watch(p);
		} else if (isDir(p)) {
			await this._loadDir(p);
			this._watchdog.watch(p);
		} else {
			// path is neiter a file nor a directory!
			return false;
		}

		this.emit("fsal-state-changed", "filetree");
		return true;
	}

	// == ROOT DIRECTORY ================================ //

	/**
	 * Set the current working directory.
	 * @param dir Any valid root directory.
	 * @returns TRUE if successful, FALSE otherwise
	 * @emits fsal-state-changed
	 */
	setRootDirectory(dir:IDirectory):boolean {
		this._state.rootDirectory = dir;
		this.emit("fsal-state-changed", "rootDirectory");
		return true;
	}

	/**
	 * Get the current working directory.
	 */
	getRootDirectory():(IDirectory|null){
		return this._state.rootDirectory;
	}

	// == OPEN/CLOSE FILES ============================== //

	/** 
	 * Add a file to the list of currently open files.
	 * @param file the file descriptor
	 * @returns FALSE if the file was already open, else TRUE
	 * @emits fsal-state-changed
	 */
	openFile(file:IFileDesc):boolean {
		if(this._state.openFiles.includes(file)){ return false; }
		console.log("fsal :: opening file", file.path);
		this._state.openFiles.push(file);
		this.emit("fsal-state-changed", "openFiles")
		return true;
	}

	/** 
	 * Close a file that is currently open.
	 * @param file The file to close.
	 * @returns TRUE if successful, FALSE otherwise
	 * @emits fsal-state-changed
	 */
	closeFile(file:IFileDesc):boolean {
		if(this._state.openFiles.includes(file)){
			console.log("fsal :: closing file", file.path);
			this._state.openFiles.splice(this._state.openFiles.indexOf(file), 1)
			this.emit('fsal-state-changed', 'openFiles')
			return true;
		} else {
			return false;
		}
	}

	getOpenFiles():FileHash[] {
		return this._state.openFiles.map(file => file.hash);
	}

	getOpenFileByHash(hash:FileHash):(IFileDesc|null) {
		return this._state.openFiles.find(file => (file.hash == hash)) || null;
	}

	// == ACTIVE FILE =================================== //

	/**
	 * Set the currently active file.
	 * @returns TRUE if successful, FALSE otherwise
	 */
	setActiveFile(hash:FileHash):boolean {
		// get file associated with hash
		let file = this.getOpenFileByHash(hash);
		if(!file){
			console.error("fsal :: setActiveFile() :: failed, no open file with hash", hash);
			return false;
		}

		// mark active
		this._state.activeFile = file;
		this.emit("fsal-state-changed", "activeFile");
		return true;
	}

	getActiveFile():(IFileDesc|null) {
		return this._state.activeFile;
	}

}