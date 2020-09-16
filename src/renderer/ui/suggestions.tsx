import { MarkdownEditor } from "@renderer/editors/editor-markdown";
import { ITagSearchResult } from "@main/plugins/crossref-plugin";
import { suggest, Suggester, SuggestKeyBinding } from "prosemirror-suggest";

////////////////////////////////////////////////////////////////////////////////

type GCommand = (acceptedText:string) => void;

export function makeSuggestionPlugin(editor:MarkdownEditor) {

	let showSuggestions = false;

	const acceptSuggestion:SuggestKeyBinding<GCommand> = ({ command }) => {
		// only accept when popup active
		if(!showSuggestions){ return false; }
		// get selected item
		let selected:ITagSearchResult|null = editor.getPopupSelected();
		if(!selected){ return false; }
		// accept suggestion
		command(selected.result);
		return true;
	}

	const suggestTags: Suggester<GCommand> = {
		// By default decorations are used to highlight the currently matched
		// suggestion in the dom.
		// In this example we don't need decorations (in fact they cause problems when the
		// emoji string replaces the query text in the dom).
		noDecorations: true,
		char: '[[', // The character to match against
		name: 'emoji-suggestion', // a unique name
		appendText: '', // Text to append to the created match
		supportedCharacters: /[^\s]/i,

		// Keybindings are similar to prosemirror keymaps with a few extra niceties.
		// The key identifier can also include modifiers (e.g.) `Cmd-Space: () => false`
		// Return true to prevent any further keyboard handlers from running.
		keyBindings: {
			ArrowUp: () => {
				editor.cyclePopupEntries(-1);
				if(showSuggestions) { return true; }
			},
			ArrowDown: () => {
				editor.cyclePopupEntries(+1);
				if(showSuggestions) { return true; }
			},
			Enter: acceptSuggestion,
			Tab: acceptSuggestion,
			Esc: () => {
				showSuggestions = false;
			},
		},

		onChange: (params) => {
			showSuggestions = true;
			let query = params.queryText.full;
			editor.showPopupAt(params.range.from, query);
		},

		onExit: () => {
			showSuggestions = false;
			editor.hidePopup();
		},

		// Create a  function that is passed into the change, exit and keybinding handlers.
		// This is useful when these handlers are called in a different part of the app.
		createCommand: ({ match, view }) => {
			return (acceptedText:string) => {
				// validate
				if (!acceptedText) { throw new Error("no replacement text provided!"); }

				// hide popup
				showSuggestions = false;

				const tr = view.state.tr;
				const { from, end: to } = match.range;
				tr.insertText(acceptedText, from+2, to);
				view.dispatch(tr);

				//return true;
			};
		},
	};

	// Create the plugin with the above configuration. It also supports multiple plugins being added.
	return suggest(suggestTags);
}

////////////////////////////////////////////////////////////////////////////////