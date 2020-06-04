import { remote, clipboard, ipcRenderer } from "electron";
const { dialog } = remote;
import * as fs from "fs";

class Renderer {

	// ui elements
	buttonNew: HTMLButtonElement;
	buttonOpen: HTMLButtonElement;
	buttonSave: HTMLButtonElement;
	titleElt: HTMLDivElement;
	editorElt: HTMLDivElement;

	constructor(){
		// dom elements
		this.buttonNew = document.getElementById("buttonNew") as HTMLButtonElement;
		this.buttonOpen = document.getElementById("buttonOpen") as HTMLButtonElement;
		this.buttonSave = document.getElementById("buttonSave") as HTMLButtonElement;
		this.titleElt = document.getElementById("title") as HTMLDivElement;
		this.editorElt = document.getElementById("editor") as HTMLDivElement;
	}

	init(){
		this.editorElt.textContent = "Hello, Electron!";
	}
}

export default Renderer;