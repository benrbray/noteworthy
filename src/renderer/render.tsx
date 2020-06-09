import { clipboard, ipcRenderer } from "electron";
import * as fs from "fs";

import { EditorState, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { Schema, DOMParser } from "prosemirror-model";
import { schema } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";
import { findWrapping, StepMap } from "prosemirror-transform"
import { keymap } from "prosemirror-keymap"
import { baseKeymap, toggleMark } from "prosemirror-commands"
import { undo, redo } from "prosemirror-history"
import RendererIPC from "./RendererIPC";
import { IFileInfo } from "@common/fileio";
import { FancySchema, PlainSchema } from "@common/pm-schema";
import { Plugin as ProsePlugin } from "prosemirror-state";

import { INamedFile, UntitledFile } from "@common/fileio";
import { ProseMirrorEditor } from "./editors/editor-prosemirror";
import { MarkdownEditor } from "./editors/editor-markdown";
import { IpynbEditor } from "./editors/editor-ipynb";

class Renderer {

	// renderer objects
	_ipc:RendererIPC;

	// ui elements
	buttonNew: HTMLButtonElement;
	buttonOpen: HTMLButtonElement;
	buttonSave: HTMLButtonElement;
	buttonSaveAs: HTMLButtonElement;
	titleElt: HTMLDivElement;
	editorElt: HTMLDivElement;

	// prosemirror
	_editor:ProseMirrorEditor|null;
	_currentFile:IFileInfo;

	constructor(){
		// initialize objects
		this._ipc = new RendererIPC(this);
		this._currentFile = {
			fileName: null,
			fileText: ""
		};
		
		this._editor = null;

		// dom elements
		this.buttonNew = document.getElementById("buttonNew") as HTMLButtonElement;
		this.buttonOpen = document.getElementById("buttonOpen") as HTMLButtonElement;
		this.buttonSave = document.getElementById("buttonSave") as HTMLButtonElement;
		this.buttonSaveAs = document.getElementById("buttonSaveAs") as HTMLButtonElement;
		this.titleElt = document.getElementById("title") as HTMLDivElement;
		this.editorElt = document.getElementById("editor") as HTMLDivElement;
	}

	init(){
		console.log("render :: init()");
		this._ipc.init();
		this.initButtons();
		this.initEditor();
	}

	initButtons(){
		this.buttonOpen.addEventListener("click", () => {
			if(!this._editor){ return; }
			this._ipc.openFileDialog();
		});
		this.buttonSave.addEventListener("click", () => {
			if (!this._editor) { return; }
			this._editor.saveCurrentFile(false);
		});
		this.buttonSaveAs.addEventListener("click", () => {
			if (!this._editor) { return; }
			this._editor.saveCurrentFile(true);
		});
	}

	initEditor(){
		// initialize editor
		this._editor = new IpynbEditor(
			this._currentFile,
			this.editorElt,
			this._ipc
		);
		
		/*this._editor = new MarkdownEditor(
			this._currentFile,
			this.editorElt,
			this._ipc
		);*/

		this._editor.init();
	}
}

export default Renderer;