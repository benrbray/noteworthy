import { Node as ProseNode } from "prosemirror-model";
import { NodeView, EditorView } from "prosemirror-view";
import { Editor } from "@renderer/editors/editor";
import { MainIpcHandlers } from "@main/MainIPC";
import { IFileWithContents } from "@common/fileio";
import { replaceInvalidFileNameChars } from "@common/util/pathstrings";
import { MarkdownRegionEditor } from "@renderer/editors/editor-embed";

////////////////////////////////////////////////////////////

export class EmbedView implements NodeView {
	// nodeview params
	private _node: ProseNode;
	private _outerView: EditorView;
	private _getPos: (() => number);
	
	// editing state
	private _isEditing:boolean;
	
	// embedded file info
	private _mainProxy:MainIpcHandlers;

	// embedded view
	dom: HTMLElement;

	private _tagChooser:HTMLInputElement;
	private _regionName:string|null;

	private _innerElt: HTMLElement;
	private _innerView: Editor | undefined;
	private _initialized:boolean;

	// == Lifecycle ===================================== //
	
	constructor(node: ProseNode, view: EditorView, getPos: (() => number), mainProxy: MainIpcHandlers){
		// store arguments
		this._node = node;
		this._outerView = view;
		this._getPos = getPos;
		this._mainProxy = mainProxy;

		// editing state
		this._isEditing = false;
		this._initialized = false;

		// inner view
		this.dom = document.createElement("div");
		this.dom.classList.add("embed");

		// tag input field
		this._tagChooser = document.createElement("input");
		this._tagChooser.placeholder = "Enter tag name...";
		this.dom.appendChild(this._tagChooser);

		this._innerElt = document.createElement("div");
		this._innerElt.classList.add("editor");
		this.dom.appendChild(this._innerElt);

		this._tagChooser.addEventListener("keydown", (evt)=>{
			// ENTER: submit new tag name
			if(evt.keyCode == 13){
				this.setEmbedTag(this._tagChooser.value, this._regionName);
			}
			console.log(evt.keyCode);
		})

		// file provided?
		let fileName: string | null = node.attrs.fileName || null;
		let regionName: string | null = node.attrs.regionName || null;
		this._regionName = regionName;

		if(fileName){
			fileName = replaceInvalidFileNameChars(fileName);
			console.log("nwt-embed :: filename provided ::", fileName, regionName);
			this.setEmbedTag(fileName, regionName);
		} else {
			this.init(null, null);
		}

		// ensure focus
		this.dom.addEventListener("click", () => this.ensureFocus());
	}

	setEmbedTag(unsafeTagString:string, regionName:string|null){
		// validate 
		let safeString = replaceInvalidFileNameChars(unsafeTagString);
		this._tagChooser.value = safeString;
		// convert to valid file name
		this.getFile(safeString).then(file => {
			if (file) {
				this.setFile(file, regionName);
				// update node attrs if needed
				if(safeString !== this._node.attrs.fileName) {
					let tr = this._outerView.state.tr.setNodeMarkup(this._getPos(), undefined, { fileName:safeString });
					this._outerView.dispatch(tr);
				}
			}
		});
		/** @todo (6/29/20) where to focus? */
		this.ensureFocus();
	}

	async getFile(fileName:string):Promise<IFileWithContents|null>{
		return this._mainProxy.tag.getHashForTag({ tag: fileName, create: true })
			.then(hash => {
				if (!hash) {
					console.error(`no hash found for tag '${fileName}'!`);
					return null;
				}
				return this._mainProxy.file.requestFileContents({ hash })
			});
	}

	setFile(file:IFileWithContents|null, regionName:string|null){
		if(!this._initialized){
			this.init(file, regionName);
		} else if(file) {
			this._innerView?.setCurrentFile(file);
		} else {
			/** @todo (8/7/20) null file? produce error? */
		}
	}

	init(file: IFileWithContents | null, regionName:string|null) {
		if(this._initialized){ return; }
		console.log("nwt-embed :: init ::", file && file.path);
		// create a nested ProseMirror view
		this._innerView = new MarkdownRegionEditor(file, this._innerElt, this._mainProxy, regionName);
		this._innerView.init();
		// initialized
		this._initialized = true;
	}

	destroy():void {
		this.closeEditor();
		this.dom.remove();
		this._initialized = false;
	}

	/**
	 * Ensure focus on the inner editor whenever this node has focus.
	 * This helps to prevent accidental deletions.
	 */
	ensureFocus() {
		if (this._innerView && this._outerView.hasFocus()) {
			this._innerElt.focus();
		}
	}

	// == Editor ======================================== //

	openEditor():void {
		if(!this._innerView){ return; }
		//if (this._innerView) { throw Error("inner view already open!"); }

		// focus element
		//let innerState = this._innerView.state;
		this._innerElt.focus();

		// determine cursor position
		/*let pos: number = (this.cursorSide == "start") ? 0 : this._node.nodeSize - 2;
		this._innerView.dispatch(
			innerState.tr.setSelection(
				TextSelection.create(innerState.doc, pos)
			)
		);*/

		this._isEditing = true;
	}

	closeEditor():void {
		if (this._innerView) {
			//this._innerView.destroy();
			//this._innerView = undefined;
		}

		this._isEditing = false;
	}

	// == Events ======================================== //

	selectNode() {
		this.dom.classList.add("ProseMirror-selectednode");
		if (!this._isEditing) { this.openEditor(); }
	}

	deselectNode() {
		this.dom.classList.remove("ProseMirror-selectednode");
		if (this._isEditing) { this.closeEditor(); }
	}

	stopEvent(event: Event): boolean {
		return (this._innerView !== undefined)
			&& (event.target !== undefined)
			&& this._innerElt.contains(event.target as Node);
	}

	ignoreMutation() { return true; }
}