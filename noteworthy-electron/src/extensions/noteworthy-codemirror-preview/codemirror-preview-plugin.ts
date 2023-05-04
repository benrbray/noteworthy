// prosemirror
import * as PM from "prosemirror-model";
import * as PS from "prosemirror-state";
import * as PV from "prosemirror-view";

// noteworthy-codemirror-preview
import { CodeMirrorView, CodeViewOptions } from "./codemirror-preview-nodeview";
import { PreviewRenderers } from "./codemirror-preview-types";

////////////////////////////////////////////////////////////////////////////////

namespace CodeMirrorPlugin {

	export type Options = CodeViewOptions

	export interface State {
		// empty
	}

}

let codeMirrorPluginKey = new PS.PluginKey<CodeMirrorPlugin.State>("noteworthy-codemirror");

export const codeMirrorPlugin = (options: CodeMirrorPlugin.Options): PS.Plugin<CodeMirrorPlugin.State> => {
	let pluginSpec: PS.PluginSpec<CodeMirrorPlugin.State> = {
		key: codeMirrorPluginKey,
		state: {
			init(config, instance): CodeMirrorPlugin.State {
				return { };
			},
			apply(tr, value, oldState, newState){
				return value;
			},
		},
		props: {
			nodeViews: {
				"code_block" : (node: PM.Node, view: PV.EditorView, getPos: ()=>(number|undefined)): CodeMirrorView => {
					return new CodeMirrorView(
						node,
						view,
						getPos as (() => number),
						options
					);
				}
			}
		}
	}
	
	return new PS.Plugin(pluginSpec);
}