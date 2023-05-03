// prosemirror
import * as PS from "prosemirror-state";
import * as PV from "prosemirror-view";

// prosemirror-autocomplete
import autocomplete, { ActionKind, AutocompleteAction, FromTo, Options, closeAutocomplete } from "prosemirror-autocomplete";

// noteworthy
import { NoteworthyExtension, NoteworthyExtensionSpec } from "@common/extensions/noteworthy-extension";

// solid
import * as S from "solid-js";
import { render } from 'solid-js/web';
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

export type SuggestDataWithIdx = {
	label: string;
	items: (SuggestItem & { idx: number })[];
}[];

export type SuggestItem = SuggestItemSimple | SuggestItemFancy;

export type SuggestItemSimple = {
	kind: "simple",
	id: string,
	text: string
}

export type SuggestItemFancy = {
	kind: "fancy",
	id: string,
	text: string,
	dom: { text: string, class?: string }[]
}

export type AutocompleteProvider = {
	/** An input string matching `startTrigger` will trigger autocompletion. */
	startTrigger: string|RegExp,
	/** A filter matching `endTrigger` will cancel autocompletion. */
	endTrigger?: string,
	/** When `true`, entering `space` will end the autocompletion. */
	allowSpace: boolean,
	/** Returns a list of suggestions based on a user-provided query. */
	search: (query: string) => Promise<SuggestData>;
	/** Called when the user accepts a suggestion. */
	accept: (
		id: string,
		view: PV.EditorView,
		range: { from: number, to: number }
	) => void;
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

	private _state: {
		view: PV.EditorView
		/** whether the last autocomplete query returned at least one result */
		hasResults: boolean,
		range: FromTo,
		data: SuggestData,
		maxIdx: number,
		selectedIdx: number,
		/** Name of the `AutocompleteProvider` currently providing suggestions */
		provider: string,
	} | null;

	private _signals: {
		setSelectedIdx : S.Setter<number>
		setPosition    : S.Setter<{top:number, left:number}>
		setIsOpen      : S.Setter<boolean>
		setData        : S.Setter<SuggestDataWithIdx>
	}

	/* ==================================================== */

	constructor(
		editorElt: HTMLElement,
		private _providers: AutocompleteProviders
	){
		super();

		// create suggestion overlay
		let suggestElt: HTMLDivElement|null = document.getElementById("suggest-wrapper") as HTMLDivElement;
		if(!suggestElt) { suggestElt = document.createElement("div"); }
		suggestElt.replaceChildren("");
		suggestElt.id = "suggest-wrapper";
		editorElt.appendChild(suggestElt);

		const [data, setData] = S.createSignal([]);
		const [selectedIdx, setSelectedIdx] = S.createSignal(0);
		const [position, setPosition] = S.createSignal({ top: 0, left: 0 });
		const [isOpen, setIsOpen] = S.createSignal(false);

		this._signals = {
			setSelectedIdx,
			setPosition,
			setIsOpen,
			setData
		}

		this._suggestElt = suggestElt;
		this._state = null;

		// render
		render(() =>
			<Suggest
				open={isOpen()}
				data={data()}
				selectedIdx={selectedIdx()}
				pos={position()}
				onItemHover={(idx, evt) => this.setSelectedIdx(idx)}
				onItemClick={(idx, evt) => this.acceptSuggestion(idx)}
			/>, suggestElt);
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
				trigger: provider.startTrigger,
				cancelOnSpace: !provider.allowSpace
			}
		});

		const options: Options = {
			triggers: triggers,
			reducer: (action: AutocompleteAction) => this.reducer(action)
		};

		return [...autocomplete(options)];
	}

	/* ==================================================== */

	/**
	 * Handles `AutocompleteActions` triggered by the `prosemirror-autocomplete` plugin.
	 */
	private reducer(action: AutocompleteAction): boolean {
		// get autocomplete provider
		const providerName = action.type?.name;
		if(!providerName) { return false; }

		// update state
		if(action.kind === ActionKind.open) {
			this._state = {
				hasResults: true,
				range: action.range,
				view: action.view,
				provider: providerName,
				data: [],
				maxIdx: 0,
				selectedIdx: 0,
			}
		} else {
			if(!this._state) { throw new Error("autocomplete :: invalid state!"); }
			this._state.range = action.range;
			this._state.view  = action.view;
			this._state.provider = providerName;
		}

		// get provider
		const provider = this.getCurrentProvider();
		if(!provider)    { return false; }

		// position info
		let rect = action.view.dom.getBoundingClientRect();

		// state machine
		switch (action.kind) {
			case ActionKind.open:
				this._signals.setIsOpen(true);
				this.placeSuggestion(rect, true);

				this._state.hasResults = true;
				this.getSuggestionsFromProvider(provider, action.filter || "");
				return false;
			case ActionKind.close:
				this._signals.setIsOpen(false);
				this.placeSuggestion(rect, false);
				return false;
			case ActionKind.up:
				this.setSelectedIdx(this._state.selectedIdx - 1);
				this.placeSuggestion(rect, true);
				return true;
			case ActionKind.down:
				this.setSelectedIdx(this._state.selectedIdx + 1);
				this.placeSuggestion(rect, true);
				return true;
			case ActionKind.enter:
				this.acceptSuggestion(this._state.selectedIdx);
				return true;
			case ActionKind.filter:
				const filter = action.filter || "";

				if(provider.endTrigger && filter.endsWith(provider.endTrigger)) {
					this.triggerClose();
					return false;
				}

				this.placeSuggestion(rect, true);
				this.getSuggestionsFromProvider(provider, filter);
				return false;
			default:
				return false;
		}
	}

	/* ==================================================== */

	/**
	 * Cancel autocompletion.
	 */
	private triggerClose() {
		if(this._state) { closeAutocomplete(this._state.view); }
		this._signals.setIsOpen(false);
		this._signals.setData([]);
		this._state = null;
	}

	/**
	 * @returns the `AutocompleteProvider` currently providing suggestions.
	 */
	private getCurrentProvider(): AutocompleteProvider|null {
		if(!this._state) { return null; }
		return this._providers[this._state.provider] || null;
	}

	/**
	 * Sends a query to the active `AutocompleteProvider`, and asynchronously
	 * updates the autocomplete popup when the response arrives.
	 *
	 * @returns `true` if successful, `false` if failed
	 */
	private getSuggestionsFromProvider(provider: AutocompleteProvider, query: string): boolean {
		if(!this._state) { return false; }

		provider.search(query).then(data => {
			// end autocomplete if two successive queries yield no results
			if(!this._state)                                 { this.triggerClose(); return; }
			if(!this._state.hasResults && data.length === 0) { this.triggerClose(); return; }

			this._state.hasResults = (data.length > 0);
			this.setData(data);
		});

		return true;
	}


	/**
	 * Updates the position of the autocomplete popup.
	 *
	 * @param scroll When `true`, scrolls the popup box to ensure
	 *   ensure that the currently-selected item is in view.
	 */
	private placeSuggestion(viewRect: DOMRect, scroll: boolean): void {
		// the `autocomplete` element is managed by `prosemirror-autocomplete`,
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

	/**
	 * Accepts a suggestion by calling the active `AutocompleteProvider`.
	 */
	private acceptSuggestion(idx: number): void {
		if(!this._state) { return; }

		// accept suggestion
		const suggestion = this.getSuggestionFromIdx(this._state.selectedIdx);
		const provider   = this.getCurrentProvider();
		if(!suggestion || !provider) { return; }

		provider.accept(suggestion.id, this._state.view, this._state.range);
		this.triggerClose();
	}

	/**
	 * Handles changes to `SuggestData`, for example when the filter changes.
	 */
	private setData(data: SuggestData): void {
		if(!this._state) { return; }

		this._state.data = data;

		// annotate suggestion data with indices
		const groupIndexMap = this.computeGroupIndexMap();
		const dataWithIdx: SuggestDataWithIdx = data.map((group, groupIdx) => {
			return {
				label: group.label,
				items: group.items.map((item, itemIdx) => {
					const idx = groupIndexMap[groupIdx] + itemIdx;
					return { ...item, idx };
				})
			}
		});

		this._signals.setData(dataWithIdx);

		// set max idx
		let lastGroupIdx = groupIndexMap.length - 1;
		if(lastGroupIdx < 0) { this._state.maxIdx = 0; }
		else { this._state.maxIdx = groupIndexMap[lastGroupIdx] + data[lastGroupIdx].items.length - 1; }

		this.clampSelectedIdx();
	}

	/**
	 * Clamps the currently-selected index to the interval [0,maxIdx].
	 */
	private clampSelectedIdx(): void {
		if(!this._state) { return; }
		console.log("clampSelectedIdx");
		this.setSelectedIdx(this._state.selectedIdx);
	}

	/**
	 * Update the currently-selected index.
	 */
	private setSelectedIdx(idx: number): void {
		if(!this._state) { return; }

		// clamp
		idx = Math.max(0, Math.min(this._state.maxIdx, idx));

		// set selected idx
		this._state.selectedIdx = idx;
		this._signals.setSelectedIdx(idx);
	}

	/**
	 * Helper function to compute a mapping from groupIdx -> absoluteIdx.
	 */
	private computeGroupIndexMap(): number[] {
		if(!this._state) { return []; }

		const groupIndexMap = this._state.data.map(g => g.items.length);
		for(let k = 0, len = 0; k < groupIndexMap.length; k++) {
			let groupLen = groupIndexMap[k];
			groupIndexMap[k] = len;
			len += groupLen;
		}
		return groupIndexMap;
	}

	/**
	 * Retrieves the item at index `idx` from the current `SuggestionData`.
	 */
	private getSuggestionFromIdx(idx: number): SuggestItem|null {
		if(!this._state) { return null; }

		for(let k = 0; k < this._state.data.length; k++) {
			const group = this._state.data[k];
			if(idx < group.items.length) { return group.items[idx];   }
			else                         { idx -= group.items.length; }
		}

		// index out of bounds
		return null;
	}

}
