// project imports
import { IDisposable } from "@common/types";
import { MarkdownEditor } from "@renderer/editors/editor-markdown";
import { ITagSearchResult } from "@main/plugins/crossref-plugin";
import { MainIpcHandlers } from "@main/MainIPC";

// prosemirror imports
import { EditorView as ProseEditorView } from "prosemirror-view";
import { CreateSuggestCommandParams, suggest, SuggestChangeHandlerParams, Suggester, SuggestKeyBinding, SuggestKeyBindingMap } from "prosemirror-suggest";

// solidjs imports
import { render } from "solid-js/web";
import { createSignal, For } from "solid-js";

////////////////////////////////////////////////////////////////////////////////

type GCommand = (acceptedText:string) => void;

export function makeSuggestionPlugin(editor:MarkdownEditor) {

	let showSuggestions = false;

	const acceptSuggestion:SuggestKeyBinding<GCommand> = ({ command }) => {
		// only accept when popup active
		if(!showSuggestions)      { return false; }
		if(editor.popup === null) { return false; }
		// get selected item
		let selected:ITagSearchResult|null = editor.popup.getPopupSelected();
		if(!selected){ return false; }
		// accept suggestion
		command(selected.result);
		return true;
	}

	// Keybindings are similar to prosemirror keymaps with a few extra niceties.
	// The key identifier can also include modifiers (e.g.) `Cmd-Space: () => false`
	// Return true to prevent any further keyboard handlers from running.
	const keyBindings: SuggestKeyBindingMap<GCommand> = 
		{
			ArrowUp: () => {
				editor.popup?.cyclePopupEntries(-1);
				if(showSuggestions) { return true; }
			},
			ArrowDown: () => {
				editor.popup?.cyclePopupEntries(+1);
				if(showSuggestions) { return true; }
			},
			Enter: acceptSuggestion,
			Tab: acceptSuggestion,
			Esc: () => {
				showSuggestions = false;
			},
		};
	
	const onChange = (params: SuggestChangeHandlerParams<GCommand>): void => {
		showSuggestions = true;
		let query = params.queryText.full;
		editor.popup?.showPopupAt(params.range.from, query);
	}

	const onExit = () => {
		showSuggestions = false;
		editor.popup?.hidePopup();
	}

	// Create a  function that is passed into the change, exit and keybinding handlers.
	// This is useful when these handlers are called in a different part of the app.
	const createCommand: (_: string) => (_:CreateSuggestCommandParams) => GCommand =
		(promptChar: string) => ({ match, view }) => {
			return (acceptedText:string) => {
				// validate
				if (!acceptedText) { throw new Error("no replacement text provided!"); }

				// hide popup
				showSuggestions = false;

				const tr = view.state.tr;
				const { from, end: to } = match.range;
				tr.insertText(acceptedText, from + promptChar.length, to);
				view.dispatch(tr);

				//return true;
			};
		};
	
	const tagPrompt = "[["
	const suggestTags: Suggester<GCommand> = {
		// By default decorations are used to highlight the currently matched
		// suggestion in the dom.
		// In this example we don't need decorations (in fact they cause problems when the
		// emoji string replaces the query text in the dom).
		noDecorations: true,
		char: tagPrompt, // The character to match against
		name: 'tag-suggestion', // a unique name
		appendText: '', // Text to append to the created match
		supportedCharacters: /[^\s]/i,
		keyBindings,
		onChange,
		onExit,
		createCommand: createCommand(tagPrompt)
	};

	const citePrompt = "@["
	const suggestCitations: Suggester<GCommand> = {
		// By default decorations are used to highlight the currently matched
		// suggestion in the dom.
		// In this example we don't need decorations (in fact they cause problems when the
		// emoji string replaces the query text in the dom).
		noDecorations: true,
		char: citePrompt, // The character to match against
		name: 'cite-suggestion', // a unique name
		appendText: '', // Text to append to the created match
		supportedCharacters: /[^\s]/i,
		keyBindings,
		onChange,
		onExit,
		createCommand: createCommand(citePrompt)
	};

	// Create the plugin with the above configuration. It also supports multiple plugins being added.
	return suggest(suggestTags, suggestCitations);
}

////////////////////////////////////////////////////////////////////////////////

export class SuggestionPopup implements IDisposable {

	// prosemirror
	private _proseEditorView: ProseEditorView;
	private _editorElt: HTMLElement;
	
	/** @todo (9/27/20) popup shouldn't need to worry about ipc */
	private _mainProxy: MainIpcHandlers;

	// popup dom
	private _popupElt: HTMLElement;
	// popup data
	private _popupData?: () => { data: ITagSearchResult[] };
	private _setPopupData?: (v: { data: ITagSearchResult[]; }) => { data: ITagSearchResult[]; };
	// popup index
	private _popupIndex?: () => number;
	private _setPopupIndex?: (v: number) => number;
	
	
	constructor(view:ProseEditorView, editorElt:HTMLElement, mainProxy:MainIpcHandlers){
		// save args
		this._proseEditorView = view;
		this._editorElt = editorElt;
		this._mainProxy = mainProxy;

		// SolidJS: set up signals for reactive popup
		let [popupData, setPopupData] = createSignal<{ data:ITagSearchResult[] }>({ data: [] });
		let [popupIndex, setPopupIndex] = createSignal(0);
		this._popupData = popupData;
		this._setPopupData = setPopupData;
		this._popupIndex = popupIndex;
		this._setPopupIndex = setPopupIndex;

		// set contents
		const Popup = () => {
			return (<div>
				<For each={popupData().data} fallback={""}>
					{(data, idx:()=>number) => (
						<div class={(idx()==popupIndex())?"popup-item selected":"popup-item"} 
						     innerHTML={data.resultEmphasized} />
					)}
				</For>
			</div>);
		}
		
		// create DOM
		this._popupElt = document.createElement("div");
		this._popupElt.setAttribute("class", "popup");
		this._editorElt.appendChild(this._popupElt);

		// SolidJS: render
		render(Popup, this._popupElt);
	}

	dispose() {
		this._popupElt.remove();
	}

	showPopupAtCursor(query:string) {
		if(!this._proseEditorView){ return; }
		this.showPopupAt(this._proseEditorView.state.selection.to, query);
	}

	async showPopupAt(pos:number, query:string) {
		if(!this._proseEditorView){ return; }

		/** @todo (9/27/20) make popup more generic -- popup shouldn't care that it is showing tags */
		let suggestions:ITagSearchResult[] = await this._mainProxy.tag.fuzzyTagSearch(query);

		// get screen coords for ProseMirror pos
		let coords = this._proseEditorView.coordsAtPos(pos);

		if(this._setPopupData){
			this._setPopupData({ data: suggestions });
		}

		// get editor pos
		let rect = this._editorElt.getBoundingClientRect();
		let win = this._editorElt.ownerDocument.defaultView;
		let editorX = rect.left + (win?.pageXOffset || 0);
		let editorY = rect.top + (win?.pageYOffset || 0);

		let x = coords.left - editorX + 1;
		let y = coords.bottom - editorY;

		// show popup elt
		let popupElt = this._popupElt;
		popupElt.classList.add("visible");
		popupElt.style.left = `${x | 0}px`;
		popupElt.style.top = `${y | 0}px`;
	}

	hidePopup() {
		this._popupElt.classList.remove("visible");
	}

	cyclePopupEntries(direction:(1|-1)){
		if(!this._popupIndex || !this._setPopupIndex || !this._popupData){ return; }
		let length = this._popupData().data.length;
		this._setPopupIndex(Math.min(length-1, Math.max(0, (this._popupIndex() + direction))));
	}

	getPopupSelected():ITagSearchResult|null {
		if(!this._popupData || !this._popupIndex){ return null; }
		return this._popupData().data[this._popupIndex()];
	}
}