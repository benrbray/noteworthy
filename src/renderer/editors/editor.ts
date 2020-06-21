import { IPossiblyUntitledFile, IUntitledFile } from "@common/fileio";
import RendererIPC from "@renderer/RendererIPC";

export abstract class Editor<TDocumentModel=any> {
	// editor
	protected _editorElt:HTMLElement;
	protected _ipc: RendererIPC;

	// current file status
	protected _currentFile:IPossiblyUntitledFile|null;
	protected _changed:boolean;

	constructor(file:IPossiblyUntitledFile|null, editorElt:HTMLElement, ipc: RendererIPC){
		// create untitled file if needed
		this._currentFile = file || new IUntitledFile();
		this._changed = false;

		// save params
		this._editorElt = editorElt;
		this._ipc = ipc;
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
		console.log("editor :: setCurrentFile");
		this._currentFile = file;
		this.setContents(this.parseContents(file.contents));
	}

	// == File Management =============================== //

	setCurrentFilePath(filePath: string):void {
		// ensure current file exists
		if(!this._currentFile){ this._currentFile = this._createEmptyFile(); }
		// set file path
		this._currentFile.path = filePath;
	}

	saveCurrentFile(saveas:boolean = true):void {
		if(!this._currentFile){
			console.error("editor :: saveCurrentFile :: no current file, cannot save!");
			return;
		}

		this._currentFile.contents = this.serializeContents();

		if (saveas || this._currentFile.path == null) {
			this._ipc.openSaveAsDialog(this._currentFile);
		} else {
			this._ipc.requestFileSave(this._currentFile);
		}
	}
}

export class DefaultEditor extends Editor<string> {

	_inputElt: HTMLTextAreaElement|null;
	_initialized:boolean;

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, ipc: RendererIPC) {
		super(file, editorElt, ipc);
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

	setContents(contents:string):void {
		if(!this._inputElt){
			console.error("DefaultEditor :: setContents :: editor uninitialized!")
			return;
		}
		this._inputElt.value = contents;
	}
}