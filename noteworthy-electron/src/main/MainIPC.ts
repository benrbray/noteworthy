// noteworthy imports
import { MainIpc_DialogHandlers } from "./ipc/dialog";
import { MainIpc_FileHandlers } from "./ipc/file";
import { MainIpc_LifecycleHandlers } from "./ipc/lifecycle";
import { MainIpc_MetadataHandlers } from "./ipc/metadata";
import { MainIpc_NavigationHandlers } from "./ipc/navigation";
import { MainIpc_OutlineHandlers } from "./ipc/outline";
import { MainIpc_ShellHandlers } from "./ipc/shell";
import { MainIpc_TagHandlers } from "./ipc/tag";
import { MainIpc_ThemeHandlers } from "./ipc/theme";

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
