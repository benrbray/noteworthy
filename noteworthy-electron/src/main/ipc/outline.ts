import { MainIpcChannel } from "@main/MainIPC";
import { IOutline } from "@main/plugins/outline-plugin";
import { PluginService } from "@main/plugins/plugin-service";

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
