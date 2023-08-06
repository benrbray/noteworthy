import * as pathlib from "path";

import { IFileMeta } from "@common/files";
import { filterNonVoid } from "@common/util/non-void";

import NoteworthyApp from "@main/app";
import { MainIpcChannel } from "@main/MainIPC";
import { ITagSearchResult, IFileSearchResult, CrossRefPlugin } from "@main/plugins/crossref-plugin";
import { PluginService } from "@main/plugins/plugin-service";
import { WorkspaceService } from "@main/workspace/workspace-service";

////////////////////////////////////////////////////////////

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
