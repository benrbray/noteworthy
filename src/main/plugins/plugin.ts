import { IWorkspaceDir, IFileMeta } from "@common/files";
import { IDoc } from "@common/doctypes/doctypes";

////////////////////////////////////////////////////////////

export interface WorkspacePlugin {
	plugin_name:string;

	handleWorkspaceClosed(dir:IWorkspaceDir):void;
	handleWorkspaceOpen(dir:IWorkspaceDir):void;

	/** @todo (6/19/20) hash can be computed from path, so don't pass it in? */
	handleFileDeleted(filePath:string, fileHash:string):void;
	handleFileCreated(fileMeta:IFileMeta, contents:IDoc):void;
	handleFileChanged(fileMeta:IFileMeta, contents:IDoc):void;

	serialize():string;
	deserialize(serialized:string):WorkspacePlugin;
}