import { IPossiblyUntitledFile, IUntitledFile } from "@common/files";
import { MainIpcHandlers } from "@main/MainIPC";
import { to } from "@common/util/to";

import * as Uni from "unist";

////////////////////////////////////////////////////////////////////////////////
export abstract class Editor<TDocumentModel=any> {
	// editor
	protected _editorElt:HTMLElement;
	protected _mainProxy: MainIpcHandlers;

	// current file status
	protected _currentFile:IPossiblyUntitledFile|null;
	protected _unsavedChanges:boolean;

	constructor(file:IPossiblyUntitledFile|null, editorElt:HTMLElement, mainProxy: MainIpcHandlers){
		// create untitled file if needed
		this._currentFile = file || new IUntitledFile();
		this._unsavedChanges = false;

		// save params
		this._editorElt = editorElt;
		this._mainProxy = mainProxy;
	}

	private _createEmptyFile():IUntitledFile {
		return new IUntitledFile();
	}

	// == Abstract Methods ============================== //

	/**
	 * Called upon initialization.
	 * Add event listeners, etc..
	 */
	abstract init():void;
	/**
	 * Called when the editor is being torn down.
	 * Close files, remove event listeners, etc.
	 */
	abstract destroy():void;

	/**
	 * Convert the current contents of this editor to a string.
	 */
	abstract serializeContents():string;

	/**
	 * Get an abstract syntax tree for this document.
	 */
	// TODO (2022/03/06) Different editor types may have different AST types,
	// or maybe even no AST at all.  This method shouldn't be on the interface.
	abstract getAst(): Uni.Node | null;

	/**
	 * Populate the document model from a string.
	 * @param contents Serialized document object.
	 */
	abstract parseContents(contents:string):TDocumentModel;

	/**
	 * Called when the editor should be updated to display `content`.
	 * @param content Content to display, matching this editor's document model.
	 */
	abstract setContents(content: TDocumentModel):void;

	// == Public Interface ============================== //
	
	setCurrentFile(file: IPossiblyUntitledFile): void {
		console.log("editor :: setCurrentFile", file);
		this._currentFile = file;
		this.setContents(this.parseContents(file.contents));
		this.handleDocChanged();
	}

	// == File Management =============================== //

	setCurrentFilePath(filePath: string):void {
		// ensure current file exists
		if(!this._currentFile){ this._currentFile = this._createEmptyFile(); }
		// set file path
		this._currentFile.path = filePath;
		this.handleDocChanged();
	}

	async saveCurrentFile(saveas:boolean = true):Promise<void> {
		if(!this._currentFile){
			console.error("editor :: saveCurrentFile :: no current file, cannot save!");
			return;
		}

		this._currentFile.contents = this.serializeContents();

		console.log("saveCurrentFile ::", this._currentFile);

		// perform save
		if (saveas || this._currentFile.path == null) {
			let [err] = await to(this._mainProxy.dialog.dialogFileSaveAs(this._currentFile));
			if(err) { return Promise.reject(err); }
		} else {
			// TODO As of (2021/03/07) this manual shallow-clone is necessary
			// because SolidJS attaches two `symbol` keys to the _currentFile
			// object which prevent it from being serialized via the structured
			// clone algorithm for ipc transfer.
			//
			// Revisit this later, once the following issue has been resolved: 
			// https://github.com/ryansolid/solid/issues/360
			let sendData = {
				contents: this._currentFile.contents,
				creationTime: this._currentFile.creationTime,
				dirPath: this._currentFile.dirPath,
				modTime: this._currentFile.modTime,
				name: this._currentFile.name,
				parent: this._currentFile.parent,
				path: this._currentFile.path,
				type: this._currentFile.type,
				ext: this._currentFile.ext,
				hash: this._currentFile.hash
			}

			let [err] = await to(this._mainProxy.file.requestFileSave(sendData));
			if(err) { return Promise.reject(err); }
		}

		/** @todo (6/22/20) is this the right place to call fileDidSave?
		 * or wait for callback FILE_DID_SAVE event from main?
		 * what if save takes a long time and the user has made some changes?
		 */
		this.handleFileDidSave();
	}

	async closeAndDestroy():Promise<void> {
		console.log("editor :: closeAndDestroy");
		// check for unsaved changes
		if(this._currentFile && this._unsavedChanges){
			// prompt user for a desired action
			let [err, choice] = await to(this._mainProxy.dialog.askSaveDiscardChanges(this._currentFile.path || "<untitled>"));
			if(err) { return Promise.reject(err); }

			// handle user action
			if(choice == "Cancel") {
				// cancel: user doesn't want to close after all!
				return Promise.reject(choice);
			} else if(choice == "Save" || choice == "Save As") {
				// save file, checking for errors
				let [err] = await to(this.saveCurrentFile(choice == "Save As"));
				if (err) { return Promise.reject(err); }
			} else if(choice == "Discard Changes") {
				/* close without saving! */
			}
		}
		// destroy
		this.destroy();
	}

	handleDocChanged():void {
		this._unsavedChanges = true;
	}

	handleFileDidSave():void {
		this._unsavedChanges = false;
	}
}

export class DefaultEditor extends Editor<string> {

	_inputElt: HTMLTextAreaElement|null;
	_initialized:boolean;

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, mainProxy: MainIpcHandlers) {
		super(file, editorElt, mainProxy);
		this._inputElt = null;
		this._initialized = false;
	}

	init(): void {
		if(this._initialized){ return; }
		
		this._inputElt = document.createElement("textarea");
		this._inputElt.value = this._currentFile?.contents || "";
		this._editorElt.appendChild(this._inputElt);

		this._initialized = true;
	}

	destroy(): void {
		// remove event listeners, etc
		if(this._inputElt){ this._inputElt.remove(); }
		this._inputElt = null;
		this._initialized = false;
	}

	// == Document Representation ======================= //

	serializeContents(): string {
		if (!this._inputElt) { return ""; }
		return this._inputElt.value;
	}

	parseContents(contents:string):string {
		return contents;
	}

	getAst(): Uni.Node | null {
		if(!this._inputElt) { return null; }

		return {
			type: "root",
			children: [{
				type: "paragraph",
				children: [{
					type: "text",
					value: this._inputElt.value
				}]
			}]
		};
	}

	setContents(contents:string):void {
		if(!this._inputElt){
			console.error("DefaultEditor :: setContents :: editor uninitialized!")
			return;
		}
		this._inputElt.value = contents;
	}
}