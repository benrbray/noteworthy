/** @todo (9/13/20) This should probably be merged into either
 * the WorkspaceService or the CrossRefPlugin, but it was put
 * here to avoid major changes to how tags work while
 * refactoring IPC code.
 */

import { WorkspaceService } from "@main/workspace/workspace-service";
import { WorkspacePlugin } from "./plugin";
import { OutlinePlugin } from "./outline-plugin";
import { CrossRefPlugin } from "./crossref-plugin";
import { MetadataPlugin } from "./metadata-plugin";

export class PluginService {
	constructor(
		private _workspaceService:WorkspaceService
	){}

	/** @todo (10/2/20) improve this type signature -- these overloads are duplicated from `workspace.getPluginByName()`
	 * @returns NULL when the plugin is not available
	 */
	getWorkspacePluginByName(name:"crossref_plugin"): CrossRefPlugin|null;
	getWorkspacePluginByName(name:"outline_plugin"): OutlinePlugin|null;
	getWorkspacePluginByName(name:"metadata_plugin"): MetadataPlugin|null;
	getWorkspacePluginByName(name:string): WorkspacePlugin|null {
		if(!this._workspaceService.workspace) { return null; }
		return this._workspaceService.workspace.getPluginByName(name);
	}
}