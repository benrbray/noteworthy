import { IWorkspaceDir } from "@common/fileio";

export interface WorkspacePlugin {
	plugin_name:string;

	handleWorkspaceClosed(dir:IWorkspaceDir):void;
	handleWorkspaceOpen(dir:IWorkspaceDir):void;

	/** @todo (6/19/20) hash can be computed from path, so don't pass it in? */
	handleFileDeleted(filePath: string, fileHash: string):void;
	handleFileCreated(filePath: string, fileHash: string, contents:any):void;
	handleFileChanged(filePath: string, fileHash: string, contents:any):void;

	serialize():string;
	deserialize(serialized:string):WorkspacePlugin;
}