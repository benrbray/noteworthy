import { MainIpcChannel } from "@main/MainIPC";
import { IMetadata } from "@main/plugins/metadata-plugin";
import { PluginService } from "@main/plugins/plugin-service";

////////////////////////////////////////////////////////////

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
