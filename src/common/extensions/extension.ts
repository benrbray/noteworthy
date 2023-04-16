// prosemirror imports
import { Node as ProseNode, NodeSpec, MarkSpec } from "prosemirror-model";
import { InputRule } from "prosemirror-inputrules"
import { Keymap } from "prosemirror-commands"
import { NodeView } from "prosemirror-view";

// project imports
import { ProseSchema, ProseNodeType, ProseMarkType, NodeViewConstructor } from "@common/types";

// unist
import * as Uni from "unist";
import * as Md from "@common/markdown/markdown-ast";
import { ProseMarkMap, ProseNodeMap } from "./editor-config";

////////////////////////////////////////////////////////////

// Extension Types inspired by ReMirror
// https://github.com/remirror/remirror/blob/next/packages/%40remirror/core/src/extension/extension-base.ts

export interface ExtensionStore<S extends ProseSchema> {
	schema: S;
}

export abstract class SyntaxExtension<S extends ProseSchema = ProseSchema, N extends string = string> {
	abstract get name(): N;
	
	/**
	 * Throw an error if the extension's `_store` field hasn't yet been populated.
	 * (useful as a type guard to avoid null-checking boilerplate in syntax extensions.)
	 */
	ensureInitialized(): this is { _store: ExtensionStore<S> } {
		if(this._store === null || this._store === undefined) {
			throw new Error(`Attempted to access NwtExtension (${this.name}) before initialization.`);
		}
		return true;
	}
	
	// properties that will be added later
	_store:ExtensionStore<S>|null = null;
	get store():ExtensionStore<S> {
		if(!this.ensureInitialized()) { throw new Error("not iniialized"); }
		return this._store;
	}
	
	createInputRules(): InputRule[] { return []; }
	createKeymap(): Keymap          { return {}; }
}

export abstract class NodeExtension<N extends string = string> extends SyntaxExtension<ProseSchema<N,string>, N> {
	/** 
	 * Returns the ProseMirror NodeType defined by this extension.
	 * (not available until the extension has been used to create a schema) 
	 */
	get nodeType(): ProseNodeType<ProseSchema, N> {
		let type = this.store.schema.nodes[this.name];
		if(type === undefined) { throw new Error(`error retrieving node type for extension ${this.name}`); }
		return type;
	}
	
	abstract createNodeSpec(): NodeSpec;
	createNodeView(): NodeViewConstructor|null { return null; }
}

export abstract class MarkExtension<M extends string = string> extends SyntaxExtension<ProseSchema<string,M>, M> {
	/** 
	 * Returns the ProseMirror MarkType defined by this extension.
	 * (not available until the extension has been used to create a schema) 
	 */
	get markType(): ProseMarkType<ProseSchema<string, M>, M> {
		let type = this.store.schema.marks[this.name];
		if(type === undefined) { throw new Error(`error retrieving mark type for extension ${this.name}`); }
		return type;
	}

	abstract createMarkSpec(): MarkSpec;
}

export abstract class NodeSyntaxExtension<T extends Md.Node, N extends string = string> extends NodeExtension<N> {
	abstract get mdastNodeType(): T["type"];

	/**
	 * Mapping from Mdast node node to ProseMirror node.
	 */
	abstract createMdastMap() : MdastNodeMap<T>;
	
	/**
	 * Extensions provide this method to impose additional
	 * conditions on the incoming Mdast node type, beyond
	 * `node.type = T`.
	 */
	mdastNodeTest(node: T): boolean { return true; }

	/**
	 * Mapping from ProseMirror node to Mdast node.
	 */
	abstract prose2mdast(): Prose2Mdast_NodeMap;
}

export abstract class MarkSyntaxExtension<T extends Md.Node, M extends string = string> extends MarkExtension<M> {
	abstract get mdastNodeType(): T["type"];
	
	/**
	 * Mapping from Mdast node node to ProseMirror node.
	 */
	abstract createMdastMap() : MdastMarkMap<T>;

	/**
	 * Extensions can provide this method to impose additional
	 * conditions on the Mdast node type, beyond `node.type = T`.
	 */
	mdastNodeTest(node: T): boolean { return true; }

	/**
	 * Mapping from ProseMirror node to Mdast node.
	 */
	abstract prose2mdast(): Prose2Mdast_MarkMap;
}

//// PROSEMIRROR HELPERS ///////////////////////////////////

/** Get the attributes of the ProseMirror Node defined by the `NE` extension. */
export type ExtensionNodeAttrs<
	NE extends NodeExtension<any>,
	RT=ReturnType<NE["createNodeSpec"]>["attrs"]
> = { [K in keyof RT] : RT[K] extends { default: infer D } ? D : unknown };

//// MARKDOWN SYNTAX EXTENSIONS ////////////////////////////

// -- Describe Mappings from Unist -> ProseMirror ----------

export type MdNodeMap_Custom<
	N extends Uni.Node = Uni.Node,
	S extends ProseSchema = ProseSchema
> = {
	mapType: "node_custom",
	mapNode: (node: N, children: ProseNode<S>[], ctx: unknown, state: unknown) => ProseNode<S>[];
}

export type MdMarkMap_Custom<
	N extends Uni.Node = Uni.Node,
	S extends ProseSchema = ProseSchema
> = {
	mapType: "mark_custom",
	mapMark: (node: N, children: ProseNode<S>[]) => ProseNode<S>[];
}

export enum MdastNodeMapType {
	NODE_DEFAULT = "node_default",
	NODE_EMPTY   = "node_empty",
	NODE_LITERAL = "node_literal"
}

export enum MdastMarkMapType {
	MARK_DEFAULT = "mark_default",
	MARK_LITERAL = "mark_literal"
}

export type MdastNodeMap<N extends Uni.Node>
	= MdNodeMap_Custom<N>
	| MdastNodeMapType

export type MdastMarkMap<N extends Uni.Node>
	= MdMarkMap_Custom<N>
	| MdastMarkMapType

// -- Describe Mappings from ProseMirror -> Unist ----------

export enum Prose2Mdast_NodeMap_Presets {
	NODE_DEFAULT = "p2m_node_default",
	NODE_EMPTY   = "p2m_node_empty",
	NODE_LIFT_LITERAL = "p2m_node_literal"
}

export type Prose2Mdast_NodeMap<Ctx=unknown, St=unknown>
	= Prose2Mdast_NodeMap_Presets
	| { create : ProseNodeMap<Ctx, St> };

export enum Prose2Mdast_MarkMap_Presets {
	MARK_DEFAULT = "p2m_mark_default",
	MARK_LITERAL = "p2m_mark_literal"
}

export type Prose2Mdast_MarkMap
	= Prose2Mdast_MarkMap_Presets
	| { create : ProseMarkMap };