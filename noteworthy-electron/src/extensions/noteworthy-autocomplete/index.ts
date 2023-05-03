import { NoteworthyExtensionInitializer } from "@common/extensions/noteworthy-extension";
import AutocompleteExtension, { Autocomplete, AutocompleteProviders, SuggestData, extensionSpec } from "./autocomplete-extension";

/* TODO (Ben @ 2023/05/01) this extension is part of noteworthy, so css can be
 * embedded automatically during the build process.  Community extensions won't
 * be able to do this, so the plugin spec should specify CSS file paths to be
 * loaded dynamically at initialization time. (and perhaps watched for changes)
 */
import "./autocomplete.css"
import { NoteworthyExtensionApi } from "@renderer/extensions/extension-api";

export const autocompleteExtension: NoteworthyExtensionInitializer<Autocomplete.Name> = {
	spec: extensionSpec,
	initialize({ editorElt, api }) {
		return new AutocompleteExtension(editorElt, makeProviders(api));
	}
}

export default autocompleteExtension;

////////////////////////////////////////////////////////////////////////////////

const makeProviders = (api: NoteworthyExtensionApi): AutocompleteProviders => ({
	wikilink : {
		trigger: "[[",
		allowSpace: false,
		search: async (query: string) => {
			const result = await api.fuzzyTagSearch(query);
			const data: SuggestData = [{
				label: "Tag Search",
				items: result.map(tag => ({
					kind: "fancy",
					id: tag.result,
					text: tag.result,
					dom: tag.resultEmphasized.map(part => ({ text: part.text, class: part.emph ? "suggest-fuzzy-match" : ""}))
				}))
			}];

			return data;
		},
		accept: (id, view, range) => {
			const tr = view.state.tr
				.deleteRange(range.from, range.to)
				.insertText(`[[${id}]]`);
			view.dispatch(tr);
			view.focus();
		}
	},
	citation : {
		trigger: "@[",
		allowSpace: false,
		search: async (query: string) => {
			const result = await api.fuzzyTagSearch(query);
			const data: SuggestData = [{
				label: "Citation Search",
				items: result.map(tag => ({
					kind: "fancy",
					id: tag.result,
					text: tag.result,
					dom: tag.resultEmphasized.map(part => ({ text: part.text, class: part.emph ? "suggest-fuzzy-match" : ""}))
				}))
			}];

			return data;
		},
		accept: (id, view, range) => {
			const tr = view.state.tr
				.deleteRange(range.from, range.to)
				.insertText(`@[${id}]`);
			view.dispatch(tr);
			view.focus();
		}
	}
});
