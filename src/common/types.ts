import {Node } from "prosemirror-model";

declare module "prosemirror-model" {
	interface Fragment {
		// as of (3/31/20) official @types/prosemirror-model
		// was missing Fragment.content, so we define it here
		content: Node[];
	}

	interface NodeType {
		hasRequiredAttrs(): boolean;
		createAndFill(attrs?:Object, content?: Fragment|Node|Node[], marks?:Mark[]): Node;
	}
}

// convenience type for common prosemirror callback signature
export type ProseCommand = (
	state: import("prosemirror-state").EditorState,
	dispatch?: ((tr: import("prosemirror-state").Transaction) => void),
	view?: import("prosemirror-view").EditorView
) => boolean;