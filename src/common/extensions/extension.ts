// prosemirror imports
import { Node as ProseNode, NodeSpec, MarkSpec, DOMOutputSpec } from "prosemirror-model";
import {
	InputRule, inputRules as makeInputRules,
} from "prosemirror-inputrules"
import {
	chainCommands, baseKeymap, Keymap, Command as ProseCommand,
} from "prosemirror-commands"
import { Plugin as ProsePlugin } from "prosemirror-state";
import { NodeView } from "prosemirror-view";

// project imports
import { keymap as makeKeymap } from "prosemirror-keymap";
import { DefaultMap } from "@common/util/DefaultMap";
import { MarkdownParser, makeMarkdownParser } from "@common/markdown";
import { ProseSchema, ProseNodeType, ProseMarkType } from "@common/types";

// unist
import * as Uni from "unist";

////////////////////////////////////////////////////////////

// Extension Types inspired by ReMirror
// https://github.com/remirror/remirror/blob/next/packages/%40remirror/core/src/extension/extension-base.ts

export interface ExtensionStore<S extends ProseSchema> {
	schema: S;
}

export abstract class NwtExtension<S extends ProseSchema = ProseSchema, N extends string = string> {
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

export abstract class PlainExtension<N extends string = string> extends NwtExtension<ProseSchema<string,string>, N> { }

export abstract class NodeExtension<T extends Uni.Node, N extends string = string> extends NwtExtension<ProseSchema<N,string>, N> {
	/** 
	 * Returns the ProseMirror NodeType defined by this extension.
	 * (not available until the extension has been used to create a schema) 
	 */
	get nodeType(): ProseNodeType<ProseSchema<N, string>, N> {
		let type = this.store.schema.nodes[this.name];
		if(type === undefined) { throw new Error(`error retrieving node type for extension ${this.name}`); }
		return type;
	}
	
	abstract createNodeSpec(): NodeSpec;
	createNodeView(): NodeView|null { return null; }

	abstract get mdastNodeType(): T["type"];
	abstract createMdastMap() : MdastNodeMap<T>;
}

export abstract class MarkExtension<T extends Uni.Node, M extends string = string> extends NwtExtension<ProseSchema<string,M>, M> {
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

	abstract get mdastNodeType(): T["type"];
	abstract createMdastMap() : MdastMarkMap<T>;
}

//// MARKDOWN SYNTAX EXTENSIONS ////////////////////////////

// -- Describe Mappings from Unist -> ProseMirror ----------

export type MdNodeMap_Custom<
	N extends Uni.Node = Uni.Node,
	S extends ProseSchema = ProseSchema
> = {
	mapType: "node_custom",
	mapNode: (node: N, children: ProseNode<S>[]) => ProseNode<S>[];
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
	MARK_DEFAULT = "mark_default"
}

export type MdastNodeMap<N extends Uni.Node>
	= MdNodeMap_Custom<N>
	| MdastNodeMapType

export type MdastMarkMap<N extends Uni.Node>
	= MdMarkMap_Custom<N>
	| MdastMarkMapType

//export type MdastNodeType<E extends MdSyntaxExtension<any>> = E extends MdSyntaxExtension<infer N> ? N : never;