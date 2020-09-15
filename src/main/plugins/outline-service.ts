/** @todo (9/13/20) This should probably be merged into either
 * the WorkspaceService or the CrossRefPlugin, but it was put
 * here to avoid major changes to how tags work while
 * refactoring IPC code.
 */

import { WorkspaceService } from "@main/workspace/workspace-service";
import { IOutline } from "./outline-plugin";

export class OutlineService {
	constructor(
		private _workspaceService:WorkspaceService
	){}

	/**
	 * @returns NULL when the plugin is not available or the
	 *    provided document does not exist / has no outline.
	 *    Otherwise, returns the outline for this document.
	 */
	getOutlineForHash(hash:string): IOutline|null {
		if(!this._workspaceService.workspace) { return null; }
		let outlinePlugin = this._workspaceService.workspace.getPluginByName("outline_plugin");
		return outlinePlugin && outlinePlugin.getOutlineForHash(hash);
	}
}