import { NoteworthyExtensionInitializer } from "@main/extensions/noteworthy-extension";
import CodeMirrorPreviewExtension, { CodeMirrorPreview, codeMirrorPreviewSpec } from "./codemirror-preview-extension";

export const codeMirrorPreviewExtension: NoteworthyExtensionInitializer<CodeMirrorPreview.Name> = {
	spec: codeMirrorPreviewSpec,
	initialize() {
		return new CodeMirrorPreviewExtension();
	}
}

export default codeMirrorPreviewExtension;