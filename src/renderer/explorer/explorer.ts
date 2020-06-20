import { IDirEntry, IDirEntryMeta } from "@common/fileio";
import RendererIPC from "@renderer/RendererIPC";

export class Explorer {
	_fileTree:IDirEntryMeta[];

	private _elt:HTMLElement;
	private _ipc:RendererIPC;
	
	constructor(elt:HTMLElement, ipc:RendererIPC){
		this._elt = elt;
		this._fileTree = [];
		this._ipc = ipc;
		this.render();
	}

	setFileTree(fileTree:IDirEntryMeta[]){
		this._fileTree = fileTree;
		this.render();
	}

	handleClick(evt:MouseEvent){
		let target:HTMLElement = evt.target as HTMLElement;
		let fileHash = target.getAttribute("data-filehash");
		if(fileHash === null){ return false; }
		
		console.log("explorer :: clicked", fileHash);
		this._ipc.requestFileHashOpen(fileHash);
	}

	private render(){
		let idx:number = 0;

		let numOld:number = this._elt.children.length;
		let numNew:number = this._fileTree.length;

		// re-use list items
		for(idx; idx < Math.min(numOld, numNew); idx++){
			let elt = this._elt.children[idx];
			// file data
			elt.textContent = this._fileTree[idx].name;
			elt.setAttribute("title", this._fileTree[idx].path);
			elt.setAttribute("data-filehash", this._fileTree[idx].hash);
		}

		// add list items as needed
		while(idx < numNew){
			let elt = document.createElement("div");
			elt.className = "file";
			// file data
			elt.textContent = this._fileTree[idx].name;
			elt.setAttribute("title", this._fileTree[idx].path);
			elt.setAttribute("data-filehash", this._fileTree[idx].hash)
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