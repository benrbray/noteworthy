import { Node, Schema, NodeType, MarkType, Mark } from "prosemirror-model";

declare module "prosemirror-model" {
	interface Fragment {
		// as of (3/31/20) official @types/prosemirror-model
		// was missing Fragment.content, so we define it here
		content: Node[];
	}

	interface NodeType<S extends Schema<any,any>> {
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

//// PROSEMIRROR ///////////////////////////////////////////

// ---- prosemirror-model ----------------------------------

export interface ProseSchema<N extends string = string, M extends string = string> extends Schema<N,M> {
	// as of (2021-05-04) the return type was incorrect              vvvv
	text(text: string, marks?: Array<Mark<ProseSchema<N, M>>>): Node<this>;
	/**
	* An object mapping the schema's node names to node type objects.
	*/
	nodes: { [name in N]: ProseNodeType<this> & { name: N } };
	/**
	* A map from mark names to mark type objects.
	*/
	marks: { [name in M]: ProseMarkType<this> & { name: N } };
}

export type ProseNodeT<S> = S extends ProseSchema<infer N, any> ? N : never;
export type ProseMarkT<S> = S extends ProseSchema<any, infer M> ? M : never;

/** Like { Node } from "prosemirror-model", but more precise. */
// export interface ProseNodeType<
// 	S extends ProseSchema,
// 	N extends ProseNodeT<S> = ProseNodeT<S> 
// > extends NodeType<S> {
// 	name: N
// }

export interface ProseNodeType<
	S extends ProseSchema,
	N extends ProseNodeT<S> = ProseNodeT<S> 
> extends NodeType<S> {
	name: N
}

/** Like { Node } from "prosemirror-model", but more precise. */
export interface ProseMarkType<
	S extends ProseSchema,
	M extends ProseMarkT<S> = ProseMarkT<S> 
> extends MarkType<S> {
	name: M
}

type SchemaT = ProseSchema<"paragraph" | "heading", "emphasis" | "strong">;

type W = ProseNodeType<SchemaT>
let node: ProseNodeType<SchemaT> = null as any;
let mark: ProseMarkType<SchemaT> = null as any;

let schema: SchemaT = null as any;
let x = schema.nodes.heading;
let y = x.name;

let name = node.name;
let name2 = mark.name;