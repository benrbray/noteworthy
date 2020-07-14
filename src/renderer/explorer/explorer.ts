import { IDirEntry, IDirEntryMeta } from "@common/fileio";
import { MainIpcHandlers } from "@main/MainIPC";
import * as pathlib from "path";

interface IFolderMarker {
	folderMarker:true,
	path:string,
	pathSuffix:string,
	name:string,
}

export class Explorer {
	_fileTree:(IDirEntryMeta|IFolderMarker)[];

	private _elt:HTMLElement;
	private _mainProxy:MainIpcHandlers;
	
	constructor(elt:HTMLElement, mainProxy:MainIpcHandlers){
		this._elt = elt;
		this._fileTree = [];
		this._mainProxy = mainProxy;
		this.render();
	}

	setFileTree(fileTree:IDirEntryMeta[]){
		// sort file tree!
		/** @todo (7/14/20) this is hacky, should fix properly */
		let sorted = fileTree.map(entry => ({entry, pathSplit:entry.path.split(pathlib.sep)}))
			.sort((a,b) => {
				let na = a.pathSplit.length;
				let nb = b.pathSplit.length;
				for(let i = 0; i < Math.max(na,nb); i++){
					if(i >= na){ return  1; }
					if(i >= nb){ return -1; }
					if(a.pathSplit[i] == b.pathSplit[i]) continue;

					let alast = (i == na - 1);
					let blast = (i == nb - 1);
					if(alast && !blast){ return 1; }
					if(!alast && blast){ return -1; }

					return (a.pathSplit[i] < b.pathSplit[i]) ? -1 : 1;
				}
				return (a.entry.path < b.entry.path)?-1:1;
			});

		this._fileTree = sorted.map(val => val.entry);

		// find common prefix by comparing first/last sorted paths
		// (https://stackoverflow.com/a/1917041/1444650)
		let a1:string = fileTree[0].path;
		let a2:string = fileTree[fileTree.length-1].path;
		let i:number = 0;
		while(i < a1.length && a1.charAt(i) === a2.charAt(i)) i++;
		let prefix = a1.substring(0, i);

		// insert folder markers
		let prevDir = null;
		for(let idx = 0; idx < this._fileTree.length; idx++){
			let dirPath:string = pathlib.dirname(this._fileTree[idx].path);
			if(dirPath !== prevDir){
				this._fileTree.splice(idx, 0, {
					folderMarker: true,
					path: dirPath,
					pathSuffix: dirPath.substring(prefix.length),
					name: pathlib.basename(dirPath)
				});
				prevDir = dirPath;
			}
		}


		this.render();
	}

	handleClick(evt:MouseEvent){
		let target:HTMLElement = evt.target as HTMLElement;

		/** @todo this is hacky, handle properly next time! */
		if(target.className == "folder"){
			let collapsed:string = target.getAttribute("collapsed") || "false";
			target.setAttribute("collapsed", collapsed == "true" ? "false" : "true");
			return;
		}

		let fileHash = target.getAttribute("data-filehash");
		if(fileHash === null){ return false; }
		
		console.log("explorer :: clicked", fileHash);
		this._mainProxy.requestFileOpen({ hash: fileHash });
	}

	private render(){
		let idx:number = 0;

		let numOld:number = this._elt.children.length;
		let numNew:number = this._fileTree.length;

		// re-use list items
		for(idx; idx < Math.min(numOld, numNew); idx++){
			let elt = this._elt.children[idx];
			let entry = this._fileTree[idx];

			if("folderMarker" in entry){
				// folder data
				elt.className = "folder";
				elt.textContent = entry.pathSuffix;
				elt.setAttribute("title", entry.path);
				elt.removeAttribute("data-filehash");
			} else {
				elt.className = "file";
				// file data
				elt.textContent = entry.name;
				elt.setAttribute("title", entry.path);
				elt.setAttribute("data-filehash", entry.hash);
			}
		}

		// add list items as needed
		while(idx < numNew){
			let elt = document.createElement("div");
			let entry = this._fileTree[idx];

			if("folderMarker" in entry){
				// folder data
				elt.className = "folder";
				elt.textContent = entry.pathSuffix;
				elt.setAttribute("title", entry.path);
			} else {
				// file data
				elt.className = "file";
				elt.textContent = entry.name;
				elt.setAttribute("title", entry.path);
				elt.setAttribute("data-filehash", entry.hash)
			}

			elt.onclick = this.handleClick.bind(this);
			this._elt.appendChild(elt);
			idx++;
		}

		// remove list items as needed
		while(this._elt.children.length > numNew){
			this._elt.lastChild?.remove();
		}
	}
}