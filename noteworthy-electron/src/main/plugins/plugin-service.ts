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

////////////////////////////////////////////////////////////////////////////////

export declare const BasePlugins: {
	readonly crossref_plugin: CrossRefPlugin;
	readonly outline_plugin: OutlinePlugin;
	readonly metadata_plugin: MetadataPlugin;
};

declare global {
	namespace Noteworthy {
		/** This interface is for extending the default
		 * set of Plugins with full type-checking support. */
		export interface Plugins {

		}
	}
}

export type Plugins = Noteworthy.Plugins & typeof BasePlugins;
export type PluginName = keyof Plugins;
export type PluginType = Plugins[keyof Plugins];

////////////////////////////////////////////////////////////////////////////////

export class PluginService {
	constructor(
		private _workspaceService:WorkspaceService
	){}

	/**
	 * Retrieve the workspace plugin with the specified name.
	 * @returns NULL when the plugin is not available
	 */
	getWorkspacePluginByName<T extends PluginName>(name: T): Plugins[T] | null {
		if(!this._workspaceService.workspace) { return null; }
		const plugin = this._workspaceService.workspace.getPluginByName(name);
		// @todo (2022/03/04) avoid cast here? better guarantee?
		// @todo (2022/03/04) avoid returning null?
		return plugin as Plugins[T] || null;
	}
}