// electron imports
import { clipboard } from "electron";

// prosemirror imports
import { EditorView as ProseEditorView, EditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser, MarkType, Node as ProseNode, Mark, Slice } from "prosemirror-model";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { EditorState as ProseEditorState, Transaction, Plugin as ProsePlugin, EditorState } from "prosemirror-state";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { gapCursor } from "prosemirror-gapcursor";

// project imports
import { IPossiblyUntitledFile, IUntitledFile } from "@common/fileio";
import { Editor } from "./editor";

// markdown
import { markdownSchema, markdownParser, markdownSerializer } from "@common/markdown";
import { buildInputRules_markdown, buildKeymap_markdown } from "@common/pm-schema";

// views
import { MathView, ICursorPosObserver } from "@lib/prosemirror-math/src/math-nodeview";
import { mathInputRules } from "@common/inputrules";
import { openPrompt, TextField } from "@common/prompt/prompt";
import mathSelectPlugin from "@root/lib/prosemirror-math/src/plugins/math-select";
import { MainIpcHandlers } from "@main/MainIPC";
import { render } from "solid-js/dom";

import { YamlEditor } from "../ui/yamlEditor";

////////////////////////////////////////////////////////////

// editor class
export class MarkdownEditor extends Editor<ProseEditorState> {

	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_editorElt: HTMLElement;
	_metaElt: HTMLElement;
	_keymap: ProsePlugin;
	_initialized:boolean;

	// == Constructor =================================== //

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, mainProxy: MainIpcHandlers) {
		super(file, editorElt, mainProxy);

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;
		this._proseSchema = markdownSchema;
		this._editorElt = editorElt;

		// create metadata elt
		this._metaElt = document.createElement("div");
		this._metaElt.setAttribute("id", "meta-editor");
		this._metaElt.setAttribute("class", "meta-editor");

		function markActive(state:EditorState, type:MarkType) {
			let { from, $from, to, empty } = state.selection
			if (empty) return type.isInSet(state.storedMarks || $from.marks())
			else return state.doc.rangeHasMark(from, to, type)
		}

		this._keymap = keymap({
			"Tab": (state, dispatch, view) => {
				dispatch(state.tr.deleteSelection().insertText("\t"));
				return true;
			},
			"Ctrl-s": (state, dispatch, view) => {
				this.saveCurrentFile(false);
				return true;
			},
			"Ctrl-k": (state, dispatch, view) => {
				// only insert link when highlighting text
				if(state.selection.empty){ return false; }

				console.log("link toggle");
				let markType = this._proseSchema.marks.link;
				if(markActive(state, markType)) {
					console.log("link active");
					toggleMark(markType)(state, dispatch)
					return true
				}
				console.log("opening prompt");
				openPrompt({
					title: "Create a link",
					fields: {
						href: new TextField({
							label: "Link target",
							required: true
						}),
						title: new TextField({ label: "Title" })
					},
					callback(attrs: { [key: string]: any; } | undefined) {
						toggleMark(markType, attrs)(view.state, view.dispatch)
						view.focus()
					}
				})
				return true;
			},
			"Ctrl-e": (state, dispatch, view) => {
				let { $from, $to } = state.selection;
				// selection must be entirely within a single node
				if(!$from.sameParent($to)){ return false; }
				
				console.log($from);
				console.log($from.node(), $from.parent)
				console.log("isText?", $from.node().isText, $from.node().isTextblock);
				// get selected node

				// marks
				console.log($from.marks());
				for(let mark of $from.marks()){
					if(mark.type.name == "link"){
						let new_href = prompt("change link:", mark.attrs.href);
						dispatch(state.tr.setNodeMarkup($from.pos, undefined, {
							href: new_href,
							title: mark.attrs.title
						}));
					}
				}

				return true;
			}
		})
	}

	// == Lifecycle ===================================== //

	init() {
		// only initialize once
		if(this._initialized){ return; }
		// create prosemirror config
		let config = {
			schema: this._proseSchema,
			plugins: [
				keymap(buildKeymap_markdown(this._proseSchema)),
				keymap(baseKeymap),
				this._keymap,
				buildInputRules_markdown(this._proseSchema),
				mathInputRules,
				mathSelectPlugin,
				history(),
				gapCursor()
			]
		}
		// create prosemirror state (from file)
		let state:ProseEditorState;
		if(this._currentFile && this._currentFile.contents){
			state = this.parseContents(this._currentFile.contents);
		} else {
			state = ProseEditorState.create(config);
		}

		// init metadata editor
		let yamlMeta = state.doc.attrs['yamlMeta'];
		this._editorElt.appendChild(this._metaElt);
		render(()=>(<YamlEditor yamlMeta={yamlMeta} />), this._metaElt);
		
		// create prosemirror instance
		let nodeViews: ICursorPosObserver[] = [];
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: state,
			nodeViews: {
				"math_inline": (node, view, getPos) => {
					let nodeView = new MathView(
						node, view, getPos as (() => number), { displayMode: false },
						() => { nodeViews.splice(nodeViews.indexOf(nodeView)); },
					);
					nodeViews.push(nodeView);
					return nodeView;
				},
				"math_display": (node, view, getPos) => {
					let nodeView = new MathView(
						node, view, getPos as (() => number), { displayMode: true },
						() => { nodeViews.splice(nodeViews.indexOf(nodeView)); }
					);
					nodeViews.push(nodeView);
					return nodeView;
				},
			},
			dispatchTransaction: (tr: Transaction): void => {
				// unsaved changes?
				if(tr.docChanged){ this.handleDocChanged(); }

				let proseView:EditorView = (this._proseEditorView as EditorView);

				// update 
				for (let mathView of nodeViews) {
					mathView.updateCursorPos(proseView.state);
				}

				console.log("selection :: ", tr.selection.from, tr.selection.to)

				// apply transaction
				proseView.updateState(proseView.state.apply(tr));
			},
			handleClick: (view: ProseEditorView<any>, pos: number, event: MouseEvent) => {
				let node = view.state.doc.nodeAt(pos);
				if(!node){ return false; }

				// ctrl-click
				let mark:Mark|null|undefined
				if(event.ctrlKey && node.isText){
					let markTypes = ["wikilink", "citation", "tag"];
					// wikilinks, tags, citations
					if (mark = node.marks.find((mark: Mark) => markTypes.includes(mark.type.name))){
						let tag = node.text;
						if (tag) { this._mainProxy.requestTagOpen({tag, create:true}); }
					}
					// links
					else if(mark = markdownSchema.marks.link.isInSet(node.marks)){
						let url:string = mark.attrs.href;
						if (url) { this._mainProxy.requestExternalLinkOpen(url); }
					}
				}
				return true;
			},
			handlePaste: (view:EditorView, event:ClipboardEvent, slice:Slice<any>) => {
				let file:File|undefined;

				/** @todo (6/22/20) make this work with the ClipboardEvent? */

				// for some reason, event.clipboardData.getData("img/png") etc.
				// do not return any data.  So we use the electron clipboard instead.
				if(clipboard.availableFormats("clipboard").find(str => str.startsWith("image"))){
					let dataUrl:string = clipboard.readImage("clipboard").toDataURL();
					
					let imgNode = markdownSchema.nodes.image.createAndFill({
						src: dataUrl
					});
					
					if(imgNode){
						let { $from } = view.state.selection;
						let tr = view.state.tr.deleteSelection().insert(
							$from.pos,
							imgNode
						)
						view.dispatch(tr);
						return true;
					}

				}
				
				return false;
			}
		});
		// initialized
		this._initialized = true;
	}

	destroy(): void {
		// destroy prosemirror instance
		this._proseEditorView?.destroy();
		this._proseEditorView = null;
		// destroy meta editor
		this._metaElt.remove();
		// de-initialize
		this._initialized = false;
	}
	// == Document Model ================================ //

	serializeContents(): string {
		if(!this._proseEditorView){ return ""; }
		return markdownSerializer.serialize(this._proseEditorView.state.doc);
	}

	parseContents(contents: string):ProseEditorState {
		let parsed = markdownParser.parse(contents);
		return ProseEditorState.create({
			doc: parsed,
			plugins: [
				// note: keymap order matters!
				keymap(buildKeymap_markdown(this._proseSchema)),
				keymap(baseKeymap),
				this._keymap,
				buildInputRules_markdown(this._proseSchema),
				mathInputRules,
				mathSelectPlugin,
				history(),
				gapCursor()
			]
		});
	}

	setContents(contents: ProseEditorState): void {
		if(!this._proseEditorView){
			console.warn("editor-markdown :: setContents :: no editor!");
			return;
		}

		this._proseEditorView.updateState(contents);
	}
}