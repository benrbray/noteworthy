
import { Cite } from "@citation-js/core";
import "@citation-js/plugin-bibtex";
import "@citation-js/plugin-csl";
import { MainIpcChannel } from "@main/MainIPC";
import NoteworthyApp from "@main/app";
import { PluginService } from "@main/plugins/plugin-service";

declare global {
	namespace Noteworthy {
		export interface MainIpcHandlers {
			citations: MainIpc_CitationHandlers;
		}
	}
}

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
