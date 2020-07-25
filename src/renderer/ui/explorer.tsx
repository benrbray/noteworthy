import { IDirEntryMeta } from "@common/fileio";
import { MainIpcHandlers } from "@main/MainIPC";
import * as pathlib from "path";
import { For, afterEffects, Match, Switch } from "solid-js";

export interface IFolderMarker {
	folderMarker:true,
	path:string,
	pathSuffix:string,
	name:string,
}

interface IFileExplorerProps {
	fileTree:(IDirEntryMeta|IFolderMarker)[];
	activeHash:string|null;
	handleClick:(evt:MouseEvent)=>void;
}
export const FileExplorer = (props:IFileExplorerProps) => {
	return (<div id="tab_explorer"><For each={props.fileTree} fallback={<div>Empty!</div>}>
		{(entry:IDirEntryMeta|IFolderMarker)=>{
			// folder vs file
			if("folderMarker" in entry){ return (
				<div
					class="folder"
					title={entry.path}
					onClick={props.handleClick}
				><span class="codicon codicon-folder"/><span>{entry.pathSuffix}</span></div>
			)} else { return (
				<div
					class={(entry.hash == props.activeHash) ? "file active" : "file"}
					title={entry.path}
					data-filehash={entry.hash}
					onClick={props.handleClick}
				><span class="codicon codicon-note"/><span>{entry.name}</span></div>
			)}
		}}
	</For></div>);
}