// prosemirror imports
import { EditorView as ProseEditorView } from "prosemirror-view";
import { Schema as ProseSchema, DOMParser as ProseDOMParser, NodeType, ContentMatch } from "prosemirror-model";
import { EditorState as ProseEditorState, Transaction, 
	Plugin as ProsePlugin, Selection } from "prosemirror-state";
import { findWrapping } from "prosemirror-transform";
import { baseKeymap, toggleMark, wrapIn, chainCommands,
	splitBlock, newlineInCode, createParagraphNear, 
	lift, liftEmptyBlock, selectParentNode } from "prosemirror-commands";
import { keymap } from "prosemirror-keymap";

// project imports
import { journalSchema } from "@common/prosemirror/schema/journal-schema";
import { IPossiblyUntitledFile, IUntitledFile } from "@common/fileio";
import { Editor } from "./editor";
import { MainIpcHandlers } from "@main/MainIPC";

////////////////////////////////////////////////////////////

export class JournalEditor extends Editor<ProseEditorState> {

	_proseEditorView: ProseEditorView | null;
	_proseSchema: ProseSchema;
	_keymap: ProsePlugin;
	_initialized: boolean;

	// == Constructor =================================== //

	constructor(file: IPossiblyUntitledFile | null, editorElt: HTMLElement, mainProxy:MainIpcHandlers) {
		super(file, editorElt, mainProxy);

		// no editor until initialized
		this._initialized = false;
		this._proseEditorView = null;
		this._proseSchema = journalSchema;

		const insertStar = (state: ProseEditorState, dispatch: ((tr: Transaction) => void)) => {
			var type = this._proseSchema.nodes.star;
			var ref = state.selection;
			var $from = ref.$from;
			if (!$from.parent.canReplaceWith($from.index(), $from.index(), type)) { return false }
			dispatch(state.tr.replaceSelectionWith(type.create()));
			return true
		}

		const insertJournalEntry = (state: ProseEditorState, dispatch?: ((tr: Transaction) => void)) => {
			console.log("insertJournalEntry");
			let { $from } = state.selection, index = $from.index()
			if (!$from.parent.canReplaceWith(index, index, journalSchema.nodes.journal_entry))
				return false
			if (dispatch) {
				let tr = state.tr.replaceSelectionWith(journalSchema.nodes.journal_entry.create({}));
				dispatch(tr)
			}
			return true;
		}

		function wrapIn(nodeType:NodeType, attrs?:Object) {
			return function (state:ProseEditorState, dispatch?:((tr:Transaction) => void)) {
				let { $from, $to } = state.selection
				let range = $from.blockRange($to), wrapping = range && findWrapping(range, nodeType, attrs)
				if (!wrapping || !range) return false
				if (dispatch) dispatch(state.tr.wrap(range, wrapping).scrollIntoView())
				return true
			}
		}

		function insertAfter(state: ProseEditorState, dispatch?: ((tr: Transaction) => void)) {
			let { $head, $anchor } = state.selection
			let above = $head.node(-1), after = $head.indexAfter(-1);
			let type = journalSchema.nodes.journal_entry;//defaultBlockAt(above.contentMatchAt(after))
			if(!type){ return false; }
			if (!above.canReplaceWith(after, after, type)) return false
			if (dispatch) {
				let pos = $head.after(), tr = state.tr.replaceWith(pos, pos, type.createAndFill())
				tr.setSelection(Selection.near(tr.doc.resolve(pos), 1))
				dispatch(tr.scrollIntoView())
			}
			return true
		}

		this._keymap = this._keymap = keymap({
			"Ctrl-b": toggleMark(journalSchema.marks.strong),
			"Ctrl-8": chainCommands(
				splitBlock, selectParentNode, splitBlock
			),
			"Ctrl-1": chainCommands(
				wrapIn(journalSchema.nodes.journal_entry)
			),
			"Ctrl-2": chainCommands(
				selectParentNode
			),
			"Ctrl-3": chainCommands(
				insertAfter
			),
			"Ctrl-4": chainCommands(
				splitBlock
			),
			"Ctrl-5": chainCommands(
				createParagraphNear
			),
			"Ctrl-6": chainCommands(
				liftEmptyBlock
			),
			"Ctrl-7": chainCommands(
				lift
			)
		})
	}

	// == Lifecycle ===================================== //

	init() {
		// initialize only once
		if (this._initialized) { return; }
		// create prosemirror config
		let config = {
			schema: this._proseSchema,
			plugins: [this._keymap, keymap(baseKeymap)]
		};
		// create prosemirror state (from file)
		let state: ProseEditorState;
		if (this._currentFile && this._currentFile.contents) {
			state = this.parseContents(this._currentFile.contents);
		} else {
			state = ProseEditorState.create(config);
		}
		// create prosemirror instance
		this._proseEditorView = new ProseEditorView(this._editorElt, {
			state: state,
		});
		// initialized
		this._initialized = true;
	}

	destroy() {
		// destroy prosemirror instance
		this._proseEditorView?.destroy();
		this._proseEditorView = null;

		// de-initialize
		this._initialized = false;
	}

	// == Document Model ================================ //

	serializeContents(): string {
		if (!this._proseEditorView) { return ""; }
		return JSON.stringify(
			this._proseEditorView.state.toJSON(), undefined, "\t"
		);
	}

	parseContents(contents: string): ProseEditorState {
		let config = {
			schema: journalSchema,
			plugins: [this._keymap, keymap(baseKeymap)]
		}
		return ProseEditorState.fromJSON(config, JSON.parse(contents))
	}
	setContents(content: ProseEditorState): void {
		this._proseEditorView?.updateState(content);
	}
}