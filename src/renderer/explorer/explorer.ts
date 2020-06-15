import { IDirEntry } from "@common/fileio";

export class Explorer {
	_fileTree:IDirEntry[];
	_elt:HTMLElement;
	
	constructor(elt:HTMLElement){
		this._elt = elt;
		this._fileTree = [];
		this.render();
	}

	setFileTree(fileTree:IDirEntry[]){
		this._fileTree = fileTree;
		this.render();
	}

	private render(){
		this._elt.textContent = this._fileTree.toString();
	}
}