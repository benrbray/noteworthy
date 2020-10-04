import { Node as ProseNode } from "prosemirror-model";

declare module "prosemirror-model" {
	interface Fragment {
		// as of (3/31/20) official @types/prosemirror-model
		// was missing Fragment.content, so we define it here
		content: Node[];
	}

	interface NodeType {
		hasRequiredAttrs(): boolean;
		createAndFill(attrs?:Object, content?: Fragment|ProseNode|ProseNode[], marks?:Mark[]): ProseNode;
	}

	interface ResolvedPos {
		// missing declaration as of (7/25/20)
		/** Get the position at the given index in the parent node at the given depth (which defaults to this.depth). */
		posAtIndex(index:number, depth?:number):number;
	}
}

export interface IDisposable {
	dispose():void;
}