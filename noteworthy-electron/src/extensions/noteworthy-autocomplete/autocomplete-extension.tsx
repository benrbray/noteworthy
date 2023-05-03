// prosemirror
import * as PS from "prosemirror-state";
import * as PV from "prosemirror-view";

// prosemirror-autocomplete
import autocomplete, { ActionKind, AutocompleteAction, Options, closeAutocomplete } from "prosemirror-autocomplete";

// noteworthy
import { NoteworthyExtension, NoteworthyExtensionSpec } from "@common/extensions/noteworthy-extension";

// noteworthy-autocomplete

// solid
import * as S from "solid-js";
import { render, For } from 'solid-js/web';
import { Suggest } from "./autocomplete-component";

////////////////////////////////////////////////////////////

// register the extension with Noteworthy
declare module "@common/extensions/noteworthy-extension" {
	export interface CommunityExtensions {
		autocomplete: {
			config: Autocomplete.Config
		}
	}
}

////////////////////////////////////////////////////////////

export type SuggestData = {
	label: string;
	items: SuggestItem[];
}[];

export type SuggestItem = SuggestItemSimple | SuggestItemFancy;

export type SuggestItemSimple = {
	kind: "simple",
	text: string
}

export type SuggestItemFancy = {
	kind: "fancy",
	text: string,
	dom: { text: string, class?: string }[]
}

export type AutocompleteProvider = {
	trigger: string|RegExp,
	/** When `true`, entering `space` will end the autocompletion. */
	allowSpace: boolean,
	search: (query: string) => Promise<SuggestData>;
	accept: (accept: string) => void;
}

export type AutocompleteProviders = { [kind: string] : AutocompleteProvider };

////////////////////////////////////////////////////////////

export namespace Autocomplete {
	export type Name = "autocomplete";

	export interface Config {
		autocompleteProviders: AutocompleteProviders;
	}
}

export const extensionSpec: NoteworthyExtensionSpec<Autocomplete.Name> = {
	name : "autocomplete"
}

////////////////////////////////////////////////////////////

export default class AutocompleteExtension
extends NoteworthyExtension<Autocomplete.Name> {

	private _suggestElt: HTMLDivElement;
	private _view: PV.EditorView|null;

	private _state: {
		/** whether the last autocomplete query returned at least one result */
		hasResults: boolean
	}

	private _signals: {
		setSelectedIdx : S.Setter<number>
		setPosition    : S.Setter<{top:number, left:number}>
		setIsOpen      : S.Setter<boolean>
		setData        : S.Setter<SuggestData>
	}

	/* ==================================================== */

	constructor(
		editorElt: HTMLElement,
		private _providers: AutocompleteProviders
	){
		super();
		console.log("autocomplete :: constructor");

		// add suggest
		let suggestElt: HTMLDivElement|null = document.getElementById("suggest-wrapper") as HTMLDivElement;
		if(!suggestElt) { suggestElt = document.createElement("div"); }
		suggestElt.replaceChildren("");
		suggestElt.id = "suggest-wrapper";
		editorElt.appendChild(suggestElt);

		const groups: SuggestData = [
			{
				label: "No Data",
				items: []
			}
		]

		const [data, setData] = S.createSignal(groups);
		const [selectedIdx, setSelectedIdx] = S.createSignal(0);
		const [position, setPosition] = S.createSignal({ top: 0, left: 0 });
		const [isOpen, setIsOpen] = S.createSignal(false);

		this._signals = {
			setSelectedIdx,
			setPosition,
			setIsOpen,
			setData
		}

		// render
		render(() =>
			<Suggest
				open={isOpen()}
				data={data()}
				selectedIdx={selectedIdx()}
				pos={position()}
				onItemHover={(idx, evt) => this.setSelectedIdx(idx)}
			/>, suggestElt);

		this._suggestElt = suggestElt;
		this._state = { hasResults: true };
		this._view = null;
	}

	/* ==== Noteworthy Extension ========================== */

	override updateConfig(updated: Autocomplete.Config): void {
		Object.assign(this._providers, updated);
	}

	override makeProseMirrorPlugins(): PS.Plugin[] {
		const providers = Object.entries(this._providers);

		const triggers = providers.map(([name, provider]) => {
			return {
				name,
				trigger: provider.trigger,
				cancelOnSpace: !provider.allowSpace
			}
		});

		const options: Options = {
			triggers: triggers,
			reducer: (action) => this._reducer(action)
		};

		return [...autocomplete(options)];
	}

	/* ==================================================== */

	private _placeSuggestion(viewRect: DOMRect, scroll: boolean): void {
		const rect = document.getElementsByClassName('autocomplete')[0]?.getBoundingClientRect();
		if(!rect) { return };

		this._signals.setPosition({
			top: rect.top + rect.height - viewRect.top,
			left: rect.left - viewRect.left
		});

		if(scroll) {
			const selectedElt = this._suggestElt.getElementsByClassName("selected")[0];
			selectedElt?.scrollIntoView({ block: "nearest" });
		}
	}

	private setSelectedIdx(idx: number): void {
		this._signals.setSelectedIdx(idx);
	}

	private getProvider(name: string): AutocompleteProvider|null {
		return this._providers[name] || null;
	}

	private handleQueryResults(result: Promise<SuggestData>) {
		result.then(data => {
			// end autocomplete if two successive queries yield no results
			if(!this._state.hasResults && data.length === 0) {
				if(this._view) { closeAutocomplete(this._view); }
			}

			this._state.hasResults = (data.length > 0);
			this._signals.setData(data);
		});
	}

	private _reducer(action: AutocompleteAction): boolean {
		console.log(`autocomplete :: action=${action.kind}`);

		this._view = action.view;

		// get autocomplete provider
		const type = action.type;
		if(!type) { return false; }
		const provider = this.getProvider(type.name);
		if(!provider) { return false; }


		// filter
		let rect = action.view.dom.getBoundingClientRect();

		switch (action.kind) {
			case ActionKind.open:
				this._signals.setIsOpen(true);
				this._placeSuggestion(rect, true);

				this._state.hasResults = true;
				this.handleQueryResults(provider.search(action.filter || ""));
				return true;
			case ActionKind.close:
				this._signals.setIsOpen(false);
				this._placeSuggestion(rect, false);
				return true;
			case ActionKind.up:
				this._signals.setSelectedIdx(prev => prev - 1);
				this._placeSuggestion(rect, true);
				return true;
			case ActionKind.down:
				this._signals.setSelectedIdx(prev => prev + 1);
				this._placeSuggestion(rect, true);
				return true;
			case ActionKind.enter:
				const tr = action.view.state.tr
					.deleteRange(action.range.from, action.range.to)
					.insertText(`You can define this ${action.type ? `${action.type?.name} ` : ''}action!`);
				action.view.dispatch(tr);
				return true;
			case ActionKind.filter:
				this._placeSuggestion(rect, true);
				this.handleQueryResults(provider.search(action.filter || ""));
				return true;
			default:
				return false;
		}
	}

}
