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
	commands : {
		trigger: "@",
		allowSpace: false,
		search: async (query: string) => {
			const result = commandGroups.map(group => {
				return {
					label: group.label,
					items: group.items.filter(s => s.text.toLowerCase().startsWith(query.toLowerCase()))
				};
			}).filter(group => group.items.length > 0);

			console.log(result);
			return result;
		},
		accept: (id: string) => {

		}
	},
	tags : {
		trigger: "\\",
		allowSpace: false,
		search: async (query: string) => {
			const result = await api.fuzzyTagSearch(query);
			console.log(result);

			const data: SuggestData = [{
				label: "Tag Search",
				items: result.map(tag => ({
					kind: "fancy",
					text: tag.result,
					dom: tag.resultEmphasized.map(part => ({ text: part.text, class: part.emph ? "suggest-fuzzy-match" : ""}))
				}))
			}];

			return data;
		},
		accept: (id: string) => {

		}
	}
})

const commandGroups: SuggestData = [
	{
		label: "Basic",
		items: [
			{ kind: "simple", text: "Heading" },
			{ kind: "simple", text: "Quote" },
			{ kind: "simple", text: "Code Block" },
			{ kind: "simple", text: "Divider" },
		]
	},{
		label: "Math",
		items: [
			{ kind: "simple", text: "Inline Math" },
			{ kind: "simple", text: "Block Math" }
		]
	},{
		label: "Diagrams",
		items: [
			{ kind: "fancy", text: "Tikz Diagram",
			  dom: [
				{ class: "suggest-label-code", text: "Tikz" },
				{ class: "", text: " Diagram" },
			]},
			{ kind: "simple", text: "TikzCd Diagram" },
			{ kind: "simple", text: "q.uiver.app Diagram" }
		]
	},{
		label: "Environments",
		items: [
			{ kind: "simple", text: "Definition" },
			{ kind: "simple", text: "Example" },
			{ kind: "simple", text: "Lemma" },
			{ kind: "simple", text: "Theorem" },
		]
	}
]
