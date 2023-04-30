import { Node, Schema, NodeType, MarkType, Mark } from "prosemirror-model";
import { Command } from "prosemirror-state";

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

	interface ResolvedPos {
		// missing declaration as of (7/25/20)
		/** Get the position at the given index in the parent node at the given depth (which defaults to this.depth). */
		posAtIndex(index:number, depth?:number):number;
	}
}

export interface IDisposable {
	dispose():void;
}

////////////////////////////////////////////////////////////

// ---------------------------------------------------------
// TODO (2021-05-17) these are unused, remove them?
// https://github.com/microsoft/TypeScript/issues/27995#issuecomment-441157546

export type ArrayKeys = keyof any[];
export type Indices<T> = Exclude<keyof T, ArrayKeys>;

//// PROSEMIRROR ///////////////////////////////////////////

// ---- prosemirror-model ----------------------------------

/** Like { NodeType } from "prosemirror-model", but more precise. */
export interface ProseNodeType<
	N extends string = string
> extends NodeType {
	name: N
}

/** Like { MarkType } from "prosemirror-model", but more precise. */
export interface ProseMarkType<
	M extends string = string
> extends MarkType {
	name: M
}

export type ProseKeymap = {[key: string]: Command }