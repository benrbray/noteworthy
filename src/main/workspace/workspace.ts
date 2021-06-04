// node imports
import * as pathlib from "path";

// project imports
import { IFileMeta, IDirectory, IDirEntryMeta, getFlattenedFiles } from "@common/files";
import { IDisposable } from "@common/types";
import { ChokidarEvents } from "@common/events";
import { IDoc } from "@common/doctypes/doctypes";
import hash from "@common/util/hash";
import { WorkspacePlugin } from "@main/plugins/plugin";
import { CrossRefPlugin } from "@main/plugins/crossref-plugin";
import { parseAST } from "@common/doctypes/parse-doc";
import { OutlinePlugin } from "@main/plugins/outline-plugin";
import { MetadataPlugin } from "@main/plugins/metadata-plugin";
import { WorkspaceService } from "./workspace-service";
import { FSAL } from "@main/fsal/fsal";

////////////////////////////////////////////////////////////

export interface IWorkspaceData {
	path: string,
	files: { [hash:string]: IFileMeta },
	pluginData: { [name: string]: any },
}

export class Workspace implements IDisposable {
	/** @todo (6/20/20)
	 * PROBLEM: if workspace folder is moved on disk, most workspace
	 * functionality will break and we will need to manually rerefresh
	 */

	/** plugins which need to know about changes to the workspace */
	private _plugins: WorkspacePlugin[];

	constructor(
		private _dir: IDirectory,
		private _files: { [hash: string]: IFileMeta } = {},
		plugins: WorkspacePlugin[] = [],
		private _workspaceService: WorkspaceService,
		/** TODO (2021-05-30) workspace shouldn't need FSAL -- move to WorkspaceService */
		private _fsal: FSAL
	) {
		// register plugins
		this._plugins = [];
		for(let plugin of plugins){
			this.registerPlugin(plugin);
		}
	}

	// -- Lifecycle ------------------------------------- //

	dispose(){
		// dispose plugins
		for(let plugin of this._plugins) {
			this.unregisterWorkspacePlugin(plugin);
			plugin.dispose();
		}
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
	 *
	 * TODO (2021-05-30) does workspace.update() work as intended?
	 *     it is currently only called immediately after workspace opens
	 */
	async update(): Promise<boolean> {
		// check for changes between workspace state and files on disk
		let currentFiles = getFlattenedFiles(this._dir);
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
		return this._workspaceService.writeJSON();
	}

	/**
	 * Updates the workspace entry for the given file.
	 */
	updatePath(fileMeta: IFileMeta): void {
		this._files[fileMeta.hash] = fileMeta;
	}

	// -- Events ---------------------------------------- //

	/**
	 * Called when a watched folder/file has changed.
	 */
	async handleChangeDetected(event:ChokidarEvents, info: {path:string}): Promise<void> {
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

		// notify plugins
		if      (event == ChokidarEvents.UNLINK_FILE) {       this.handleFileDeleted(file);        }
		else if (event == ChokidarEvents.CHANGE_FILE) { await this.handleFileChanged(file, false); }
		else if (event == ChokidarEvents.ADD_FILE)    { await this.handleFileChanged(file, true);  }
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
		// TODO (2021-05-30) move this function to workspace-service? */

		// add to workspace
		let fileMeta:IFileMeta|null = await this._workspaceService.updatePath(file.path);
		if(fileMeta == null){
			console.error(`workspace :: handleFileCreated() :: error reading file :: ${file.path}`);
			return this.handleFileDeleted(file);
		}

		/** @todo (6/28/20) rather than reading EVERY file that changed,
		 * read a file only if a plugin requests its contents (based on ext/filename)
		 */
		
		// read file contents
		let fileContents = this._fsal.readFile(fileMeta.path);
		if (fileContents === null) {
			console.error(`workspace :: handleFileCreated() :: error reading file :: ${file.path}`);
			return this.handleFileDeleted(file);
		}

		// parse file to ast
		let fileAst:IDoc|null = parseAST(fileMeta.ext, fileContents);
		if (fileAst === null) {
			console.error(`workspace :: handleFileCreated() :: error parsing file :: ${file.path}`);
			return this.handleFileDeleted(file);
		}

		// notify plugins of updated file
		for (let plugin of this._plugins) {
			if(created){ plugin.handleFileCreated(fileMeta, fileAst); }
			else       { plugin.handleFileChanged(fileMeta, fileAst); }
		}
	}

	// -- Plugins --------------------------------------- //

	registerPlugin(plugin: WorkspacePlugin): void {
		this._plugins.push(plugin);
	}

	unregisterWorkspacePlugin(plugin: WorkspacePlugin) {
		let index = this._plugins.indexOf(plugin);
		if (index > -1) { this._plugins.splice(index, 1); }
	}

	/** @todo fix typings for plugin by name? */
	getPluginByName(name:"crossref_plugin"):CrossRefPlugin|null;
	getPluginByName(name:"metadata_plugin"):MetadataPlugin|null;
	getPluginByName(name:"outline_plugin"):OutlinePlugin|null;
	getPluginByName(name:string):WorkspacePlugin|null;
	getPluginByName(name:string):WorkspacePlugin|null {
		/** @todo (6/28/20) use an ordered dict to store plugins instead? */
		return this._plugins.find(plugin => (plugin.plugin_name == name)) || null;
	}

	// -- Serialization --------------------------------- //

	static getDataPath(workspacePath:string):string {
		return pathlib.join(workspacePath, ".noteworthy", "workspace.json");
	}

	getData():IWorkspaceData {
		// serialize plugins
		let pluginData: { [name:string] : any } = {};
		for(let plugin of this._plugins){
			pluginData[plugin.plugin_name] = plugin.serialize();
		}

		// serialize workspace
		return { path: this._dir.path, files: this._files, pluginData };
	}

	toJSON():string {
		return JSON.stringify(this.getData(), undefined, 2);
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