import { Node as ProseNode } from "prosemirror-model";
import { NodeView, EditorView } from "prosemirror-view";
import { Transaction, EditorState } from "prosemirror-state";
import { StepMap } from "prosemirror-transform";
import { keymap } from "prosemirror-keymap";
import { baseKeymap } from "prosemirror-commands";
import { Editor } from "@renderer/editors/editor";
import { MarkdownEditor } from "@renderer/editors/editor-markdown";
import { MainIpcHandlers } from "@main/MainIPC";
import { IFileMeta, IFileWithContents } from "@common/fileio";
import { replaceInvalidFileNameChars } from "@common/util/pathstrings";

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

	private _innerElt: HTMLElement;
	private _innerView: Editor | undefined;

	// == Lifecycle ===================================== //
	
	constructor(node: ProseNode, view: EditorView, getPos: (() => number), mainProxy: MainIpcHandlers){
		// store arguments
		this._node = node;
		this._outerView = view;
		this._getPos = getPos;
		this._mainProxy = mainProxy;

		// editing state
		this._isEditing = false;

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
				this.setEmbedTag(this._tagChooser.value);
			}
			console.log(evt.keyCode);
		})

		// initialize
		this.init(null);

		// file provided?
		let fileName: string | null = node.attrs.fileName || null;
		if(fileName){
			fileName = replaceInvalidFileNameChars(fileName);
			console.log("nwt-embed :: filename provided ::", fileName);
			this.setEmbedTag(fileName);
		}

		// ensure focus
		this.dom.addEventListener("click", () => this.ensureFocus());
	}

	setEmbedTag(unsafeTagString:string){
		// validate 
		let safeString = replaceInvalidFileNameChars(unsafeTagString);
		this._tagChooser.value = safeString;
		// convert to valid file name
		this.getFile(safeString).then(file => {
			if (file) {
				this._innerView?.setCurrentFile(file);
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
		return this._mainProxy.getHashForTag({ tag: fileName, create: true })
			.then(hash => {
				if (!hash) {
					console.error(`no hash found for tag '${fileName}'!`);
					return null;
				}
				return this._mainProxy.requestFileContents({ hash })
			});
	}

	init(file: IFileWithContents | null) {
		console.log("nwt-embed :: init ::", file && file.path);
		// create a nested ProseMirror view
		this._innerView = new MarkdownEditor(file, this._innerElt, this._mainProxy);
		this._innerView.init();
	}

	destroy():void {
		this.closeEditor();
		delete this.dom;
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

	// dispatchInner(tr: Transaction) {
	// 	if (!this._innerView) { return; }
	// 	let { state, transactions } = this._innerView.state.applyTransaction(tr)
	// 	//this._innerView.updateState(state)

	// 	if (!tr.getMeta("fromOutside")) {
	// 		let outerTr = this._outerView.state.tr, offsetMap = StepMap.offset(this._getPos() + 1)
	// 		for (let i = 0; i < transactions.length; i++) {
	// 			let steps = transactions[i].steps
	// 			for (let j = 0; j < steps.length; j++) {
	// 				let mapped = steps[j].map(offsetMap);
	// 				if (!mapped) { throw Error("step discarded!"); }
	// 				outerTr.step(mapped)
	// 			}
	// 		}
	// 		if (outerTr.docChanged) this._outerView.dispatch(outerTr)
	// 	}
	// }

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