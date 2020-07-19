import { IDirEntry, IDirEntryMeta } from "@common/fileio";
import { MainIpcHandlers } from "@main/MainIPC";
import * as pathlib from "path";
import { For } from "solid-js";

export interface IFolderMarker {
	folderMarker:true,
	path:string,
	pathSuffix:string,
	name:string,
}

interface IFileExplorerProps {
	fileTree:(IDirEntryMeta|IFolderMarker)[];
	handleClick:(evt:MouseEvent)=>void;
}
export const FileExplorer = (props:IFileExplorerProps) => {
	return (<For each={props.fileTree} fallback={<div>Empty!</div>}>
		{(entry:IDirEntryMeta|IFolderMarker)=>{
			if("folderMarker" in entry){ return (
				<div
					class="folder"
					title={entry.path}
					onClick={props.handleClick}
				>{entry.pathSuffix}</div>
			)} else { return (
				<div
					class="file"
					title={entry.path}
					data-filehash={entry.hash}
					onClick={props.handleClick}
				>{entry.name}</div>
			)}
		}}
	</For>);
}