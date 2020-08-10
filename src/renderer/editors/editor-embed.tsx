// electron imports
import { clipboard } from "electron";

// prosemirror imports
import { EditorView as ProseEditorView, EditorView } from "prosemirror-view";
import { Node as ProseNode, Schema as ProseSchema, MarkType, Mark, Slice } from "prosemirror-model";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { EditorState as ProseEditorState, Transaction, Plugin as ProsePlugin, EditorState } from "prosemirror-state";
import { history } from "prosemirror-history";
import { keymap } from "prosemirror-keymap";
import { gapCursor } from "prosemirror-gapcursor";

// project imports
import { IPossiblyUntitledFile } from "@common/fileio";
import { Editor } from "./editor";

// markdown
import { markdownSchema, markdownSerializer } from "@common/markdown";
import { buildInputRules_markdown, buildKeymap_markdown } from "@common/pm-schema";

// solidjs
import { render } from "solid-js/dom";
import { createEffect, createSignal } from "solid-js";

// views
import { MathView, ICursorPosObserver } from "@lib/prosemirror-math/src/math-nodeview";
import { mathInputRules } from "@common/inputrules";
import { openPrompt, TextField } from "@common/prompt/prompt";
import mathSelectPlugin from "@root/lib/prosemirror-math/src/plugins/math-select";
import { MainIpcHandlers } from "@main/MainIPC";

import { YamlEditor } from "../ui/yamlEditor";
import { SetDocAttrStep } from "@common/prosemirror/steps";
import { shallowEqual } from "@common/util/equal";
import { MarkdownDoc } from "@common/doctypes/markdown-doc";
import { RegionView } from "@common/markdown/region-view";
import { EmbedView } from "@common/nwt/nwt-embed";
//import { mathBackspace } from "@root/lib/prosemirror-math/src/plugins/math-backspace";

////////////////////////////////////////////////////////////

// editor class
export class MarkdownRegionEditor extends Editor<ProseEditorState> {

	// prosemirror
	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_keymap: ProsePlugin;

	// dom
	_editorElt: HTMLElement;

	_globalState: ProseEditorState | null;

	// macros (updated whenever KaTeX encounters \newcommand, \renewcommand, or \gdef)
	_katexMacros: { [cmd:string] : string };

	// state
	_initialized:boolean;
	_regionName:string|null;
	_region:ProseNode|null;

	// == Constructor =================================== //

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, mainProxy: MainIpcHandlers, regionName:string|null) {
		super(file, editorElt, mainProxy);

		console.log("editor-embed :: region =", regionName)

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;
		this._proseSchema = markdownSchema;
		this._katexMacros = {};
		this._editorElt = editorElt;

		this._globalState = null;

		// region
		this._regionName = regionName;
		this._region = null;

		function markActive(state:EditorState, type:MarkType) {
			let { from, $from, to, empty } = state.selection
			if (empty) return type.isInSet(state.storedMarks || $from.marks())
			else return state.doc.rangeHasMark(from, to, type)
		}

		/** @todo (7/26/19) clean up markdown keymap */
		this._keymap = keymap({
			"Tab": (state, dispatch, view) => {
				if(dispatch) dispatch(state.tr.deleteSelection().insertText("\t"));
				return true;
			},
			//"Backspace" : mathBackspace,
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
						if(!view){ return; }
						toggleMark(markType, attrs)(view.state, view.dispatch)
						view.focus()
					}
				})
				return true;
			},
		})
	}

	// == Lifecycle ===================================== //

	init() {
		// only initialize once
		if(this._initialized){ return; }
		// initialization order matters
		this.initProseEditor();
		// initialized
		this._initialized = true;
	}

	initProseEditor(){
		// enforce initialization order
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

		// restrict editing to region?
		let regionFound: boolean = false;
		let region: ProseNode | null = null;
		let regionPos:number = -1;

		if(this._regionName){
			state.doc.descendants((node, pos:number) => {
				// search for regionName
				console.log("CHECKING", node.type.name, node.attrs);
				if(node.type.name == "region" && node.attrs["region"] === this._regionName){
					if(!regionFound){
						console.log("REGION FOUND:", node);
						region = node;
						regionFound = true;
						regionPos = pos;
					} else {
						/** @todo (8/7/20) error when more than one region found */
						throw new Error("multiple regions found with same name!");
					}
				}
				
				// regions are always top-level, so don't descend further
				return false;
			});

			if(regionFound){
				this._region = region; 
			} else {
				/** @todo (8/7/20) handle case where editor has regionName, but no region found with that name!  create the region instead, or error? */
				throw new Error("no region found with name " + this._regionName);
			}
		}

		// region state
		let regionState = ProseEditorState.create({
			...config,
			doc: this._region
		})

		this._globalState = state;
		
		// create prosemirror instance
		let nodeViews: ICursorPosObserver[] = [];
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: regionState,
			nodeViews: {
				"math_inline": (node, view, getPos) => {
					let nodeView = new MathView(
						node, view, getPos as (() => number), 
						{ katexOptions: {
							displayMode: false, 
							macros: this._katexMacros
						} },
						() => { nodeViews.splice(nodeViews.indexOf(nodeView)); },
					);
					nodeViews.push(nodeView);
					return nodeView;
				},
				"math_display": (node, view, getPos) => {
					let nodeView = new MathView(
						node, view, getPos as (() => number),
						{ katexOptions: {
							displayMode: true,
							macros: this._katexMacros
						} },
						() => { nodeViews.splice(nodeViews.indexOf(nodeView)); }
					);
					nodeViews.push(nodeView);
					return nodeView;
				},
				"embed": (node, view, getPos) => {
					return new EmbedView(node, view, getPos as (() => number), this._mainProxy);
				}
			},
			dispatchTransaction: (tr: Transaction): void => {
				// unsaved changes?
				if(tr.docChanged){ this.handleDocChanged(); }

				let proseView:EditorView = (this._proseEditorView as EditorView);

				/** @todo (7/26/20) make sure the metadata editor is notified
				 * about any changes to the document metadata.
				 */
				if(tr.steps.find((value) => (value instanceof SetDocAttrStep))){
				
				}

				// update 
				for (let mathView of nodeViews) {
					mathView.updateCursorPos(proseView.state);
				}

				console.log("selection :: ", tr.selection.from, tr.selection.to)

				// apply transaction
				proseView.updateState(proseView.state.apply(tr));

				// apply transaction to parent
				if(this._globalState){
					let regionNode = this._globalState.doc.nodeAt(regionPos);
					console.log("replacing", regionNode);
					if(regionNode){
						let tr = this._globalState.tr.replaceWith(regionPos, regionPos+regionNode.content.size, proseView.state.doc);
						this._globalState = this._globalState.apply(tr);
					} else {
						throw new Error("no regionNode!");
					}
				} else {
					throw new Error("no global state!");
				}
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
						let directoryHint = this._currentFile?.dirPath;
						if (tag) { this._mainProxy.requestTagOpen({tag, create:true, directoryHint}); }
						return true;
					}
					// links
					else if(mark = markdownSchema.marks.link.isInSet(node.marks)){
						let url:string = mark.attrs.href;
						if (url) { this._mainProxy.requestExternalLinkOpen(url); }
						return true;
					}
				}
				return false;
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
	}

	destroy(): void {
		// destroy prosemirror instance
		this._proseEditorView?.destroy();
		this._proseEditorView = null;
		// de-initialize
		this._initialized = false;
	}
	// == Document Model ================================ //

	serializeContents(): string {
		if(!this._globalState){ throw new Error("no global state to serialize!"); }
		return markdownSerializer.serialize(this._globalState.doc);
	}

	parseContents(contents: string):ProseEditorState {
		let parsed:MarkdownDoc|null = MarkdownDoc.parse(contents);
		if(!parsed) { throw new Error("Parse error!"); }

		return ProseEditorState.create({
			doc: parsed.proseDoc,
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