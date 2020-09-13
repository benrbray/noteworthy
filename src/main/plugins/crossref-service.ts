import { WorkspaceService } from "@main/workspace/workspace-service";

////////////////////////////////////////////////////////////

/**
 * @todo (9/13/20) This should probably be merged into either
 * the WorkspaceService or the CrossRefPlugin, but it was put
 * here to avoid major changes to how tags work while
 * refactoring IPC code.
 */

export class CrossRefService {
	constructor(
		private _workspaceService:WorkspaceService
	){}

	/**
	 * @returns NULL when the plugin is not available, otherwise
	 *    a list of hashes for files which define this tag
	 * @todo (6/28/20) how to separate plugin code from app code?
	 */
	getDefsForTag(tag:string):string[]|null {
		if(!this._workspaceService.workspace) { return []; }
		let crossRefPlugin = this._workspaceService.workspace.getPluginByName("crossref_plugin");
		return crossRefPlugin && crossRefPlugin.getDefsForTag(tag);
	}
	/**
	 * @returns NULL when the plugin is not available, otherwise
	 *    a list of hashes for files which define this tag
	 * @todo (6/28/20) how to separate plugin code from app code?
	 */
	getTagMentions(tag:string):string[]|null {
		if(!this._workspaceService.workspace) { return []; }
		let crossRefPlugin = this._workspaceService.workspace.getPluginByName("crossref_plugin");
		return crossRefPlugin && crossRefPlugin.getTagMentions(tag);
	}
}