import { NoteworthyExtensionInitializer } from "@main/extensions/noteworthy-extension";
import TizkJaxExtension, { TikzJax, tikzJaxExtensionSpec } from "./tikzjax-extension";

export const tikzJaxExtension: NoteworthyExtensionInitializer<
	TikzJax.Name,         // extension name
	["codeMirrorPreview"] // dependencies
> = {
	spec: tikzJaxExtensionSpec,
	initialize() {
		return new TizkJaxExtension();
	}
}

export default tikzJaxExtension;