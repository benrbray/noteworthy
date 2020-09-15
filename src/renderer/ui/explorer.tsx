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
	fileTree:[IFolderMarker, IDirEntryMeta[]][];
	activeHash:string|null;
	handleClick:(evt:MouseEvent)=>void;
}
export const FileExplorer = (props:IFileExplorerProps) => {
	return (<div id="tab_explorer" class="tab-contents"><For each={props.fileTree} fallback={<div>Empty!</div>}>
		{([folder, files])=>(<>
			<div
				class="folder"
				title={folder.path}
				onClick={props.handleClick}
				data-collapsed={files.find( file => file.hash == props.activeHash ) === undefined}
			><span class="codicon codicon-folder"/><span>{folder.pathSuffix}</span></div>
			<div class="folder-contents">
				<For each={files} fallback={<div>Empty Folder</div>}>
				{(entry)=>(
				<div
					class={(entry.hash == props.activeHash) ? "file active" : "file"}
					title={entry.path}
					data-filehash={entry.hash}
					onClick={props.handleClick}
				><span class="codicon codicon-note"/><span>{entry.name}</span></div>
				)}
				</For>
			</div>
		</>)}
	</For></div>);
}