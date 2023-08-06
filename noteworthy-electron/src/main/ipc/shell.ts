import { MainIpcChannel } from "@main/MainIPC";
import { shell } from "electron";

////////////////////////////////////////////////////////////

export class MainIpc_ShellHandlers implements MainIpcChannel {

	get name() { return "shell" as const; }

	constructor() { }

	async requestExternalLinkOpen(url: string) {
		shell.openExternal(url, { activate: true });
	}
}
