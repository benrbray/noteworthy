// electron imports
import { dialog, shell } from "electron";

// node imports
import * as pathlib from "path";

// noteworthy imports
import { FSAL } from "./fsal/fsal";
import NoteworthyApp from "./app"
import { IFileWithContents, IPossiblyUntitledFile, IDirEntryMeta, IFileMeta } from "@common/files";
import { DialogSaveDiscardOptions } from "@common/dialog";
import { to } from "@common/util/to";
import { filterNonVoid } from "@common/util/non-void";
import { WorkspaceService } from "./workspace/workspace-service";
import { ThemeService } from "./theme/theme-service";
import { PluginService } from "./plugins/plugin-service";
import { IOutline } from "./plugins/outline-plugin";
import { ITagSearchResult, SearchResult, IFileSearchResult, IHashSearchResult, CrossRefPlugin } from "./plugins/crossref-plugin";
import { WorkspacePlugin } from "./plugins/plugin";
import { IMetadata } from "./plugins/metadata-plugin";
import { getFileMetadata } from "@common/files";

////////////////////////////////////////////////////////////////////////////////

declare global {
	namespace Noteworthy {
		export interface MainIpcHandlers {
			// plugins can add additional handler types by
			// augmenting this interface with type declarations
		}
	}
}

export interface DefaultMainIpcHandlers {
	lifecycle:  MainIpc_LifecycleHandlers;
	file:       MainIpc_FileHandlers;
	theme:      MainIpc_ThemeHandlers;
	shell:      MainIpc_ShellHandlers;
	dialog:     MainIpc_DialogHandlers;
	tag:        MainIpc_TagHandlers;
	outline:    MainIpc_OutlineHandlers;
	metadata:   MainIpc_MetadataHandlers;
	navigation: MainIpc_NavigationHandlers;
};

export type MainIpcHandlers = Noteworthy.MainIpcHandlers & DefaultMainIpcHandlers
export type MainIpcChannelName = keyof MainIpcHandlers;

export interface MainIpcChannel {
	readonly name: MainIpcChannelName;
}

//// LIFECYCLE /////////////////////////////////////////////

export class MainIpc_LifecycleHandlers implements MainIpcChannel {

	get name() { return "lifecycle" as const; }

	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(private _app:NoteworthyApp){ }

	// -- Quit ------------------------------------------ //

	async requestAppQuit():Promise<void>{
		/** @todo (7/12/20) handle multiple windows? multiple files open? */
		if(this._app._renderProxy){
			// attempt to close active editors/windows
			let [err, result] = await to<string>(this._app._renderProxy.requestClose());
			// ok if promise rejects because user cancelled shutdown
			if(err == "Cancel"){ return; }
			// anything else is an error
			else if(err){ return Promise.reject(err); }
		}
		// close app
		this._app.quit();
	}
}

//// FILE SYSTEM ///////////////////////////////////////////

export class MainIpc_FileHandlers implements MainIpcChannel {
	get name() { return "file" as const; }

	constructor(
		private _app: NoteworthyApp,
		private _fsal: FSAL,
		private _workspaceService: WorkspaceService
	){ }

	// -- Request File Create --------------------------- //

	async requestFileCreate(path:string, contents:string=""):Promise<IFileMeta|null> {
		/** @todo (6/26/20) check if path in workspace? */
		return this._workspaceService.createFile(path, contents);
	}

	// -- Request File Save ----------------------------- //

	async requestFileSave(file: IFileWithContents): Promise<boolean> {
		if (!this._app.window) { return false; }

		await this._fsal.saveFile(file.path, file.contents, false);
		/** @todo (7/12/20) check for file save errors? */
		this._app._renderProxy?.fileDidSave({saveas: false, path: file.path });
		return true;
	}

	// -- Request File Open ----------------------------- //

	async requestFileContents(fileInfo: { hash?: string }):Promise<IFileWithContents|null> {
		let { hash } = fileInfo;
		// validate input
		if (hash === undefined) {
			throw new Error("MainIPC :: requestFileContents() :: no file path or hash provided");
		}

		// load from hash
		let fileMeta: IFileMeta | null;
		if (hash === undefined || !(fileMeta = this._workspaceService.getFileByHash(hash))) {
			/** @todo (6/20/20) load from arbitrary path */
			console.log(hash, hash && this._workspaceService.getFileByHash(hash));
			throw new Error("file loading from arbitrary path not implemented");
		}

		// read file contents
		const fileContents: string | null = this._fsal.readFile(fileMeta.path);
		if (fileContents === null) { throw new Error("MainIPC :: failed to read file"); }

		let file: IFileWithContents = {
			parent: null,
			contents: fileContents,
			...fileMeta
		}

		return file;
	}
}

//// DIALOG ////////////////////////////////////////////////

export class MainIpc_DialogHandlers implements MainIpcChannel {

	get name() { return "dialog" as const; }

	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(
		private _app: NoteworthyApp,
		private _fsal: FSAL,
		private _workspaceService: WorkspaceService
	){ }

	// -- Show Notification ----------------------------- //

	showNotification(msg: string) {
		/** @todo (6/26/20) implement notifications */
	}

	showError(msg: string) {
		/** @todo (6/26/20) implement error notifications */
	}

	// -- Request Folder Open --------------------------- //

	dialogFolderOpen() {
		if (!this._app.window) { return; }

		// open file dialog
		const dirPaths: string[] | undefined = dialog.showOpenDialogSync(
			this._app.window.window,
			{
				properties: ['openDirectory', 'createDirectory'],
				//filters: FILE_FILTERS
			}
		);
		if (!dirPaths || !dirPaths.length) return;

		this._workspaceService.setWorkspaceDir(dirPaths[0]);
	}

	// -- Request File Open ----------------------------- //

	dialogFileOpen() {
		if (!this._app.window) { return; }

		// open file dialog
		const filePaths: string[] | undefined = dialog.showOpenDialogSync(
			this._app.window.window,
			{
				properties: ['openFile'],
				//filters: FILE_FILTERS
			}
		);
		// if no path selected, do nothing
		if (!filePaths || !filePaths.length) return;

		throw new Error("MainIpc_DialogHandlers :: opening individual file from path is not implemented");

		// load file from path
		//this._navigationHandlers.requestFileOpen({ path: filePaths[0] })
	}

	// -- Dialog File Create ---------------------------- //

	async dialogFileNew(): Promise<void> {
		if (!this._app.window) { return Promise.reject("no active window"); }

		// default "new file" path
		const workspaceDir = this._workspaceService.getWorkspaceDir();

		const newFilePath: string | undefined = dialog.showSaveDialogSync(
			this._app.window.window,
			{
				title: "New Document",
				buttonLabel: "New Document",
				properties: ["showOverwriteConfirmation"],
				...(workspaceDir && { defaultPath: workspaceDir.path })
			}
		);
		if (!newFilePath) { return Promise.reject("no file path specified"); }

		// create and open new file
		let newFile = await this._workspaceService.createFile(newFilePath, "");
		if(!newFile) { return Promise.reject("failed to create new file"); }

		return this._app._eventHandlers.navigation.navigateToHash({ hash: newFile.hash });
	}

	// -- Dialog File Save As --------------------------- //

	async dialogFileSaveAs(file: IPossiblyUntitledFile): Promise<string | null> {
		if (!this._app.window) { return null; }

		const newFilePath: string | undefined = dialog.showSaveDialogSync(
			//TODO: better default "save as" path?
			this._app.window.window,
			{
				defaultPath: file.path || "",
				//filters: FILE_FILTERS
			}
		);
		if (!newFilePath) return null;
		this._fsal.saveFile(newFilePath, file.contents, false);

		// send new file path to renderer
		this._app._renderProxy?.fileDidSave({ saveas: true, path: newFilePath});
		return newFilePath;
	}

	// -- Ask Save/Discard Changes ---------------------- //

	/** @todo (7/12/20) better return type? extract array type? **/
	async askSaveDiscardChanges(filePath: string): Promise<typeof DialogSaveDiscardOptions[number]> {
		if (!this._app.window) { throw new Error("no window open! cannot open dialog!"); }
		let response = await dialog.showMessageBox(this._app.window.window, {
			type: "warning",
			title: "Warning: Unsaved Changes",
			message: `File (${filePath}) contains unsaved changes.`,
			buttons: Array.from(DialogSaveDiscardOptions),
			defaultId: DialogSaveDiscardOptions.indexOf("Save"),
			cancelId: DialogSaveDiscardOptions.indexOf("Cancel"),
		})
		return DialogSaveDiscardOptions[response.response];
	}
}

////////////////////////////////////////////////////////////


export class MainIpc_ThemeHandlers implements MainIpcChannel {
	
	get name() { return "theme" as const; }

	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(private _themeService:ThemeService){ }

	async requestThemeRefresh() {
		this._themeService.setTheme();
	}
}

export class MainIpc_TagHandlers implements MainIpcChannel {
	
	get name() { return "tag" as const; }

	/** @todo (9/13/20) break app into multiple parts so we don't need to consume the whole thing */
	constructor(
		private _app:NoteworthyApp,
		private _workspaceService:WorkspaceService,
		private _pluginService:PluginService
	){ }
	
	/**
	 * Return a list of files which mention the query tag.
	 * @param query The tag to search for.
	 */
	async tagSearch(query:string):Promise<IFileMeta[]> {
		// get active plugin
		let plugin = this._pluginService.getWorkspacePluginByName("crossref_plugin");
		if(!plugin){ return []; }
		// tag search
		const hashes:string[]|null = plugin.getTagMentions(query);
		if(hashes === null){ return []; }
		return filterNonVoid( hashes.map(hash => (this._workspaceService.getFileByHash(hash))) );
	}
	
	/**
	 * Return a list of files which mention any tags defined
	 * by the document corresponding to the given hash.
	 * Useful for generating a list of backlinks.
	 * @param query The tag to search for.
	 */
	async backlinkSearch(hash:string):Promise<IFileMeta[]> {
		// get active plugin
		let plugin = this._pluginService.getWorkspacePluginByName("crossref_plugin");
		if(!plugin){ return []; }
		// tag search
		const hashes:string[]|null = plugin.getBacklinksForDoc(hash);
		if(hashes === null){ return []; }
		return filterNonVoid( hashes.map(hash => (this._workspaceService.getFileByHash(hash))) );
	}

	/**
	 * Return a list of tags which approximately match the query.
	 * @param query The tag to search for.
	 */
	async fuzzyTagSearch(query:string):Promise<ITagSearchResult[]> {
		// get active plugin
		let plugin = this._pluginService.getWorkspacePluginByName("crossref_plugin");
		if(!plugin){ return []; }
		// tag search
		return plugin.fuzzyTagSearch(query);
	}

	async fuzzyTagFileSearch(query:string):Promise<(ITagSearchResult|IFileSearchResult)[]> {
		// get active plugin
		let maybePlugin = this._pluginService.getWorkspacePluginByName("crossref_plugin");
		if(!maybePlugin){ return []; }
		let plugin:CrossRefPlugin = maybePlugin;

		// fuzzy tag search
		let tagResults:ITagSearchResult[] = plugin.fuzzyTagSearch(query);

		// find all documents which mention one of the matching tags
		let fileHashes = new Set<string>();
		
		// get unique hashes for files mentioning this tag
		tagResults
			.flatMap( result => plugin.getTagMentions(result.result) )
			.forEach( hash => fileHashes.add(hash) );

		
		let docResults:IFileSearchResult[] = [];
		fileHashes.forEach( hash => {
			let fileMeta:IFileMeta | null = this._workspaceService.getFileByHash(hash);
			if(fileMeta !== null){
				docResults.push({ type: "file-result", file: fileMeta });
			}
		});
		
		let results:(IFileSearchResult|ITagSearchResult)[] = [];
		return results.concat(tagResults, docResults);
	}

	async getHashForTag(data: { tag: string, create: boolean, directoryHint?:string }):Promise<string|null> {
		// get active plugin
		let plugin = this._pluginService.getWorkspacePluginByName("crossref_plugin");
		if(!plugin){ 
			console.error("crossref plugin not active"); 
			return null;
		}

		// get files which define this tag
		let defs: string[] | null = plugin.getDefsForTag(data.tag);
		let fileHash: string;

		if (defs == null) {
			// expect NULL when no crossref plugin active
			console.error("crossref plugin not active")
			return null;
		} else if (defs.length == 0) {
			// create a file for this tag when none exists?
			if (!data.create) { return null; }
			console.log(`MainIpc_TagHandlers :: creating file for tag '${data.tag}'`);

			/** @todo (6/27/20)
			 * what if data.tag is not a valid file name?
			 * what if it contains slashes?  what if it uses \ instead of /?
			 */

			// create file for this tag when none exists
			let fileName: string = data.tag + ".md";

			// determine new file path for this file
			/** @todo (7/30/20) check for errors:
			 * > what if path points to file that already exists?
			 * > what if directoryHint is relative, not absolute?
			 * > user setting to ignore directory hints
			 */
			let filePath: string | null;
			if(data.directoryHint){ filePath = pathlib.join(data.directoryHint, fileName) }
			else {                  filePath = this._workspaceService.resolveWorkspaceRelativePath(fileName); }

			if (!filePath) {
				console.error("MainIpc_TagHandlers :: could not create file for tag, no active workspace");
				return null;
			}

			// create file
			/** @todo (9/14/20) default file creation should probably be handled by the WorkspaceService */
			let fileContents: string = this._app.getDefaultFileContents(".md", fileName)
			
			// @todo (2022/03/04) avoid private access to _eventHandlers? or make public?
			let file: IFileMeta | null = await this._app._eventHandlers.file.requestFileCreate(filePath, fileContents);
			if (!file) {
				console.error("MainIpc_TagHandlers :: unknown error creating file for tag");
				return null;
			}

			// set hah
			fileHash = file.hash;
		} else if (defs.length == 1) {
			fileHash = defs[0];
		} else {
			/** @todo (6/20/20) handle more than one defining file for tag */
			console.warn(`MainIPC_TagHandlers :: more than one defining file for tag ${data.tag} (not implemented)`);
			return null;
		}

		return fileHash;
	}

	async getFileForTag(data: { tag: string, create: boolean }):Promise<IFileMeta|null> {
		let fileHash = await this.getHashForTag(data);
		if (!fileHash) return null;
		return this._workspaceService.getFileByHash(fileHash);
	}
}

//// OUTLINE ///////////////////////////////////////////////

export class MainIpc_OutlineHandlers implements MainIpcChannel {
	
	get name() { return "outline" as const; }
	
	constructor(
		private _pluginService:PluginService
	) { }

	async requestOutlineForHash(hash: string): Promise<IOutline | null> {
		// get active plugin
		let plugin = this._pluginService.getWorkspacePluginByName("outline_plugin");
		if(!plugin){ return []; }
		// get outline
		return plugin.getOutlineForHash(hash);
	}
}

//// SHELL /////////////////////////////////////////////////

export class MainIpc_ShellHandlers implements MainIpcChannel {
	
	get name() { return "shell" as const; }
	
	constructor() { }

	async requestExternalLinkOpen(url: string) {
		shell.openExternal(url, { activate: true });
	}
}

//// PLUGINS ///////////////////////////////////////////////

export class MainIpc_MetadataHandlers implements MainIpcChannel {

	get name() { return "metadata" as const; }
	
	constructor(
		private _pluginService: PluginService
	) { }

	async getMetadataForHash(hash: string): Promise<IMetadata|null> {
		let plugin = this._pluginService.getWorkspacePluginByName("metadata_plugin");
		if(!plugin){ console.error("no plugin!"); return null; }
		console.log(`getMetadataForHash :: ${hash}`);
		return plugin.getMetadataForHash(hash);
	}
}

//// NAVIGATION ////////////////////////////////////////////////////////////////

export class MainIpc_NavigationHandlers implements MainIpcChannel {

	get name() { return "navigation" as const; }
	
	// TODO (2021/03/12) clear navigation history on workspace open/close
	private _navHistory: IFileMeta[];
	private _navIdx: number;

	constructor(
		private _app:NoteworthyApp,
		private _workspaceService: WorkspaceService,
		private _pluginService: PluginService
	) {
		this._navHistory = [];
		this._navIdx = 0;
	}

	/**
	 * @returns Metadata for the opened file, if successful, otherwise null
	 */
	private async _navigate(fileInfo: { hash: string }): Promise<IFileMeta | null> {
		console.log(`MainIPC_NavigationHandlers :: navigate :: ${ fileInfo.hash }`);

		// get file contents
		// @todo (2022/03/04) avoid private access to _eventHandlers? or make public?
		let file = await this._app._eventHandlers.file.requestFileContents(fileInfo);
		if(!file){ return null; }

		// send file to render process
		this._app._renderProxy?.fileDidOpen(file);

		// return 
		return getFileMetadata(file);
	}

	public getNavigationHistory() {
		return {
			history: [...this._navHistory],
			currentIdx: this._navIdx
		}
	}

	public navigateNext(): void {
		// clamp to guarantee valid output index, even if we receive invalid input
		let nextIdx: number = Math.min(Math.max(this._navIdx, 0), this._navHistory.length);

		// search forwards through history for next valid index
		let foundValid: boolean = false;
		while(nextIdx + 1 < this._navHistory.length){
			nextIdx = nextIdx + 1;
			if(this._workspaceService.getFileByHash(this._navHistory[nextIdx].hash)) {
				foundValid = true;
				break;
			}
		}

		// do nothing if no valid files found
		if(!foundValid || nextIdx === this._navIdx) { return; }

		// navigate
		let file = this._navigate({ hash: this._navHistory[nextIdx].hash });
		if(!file) { return; }
		this._navIdx = nextIdx;

		// TODO (2021/03/12) re-think updates to reactive ui data
		this._app._renderProxy?.navHistoryChanged({ history: this._navHistory, currentIdx: this._navIdx });
	}

	public navigatePrev(): void {
		// clamp to guarantee valid output index, even if we receive invalid input
		let prevIdx: number = Math.min(Math.max(this._navIdx, 0), this._navHistory.length);

		// search forwards through history for next valid index
		let foundValid: boolean = false;
		while(prevIdx - 1 > 0){
			prevIdx = prevIdx - 1;
			if(this._workspaceService.getFileByHash(this._navHistory[prevIdx].hash)) {
				foundValid = true;
				break;
			}
		}

		// do nothing if no valid files found
		if(!foundValid || prevIdx === this._navIdx) { return; }

		// navigate
		let file = this._navigate({ hash: this._navHistory[prevIdx].hash });
		if(!file) { return; }
		this._navIdx = prevIdx;

		// TODO (2021/03/12) re-think updates to reactive ui data
		this._app._renderProxy?.navHistoryChanged({ history: this._navHistory, currentIdx: this._navIdx });
	}

	async navigateToHash(fileInfo: { hash: string }): Promise<void> {
		if (!this._app.window) { return; }
		
		// request file contents
		let file = await this._navigate(fileInfo);
		if(!file){ return; }

		// push this file onto navigation stack, erasing any existing forward history
		this._navHistory.splice(this._navIdx+1, this._navHistory.length-this._navIdx+1, file);
		this._navIdx = this._navHistory.length - 1;

		// TODO (2021/03/12) re-think updates to reactive ui data
		this._app._renderProxy?.navHistoryChanged({ history: this._navHistory, currentIdx: this._navIdx });
	}

	async navigateToTag(data:{tag: string, create:boolean, directoryHint?:string}):Promise<void> {
		if (!this._app.window) { return; }

		// get files which define this tag
		// @todo (2022/03/04) avoid private access to _eventHandlers? or make public?
		let fileHash = await this._app._eventHandlers.tag.getHashForTag(data);
		if(!fileHash) return;
		// load file from hash
		this.navigateToHash({ hash: fileHash });
	}

	async navigateToIndex(idx: number){
		if(idx < 0 || idx >= this._navHistory.length) {
			return Promise.reject("MainIpc_NavigationHandlers :: navigateToIndex :: index out of bounds");
		}

		this._navigate({ hash: this._navHistory[idx].hash });
		this._navIdx = idx;

		// TODO (2021/03/12) re-think updates to reactive ui data
		this._app._renderProxy?.navHistoryChanged({ history: this._navHistory, currentIdx: this._navIdx });
	}
}

////////////////////////////////////////////////////////////

import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-csl";
import { Citation } from "./plugins/citation-plugin";

export class MainIpc_CitationHandlers implements MainIpcChannel {
	get name() { return "citations" as const; }

	constructor(
		private _app: NoteworthyApp,
		private _pluginService: PluginService
	) {}

	/**
	 * Convert a citation key (such as `peyton-jones1992:stg`) into
	 * a formatted citation suitable for display.
	 */
	async getCitationForKey(citeKey: string): Promise<string | null> {
		const citePlugin = this._pluginService.getWorkspacePluginByName("citation_plugin");
		if(!citePlugin) { return null; }
		
		// get file corresponding to citation key, if one exists
		// TODO (2022/03/07) what if two files exist for the same tag?  which citation to use?
		const file = await this._app._eventHandlers.tag.getFileForTag({ tag: citeKey, create: false });
		if(!file) { return null; }

		const cite = this.getCitationForHash(file.hash);
		return cite;

		// TODO (2022/03/07) also check if any bibliography files contain the key
		// TODO (2022/03/07) what if bibliography contains entry whose key matches a file tag?
	}
	
	getCitationForHash(hash: string): string | null {
		const citePlugin = this._pluginService.getWorkspacePluginByName("citation_plugin");
		if(!citePlugin) { return null; }

		// retrieve citation string from document
		const citeData = citePlugin.getCitationForHash(hash);
		if(!citeData) { return null; }

		// use citeproc-js to render citation string
		try {
			const cite = new Cite(citeData.data);

			const citeOutput = cite.format('bibliography', {
				type: 'html',
				template: 'vancouver',
				lang: 'en-US'
			});

			if(typeof citeOutput !== "string") { return null; }
			return citeOutput;
		} catch(err) {
			console.error(err);
			return null;
		}
	}

	async generateBibliography(citeKeys: string[]): Promise<string | null> {
		const citePlugin = this._pluginService.getWorkspacePluginByName("citation_plugin");
		if(!citePlugin) { return null; }

		// retrieve bibliography entry for each citation key
		const citeData: (string|object[]|object)[] = [];
		for(const citeKey of citeKeys) {
			// get file corresponding to citation key, if one exists
			// TODO (2022/03/07) what if two files exist for the same tag?  which citation to use?
			const file = await this._app._eventHandlers.tag.getFileForTag({ tag: citeKey, create: false });
			if(!file) { continue; }

			// get citation data
			const data = citePlugin.getCitationForHash(file.hash);
			if(!data) { continue; }

			citeData.push(data.data);
		}

		// generate bibliography
		const cite = new Cite(citeData);
		const bibliography = cite.format("bibliography", {
			format: "html",
			template: "apa",
			lang: "en-US"
		});

		return bibliography as string;
	}
}

declare global {
	namespace Noteworthy {
		export interface MainIpcHandlers {
			citations: MainIpc_CitationHandlers;
		}
	}
}