import { IPossiblyUntitledFile, IUntitledFile } from "@common/fileio";
import { EditorView as ProseEditorView, EditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser } from "prosemirror-model";
import RendererIPC from "@renderer/RendererIPC";
import { EditorState as ProseEditorState, Transaction, Plugin as ProsePlugin } from "prosemirror-state";
import { baseKeymap, toggleMark } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";
import { Editor } from "./editor";

// markdown
import { ipynbSchema, ipynbParser, ipynbSerializer } from "@common/ipynb";
import { buildInputRules_markdown, buildKeymap_markdown } from "@common/pm-schema";

// views
import { ICursorPosObserver, MathView } from "@lib/prosemirror-math/src/math-nodeview";
import { mathInputRules } from "@lib/prosemirror-math/src/plugins/math-inputrules";

////////////////////////////////////////////////////////////

// editor class
export class IpynbEditor extends Editor<ProseEditorState> {

	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_keymap: ProsePlugin;
	_initialized: boolean;

	// == Constructor =================================== //

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, ipc: RendererIPC) {
		super(file, editorElt, ipc);

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;
		this._proseSchema = ipynbSchema;

		const insertStar = (state: ProseEditorState, dispatch: ((tr: Transaction) => void)) => {
			var type = this._proseSchema.nodes.star;
			var ref = state.selection;
			var $from = ref.$from;
			if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) { return false }
			dispatch(state.tr.replaceSelectionWith(type.create()));
			return true
		}

		this._keymap = this._keymap = keymap({
			"Ctrl-b": toggleMark(this._proseSchema.marks.shouting),
			"Ctrl-Space": insertStar,
		})
	}

	// == Lifecycle ===================================== //

	init() {
		// initialize only once
		if(this._initialized){ return; }
		// create prosemirror config
		let config = {
			schema: this._proseSchema,
			plugins: [
				keymap(baseKeymap),
				keymap(buildKeymap_markdown(this._proseSchema)),
				buildInputRules_markdown(this._proseSchema)
			]
		};
		// create prosemirror state (from file)
		let state:ProseEditorState;
		if (this._currentFile && this._currentFile.contents) {
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
				let proseView: EditorView = (this._proseEditorView as EditorView);

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
		throw new Error("Method not implemented.");
	}

	parseContents(contents: string): ProseEditorState {
		let config = {
			schema: this._proseSchema,
			plugins: [
				keymap(baseKeymap),
				keymap(buildKeymap_markdown(this._proseSchema)),
				buildInputRules_markdown(this._proseSchema)
			]
		}

		// parse
		let parsed = ipynbParser.parse(contents);
		return ProseEditorState.fromJSON(config, parsed);
	}

	setContents(contents: ProseEditorState): void {
		this._proseEditorView?.updateState(contents);
	}

	// == File Management =============================== //

	saveCurrentFile(saveas: boolean = true) {
		console.warn("editor-ipynb :: saving not implemented");
	}
}