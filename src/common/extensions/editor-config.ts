// prosemirror imports
import { Schema as ProseSchema, Node as ProseNode, NodeSpec, MarkSpec, DOMOutputSpec } from "prosemirror-model";
import {
	InputRule, inputRules as makeInputRules,
} from "prosemirror-inputrules"
import {
	chainCommands, baseKeymap, Keymap, Command as ProseCommand,
} from "prosemirror-commands"
import { Plugin as ProsePlugin } from "prosemirror-state";

// project imports
import { keymap as makeKeymap } from "prosemirror-keymap";
import { DefaultMap } from "@common/util/DefaultMap";
import { MarkdownParser, makeMarkdownParser } from "@common/markdown";
import { NwtExtension, NodeExtension, MarkExtension } from "./extension";

//// EDITOR CONFIG /////////////////////////////////////////

export class EditorConfig {
	schema:ProseSchema;
	plugins:ProsePlugin[];

	private _parser: MarkdownParser;

	constructor(extensions:NwtExtension[], plugins:ProsePlugin[], keymap:Keymap){
		this.schema = this._buildSchema(extensions);
		this.plugins = this._buildPlugins(extensions, plugins.concat(makeKeymap(keymap)));

		this._parser = makeMarkdownParser(this.schema);
	}

	parse(text: string): ProseNode | null {
		return this._parser.parse(text);
	}

	private _buildSchema(extensions:NwtExtension[]):ProseSchema {
		// default node and mark specs
		let markSpecs: { [x:string] : MarkSpec } = {};
		let nodeSpecs: { [x:string] : NodeSpec } = { 
			doc: {
				content: "block+",
				attrs: { yamlMeta: { default: {} } }
			},
			text: {
				group: "inline"
			},
			paragraph: {
				content: "inline*",
				attrs: { class: { default: undefined } },
				group: "block",
				parseDOM: [{ tag: "p" }],
				toDOM(node: ProseNode): DOMOutputSpec { return ["p", { ...(node.attrs.class && { class: node.attrs.class }) }, 0] }
			},
		};

		// create node and mark specs
		for(let ext of extensions){
			/** @todo (9/27/20) handle duplicate node/mark names? */
			let name = ext.name;
			if(name in nodeSpecs){ throw new Error(`duplicate node name '${name}'!`); }
			if(name in markSpecs){ throw new Error(`duplicate mark name '${name}'!`); }
			
			if(ext instanceof NodeExtension){
				nodeSpecs[name] = ext.createNodeSpec();
			} else if(ext instanceof MarkExtension){
				markSpecs[name] = ext.createMarkSpec();
			}
		}

		// build schema
		let schema = new ProseSchema({
			"nodes" : nodeSpecs,
			"marks" : markSpecs
		});

		// attach NodeType info to extension stores
		for(let ext of extensions){
			ext._store = { schema };
		}

		return schema;
	}

	private _buildPlugins(extensions:NwtExtension[], plugins:ProsePlugin[] = []): ProsePlugin[] {
		let inputRules: InputRule[] = [];

		// keymap
		let keymaps = new DefaultMap<string, ProseCommand[]>( _ => [] );

		// create node and mark specs
		for(let ext of extensions) {

			// accumulate input rules
			inputRules = inputRules.concat(ext.createInputRules());
			
			// accumulate keymaps
			let extKeymap = ext.createKeymap();
			for(let key in ext.createKeymap()) {
				keymaps.get(key).push(extKeymap[key]);
			}
		}

		// combine all input rules as single ProseMirror plugin
		plugins.push(makeInputRules({ rules: inputRules }));

		// include extension keymaps
		/** @todo (9/27/20) sort keymap entries by priority? */
		let keymap:Keymap = { };
		keymaps.forEach((cmds, key) => { 
			keymap[key] = chainCommands(...cmds);
		});
		plugins.push(makeKeymap(keymap));

		// include base keymap
		/** @todo (9/27/20) sort keymap entries by priority? */
		plugins.push(makeKeymap(baseKeymap));

		return plugins;
	}
}