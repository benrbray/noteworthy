import { IWorkspaceDir, IFileMeta } from "@common/fileio";

export interface Provider {
	init():void;
	destroy():void;
}

export interface WorkspaceProvider {
	handleWorkspaceClosed(dir:IWorkspaceDir):void;
	handleWorkspaceOpen(dir:IWorkspaceDir):void;

	handleFileDeleted(file: IFileMeta):void;
	handleFileCreated(file: IFileMeta, contents:any):void;
	handleFileChanged(file: IFileMeta, contents:any):void;
}