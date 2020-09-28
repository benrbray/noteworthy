// prosemirror imports
import { Schema as ProseSchema, NodeType, MarkType, Node as ProseNode, NodeSpec, MarkSpec, DOMOutputSpec } from "prosemirror-model";
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

////////////////////////////////////////////////////////////

// Extension Types inspired by ReMirror
// https://github.com/remirror/remirror/blob/next/packages/%40remirror/core/src/extension/extension-base.ts

export interface ExtensionStore {
	schema: ProseSchema;
}

export abstract class NwtExtension {
	abstract get name():string;
	
	// properties that will be added later
	_store:ExtensionStore|null = null;
	get store():ExtensionStore {
		if(this._store == null){ throw new Error("extension store not yet initialized!"); }
		return this._store;
	}
	
	createInputRules(): InputRule[] { return []; }
	createKeymap(): Keymap          { return {}; }
}

export abstract class PlainExtension extends NwtExtension { }

export abstract class NodeExtension extends NwtExtension {
	/** 
	 * Returns the ProseMirror NodeType defined by this extension.
	 * (not available until the extension has been used to create a schema) 
	 */
	get type(): NodeType {
		let type = this.store.schema.nodes[this.name];
		if(type === undefined) { throw new Error(`error retrieving node type for extension ${this.name}`); }
		return type;
	}
	
	abstract createNodeSpec(): NodeSpec;
	createNodeView(): NodeView|null { return null; }
}

export abstract class MarkExtension extends NwtExtension {
	/** 
	 * Returns the ProseMirror MarkType defined by this extension.
	 * (not available until the extension has been used to create a schema) 
	 */
	get type(): MarkType {
		let type = this.store.schema.marks[this.name];
		if(type === undefined) { throw new Error(`error retrieving mark type for extension ${this.name}`); }
		return type;
	}

	abstract createMarkSpec(): MarkSpec;
}