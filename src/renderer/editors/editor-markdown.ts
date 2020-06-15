import { IPossiblyUntitledFile, IUntitledFile } from "@common/fileio";
import { EditorView as ProseEditorView, EditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser } from "prosemirror-model";
import RendererIPC from "@renderer/RendererIPC";
import { FancySchema } from "@common/pm-schema";
import { EditorState as ProseEditorState, Transaction, Plugin as ProsePlugin } from "prosemirror-state";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { Editor } from "./editor";

// markdown
import { markdownSchema, markdownParser, markdownSerializer } from "@common/markdown";
import { buildInputRules_markdown, buildKeymap_markdown } from "@common/pm-schema";

// views
import { MathView, ICursorPosObserver } from "@lib/prosemirror-math/src/math-nodeview";
import { mathInputRules } from "@common/inputrules";

////////////////////////////////////////////////////////////

// editor class
export class MarkdownEditor extends Editor<ProseEditorState> {

	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_ipc: RendererIPC;
	_editorElt: HTMLElement;
	_keymap: ProsePlugin;
	_initialized:boolean;

	// == Constructor =================================== //

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, ipc: RendererIPC) {
		super(file, editorElt, ipc);

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;
		this._proseSchema = markdownSchema;
		this._editorElt = editorElt;
		this._ipc = ipc;

		this._keymap = this._keymap = keymap({
			/** @todo fill in */
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
				keymap(baseKeymap),
				keymap(buildKeymap_markdown(this._proseSchema)),
				buildInputRules_markdown(this._proseSchema),
				mathInputRules
			]
		}
		// create prosemirror state (from file)
		let state:ProseEditorState;
		if(this._currentFile && this._currentFile.contents){
			state = this.parseContents(this._currentFile.contents);
		} else {
			state = ProseEditorState.create(config);
		}
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
				let proseView:EditorView = (this._proseEditorView as EditorView);

				// update 
				for (let mathView of nodeViews) {
					mathView.updateCursorPos(proseView.state);
				}

				// apply transaction
				proseView.updateState(proseView.state.apply(tr));
			}
		});
		// initialized
		this._initialized = true;
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
		if(!this._proseEditorView){ return ""; }
		return markdownSerializer.serialize(this._proseEditorView.state.doc);
	}

	parseContents(contents: string):ProseEditorState {
		console.log("editor-markdown :: parseContents", contents);

		let parsed = markdownParser.parse(contents);
		console.log(parsed);

		return ProseEditorState.create({
			doc: parsed,
			plugins: [
				keymap(baseKeymap),
				keymap(buildKeymap_markdown(this._proseSchema)),
				buildInputRules_markdown(this._proseSchema),
				mathInputRules
			]
		});
	}

	setContents(contents: ProseEditorState): void {
		console.log("editor-markdown :: setContents", contents);
		if(!this._proseEditorView){
			console.warn("editor-markdown :: setContents :: no editor!");
			return;
		}

		this._proseEditorView.updateState(contents);
	}
}