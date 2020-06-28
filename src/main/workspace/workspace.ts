import { IFileMeta, IFileDesc, IDirectory, IDirEntryMeta, readFile } from "@common/fileio";
import * as FSALFile from "../fsal/fsal-file";
import * as FSALDir from "../fsal/fsal-dir";
import * as pathlib from "path";
import fs from "fs";
import { IDisposable } from "@common/types";
import { WorkspaceProvider } from "@main/providers/provider";
import { markdownParser } from "@common/markdown";
import { FsalEvents, ChokidarEvents } from "@common/events";
import FSAL from "@main/fsal/fsal";
import { CrossRefProvider } from "@main/providers/crossref-provider";
import hash from "@common/util/hash";

interface IWorkspaceData {
	path: string,
	files: { [hash:string]: IFileMeta },
	pluginData: { [name: string]: any },
}

export class Workspace implements IDisposable {
	/** @todo (6/20/20)
	 * PROBLEM: if workspace folder is moved on disk, most workspace
	 * functionality will break and we will need to manually rerefresh
	 */

	// workspace info
	private _dir: IDirectory;

	// files
	private _files: { [hash: string]: IFileMeta };
	private _stale: boolean = true;

	/** plugins which need to know about changes to the workspace */
	private _plugins: WorkspaceProvider[];

	constructor(
		dir: IDirectory,
		files: { [hash: string]: IFileMeta } = {},
		plugins: WorkspaceProvider[] = []
	) {
		console.log("new Workspace() :: plugins =", plugins);
		this._dir = dir;
		this._files = files;
		this._plugins = plugins;
	}

	// -- Lifecycle ------------------------------------- //

	dispose(){
		delete this._dir;
	}

	close(persist:boolean = true){
		if(persist){ this.writeJSON(); }
		this.dispose();
	}

	// -- Getters / Setters ----------------------------- //

	get dataPath(){ return Workspace.getDataPath(this._dir.path); }
	get dir(){ return this._dir; };

	// -- Files ----------------------------------------- //

	getFileByHash(hash:string):IFileMeta|null {
		return this._files[hash] || null;
	}

	getFileTree(){
		let result: IDirEntryMeta[] = [];
		/** @todo (6/20/20) implement workspace iterator */
		for (let hash of Object.keys(this._files)) {
			let file = this.getFileByHash(hash);
			if (file !== null) { result.push(file); }
		}

		return result;
	}

	/**
	 * Called when the workspace should be re-synchronized
	 * with files on disk.  Notifies plugins of any changes.
	 */
	async update(): Promise<boolean> {
		// check for changes between workspace state and files on disk
		let currentFiles = FSALDir.getFlattenedFiles(this._dir);
		let fileChanges = this.compareFiles(currentFiles);

		// handle deletions
		for (let hash of fileChanges.deleted) {
			// get file metadata
			let file = this.getFileByHash(hash);
			if (file) { this.handleFileDeleted(file); }
		}

		// handle creations
		for (let hash of fileChanges.added) {
			// get file metadata
			let file: IFileMeta = currentFiles[hash];
			await this.handleFileChanged(file, true);
		}

		// handle changes
		for (let hash of fileChanges.changed) {
			// get file metadata
			let file: IFileMeta = currentFiles[hash];
			await this.handleFileChanged(file, false);
		}

		// write updated workspace data to disk
		let success = this.writeJSON();
		return success;
	}

	/**
	 * Called when the given path is stale and should be updated,
	 * including after a file is created, changed, or destroyed.
	 * @returns file metadata if exists, otherwise NULL
	 */
	async updatePath(filePath: string): Promise<IFileMeta | null> {
		/** @todo (6/19/20) check if path is a directory? */
		let file: IFileDesc | null = await FSALFile.parseFile(filePath);
		if (file === null) { return null; }

		// store file info in workspace
		let fileMeta: IFileMeta = FSALFile.getFileMetadata(file);
		this._files[file.hash] = fileMeta;
		return fileMeta;
	}

	// -- Events ---------------------------------------- //

	/**
	 * Called when a watched folder/file has changed.
	 */
	async handleChangeDetected(event:ChokidarEvents, info: {path:string}):Promise<void> {
		// file info
		let file = { path: info.path, hash: hash(info.path) };
		console.log("workspace :: handle chokidar ::", event, info.path);

		// directory changed
		if (event == ChokidarEvents.ADD_DIR) {
			/** @todo (6/19/20) handle chokidar add_dir */
			return;
		} else if (event == ChokidarEvents.UNLINK_DIR) {
			/** @todo (6/19/20) handle chokidar unlink_dir */
			return;
		}

		// notify workspace of file change
		/** @todo (6/27/20)
		 * the events below all call _workspace.updatePath() already
		 * can we safely remove the line below to avoid calling it twice?
		 */
		//await this.updatePath(info.path);

		// notify plugins
		if (event == ChokidarEvents.UNLINK_FILE) { this.handleFileDeleted(file); }
		else if (event == ChokidarEvents.CHANGE_FILE) { await this.handleFileChanged(file, false); }
		else if (event == ChokidarEvents.ADD_FILE) { await this.handleFileChanged(file, true); }
	}

	/**
	 * Called when a file has been changed in the workspace folder.
	 * @param file Metadata for the deleted file.
	 */
	handleFileDeleted(file: { path: string, hash: string }):void {
		/** @todo (6/19/20) determine if file actually belongs to workspace? */

		// notify plugins
		for (let plugin of this._plugins) {
			plugin.handleFileDeleted(file.path, file.hash);
		}

		// remove file metadata
		delete this._files[file.hash];
	}

	/**
	 * Called when a file has been created/changed in the workspace folder.
	 * Parses file contents and notifies plugins of the change.
	 * @param file The up-to-date file metadata.
	 * @param created set to TRUE if file did not previously exist
	 */
	async handleFileChanged(file: { path: string, hash: string }, created:boolean):Promise<void> {
		/** @todo (6/19/20) determine if file actually belongs to workspace? */

		// read file contents
		/** @todo (6/28/20) rather than reading EVERY file that changed,
		 * read a file only if a plugin requests its contents (based on ext/filename)
		 */
		let contents = readFile(file.path);
		if (contents === null) {
			throw new Error(`workspace :: handleFileCreated() :: error reading file :: ${file.path}`);
		}
		// parse file contents and notify plugins
		/** @todo (6/19/20) support wikilinks for other file types */
		let ext: string = pathlib.extname(file.path);
		if (ext == ".md" || ext == ".txt") {
			let doc = markdownParser.parse(contents);
			for (let plugin of this._plugins) {
				if(created){ plugin.handleFileCreated(file.path, file.hash, doc); }
				else       { plugin.handleFileChanged(file.path, file.hash, doc); }
			}
		}
		// add to workspace
		await this.updatePath(file.path);
	}

	// -- Plugins --------------------------------------- //

	registerPlugin(plugin: WorkspaceProvider): void {
		this._plugins.push(plugin);
	}

	unregisterWorkspacePlugin(plugin: WorkspaceProvider) {
		let index = this._plugins.indexOf(plugin);
		if (index > -1) { this._plugins.splice(index, 1); }
	}

	getPluginByName(name:"crossref_plugin"):CrossRefProvider|null;
	getPluginByName(name:string):WorkspaceProvider|null {
		/** @todo (6/28/20) use an ordered dict to store plugins instead? */
		return this._plugins.find(plugin => (plugin.provider_name == name)) || null;
	}

	// -- Serialization --------------------------------- //

	static getDataPath(workspacePath:string):string {
		return pathlib.join(workspacePath, ".noteworthy", "workspace.json");
	}

	static async fromJSON(workspacePath:string, json: string, plugins: WorkspaceProvider[]): Promise<Workspace | null> {
		/** @todo (6/27/20) validate incoming workspace/plugin json */
		let data: IWorkspaceData = JSON.parse(json);
		/** @todo (2/27/20) handle renamed workspace path */
		if(data.path !== undefined && workspacePath !== data.path){
			throw new Error("workspace path does not match path in data folder");
		}

		// get directory info
		let dir: IDirectory = await FSALDir.parseDir(workspacePath);

		if (!data.pluginData || !data.files) {
			console.error("Workspace.fromJSON() :: invalid data :: creating fresh workspace");
			return new Workspace(dir, {}, []);
		}

		// deserialize plugins
		let pluginState:any;
		for(let plugin of plugins){
			if(pluginState = data.pluginData[plugin.provider_name]){
				plugin.deserialize(pluginState);
			}
		}

		// construct workspace
		return new Workspace(dir, data.files, plugins);
	}

	static async fromPath(workspacePath:string, plugins:WorkspaceProvider[]):Promise<Workspace|null> {
		// read workspace data from file
		let contents = readFile(Workspace.getDataPath(workspacePath));
		if(!contents){ return null; }
		// parse workspace data
		return Workspace.fromJSON(workspacePath, contents, plugins);
	}

	/**
	 * Load workspace data for the given directory, assuming
	 * a `.noteworthy` data folder is present.
	 * @param dir Directory info object
	 * @param create If TRUE and no data folder found, a
	 *     new workspace will be created.
	 */
	static async fromDir(dir:IDirectory, plugins:WorkspaceProvider[], create:boolean = false):Promise<Workspace|null> {
		// restore existing workspace if data folder is present
		let workspace = await Workspace.fromPath(dir.path, plugins);
		if(!workspace && !create){ return null; }
		// create new workspace from directory
		return workspace || new Workspace(dir, undefined, plugins);
	}

	getData():IWorkspaceData {
		// serialize plugins
		let pluginData: { [name:string] : any } = {};
		for(let plugin of this._plugins){
			pluginData[plugin.provider_name] = plugin.serialize();
		}

		// serialize workspace
		return { path: this._dir.path, files: this._files, pluginData };
	}

	toJSON():string {
		return JSON.stringify(this.getData(), undefined, 2);
	}

	writeJSON(): boolean {
		let dataPath: string = this.dataPath;
		try {
			// ensure data directory exists
			let dirname = pathlib.dirname(dataPath)
			if (!fs.existsSync(dirname)) { fs.mkdirSync(dirname); }
			// write metadata
			fs.writeFileSync(dataPath, this.toJSON());
		} catch (err) {
			console.error("fsal :: error writing metadata", err);
			return false;
		}
		console.log("fsal :: workspace metadata saved to", dataPath);
		return true;
	}

	/** 
	 * Compare two flattened file lists and report any changes.
	 * (based on https://stackoverflow.com/revisions/33233053/6)
	 */
	compareFiles(filesB: { [hash: string]: IFileMeta }) {
		let filesA = this._files;
		let added: string[] = [];
		let deleted: string[] = [];
		let changed: string[] = [];
		let error: string[] = [];

		for (let hash of new Set([...Object.keys(filesA), ...Object.keys(filesB)])) {
			// handle keys in B but not A
			let a = filesA[hash];
			if (a === undefined) { added.push(hash); continue; }
			// handle keys in A but not B
			let b = filesB[hash];
			if (b === undefined) { deleted.push(hash); continue; }
			// handle keys in both
			let modA: number = a.modTime;
			let modB: number = b.modTime;
			if (modA > modB) { error.push(hash); }
			else if (modA < modB) { changed.push(hash); }
		}

		return { added, deleted, changed, error };
	}
}