// prosemirror imports
import { Schema, Node as ProseNode, NodeSpec, MarkSpec, DOMOutputSpec } from "prosemirror-model";
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
import { NwtExtension, NodeExtension, MarkExtension, MdastNodeMapType, MdastMarkMapType } from "./extension";

// patched prosemirror types 
import { ProseSchema } from "@common/types";
import { makeParser, markMapBasic, markMapStringLiteral, MdMapper, MdParser, nodeMapBasic, nodeMapLeaf, nodeMapStringLiteral } from "@common/markdown/mdast2prose";

// unist
import * as Uni from "unist";
import * as Md from "mdast";

//// EDITOR CONFIG /////////////////////////////////////////

// ---------------------------------------------------------
// https://github.com/microsoft/TypeScript/issues/27995#issuecomment-441157546

export type ArrayKeys = keyof any[];
export type Indices<T> = Exclude<keyof T, ArrayKeys>;

type Foo = ['a', 'c'];

interface Bar {
  a: string;
  b: number;
  c: Promise<any>
  d: boolean;
}

type Baz = { [K in Indices<Foo>]: Bar[Foo[K]] }; // type is { "0": string, "1": number }

// ---------------------------------------------------------

type Elt<A=any,B=any> = { a:A, b:B }

let item1 = { a: "apple", b: "aardvark" } as const;
let item2 = { a: "banana", b: "beluga"  } as const;
let item3 = { a: "cherry", b: "cat"     } as const;

let itemsTuple = [ item1, item2, item3 ] as const

type TTT = Indices<typeof itemsTuple>;

type Three<T extends readonly [ Elt, Elt, Elt ]> = [T[0]["a"], T[1]["a"], T[2]["a"]];

//type Inf<T extends readonly [ ...Elt[] ]> = [ T[0]["a"] ]
//type Inft<T extends readonly [ A, ...B ], A extends Elt = Elt, B extends Elt[] = Elt[]> = [ T[0]["a"], ...Inft<B> ]

// it works!
type Inf<T> = { [Idx in Indices<T>] : T[Idx] extends Elt<infer A, any> ? A : never };
type ItemsT = typeof itemsTuple;
type Z = Inf<ItemsT> 

//////////


type AstNode<BaseT extends Uni.Node> = BaseT | AstParent<BaseT>
type AstParent<BaseT extends Uni.Node> = Uni.Parent & BaseT & { children: AstNode<BaseT> };

export type UnistNodeTest<S extends ProseSchema = ProseSchema, T extends Uni.Node = Uni.Node> = {
	test?: (x: T) => boolean;
	map:  (x: T, children: ProseNode<S>[]) => ProseNode<S>[];
}

export type UnistMapper<K extends string = string, S extends ProseSchema = ProseSchema> = DefaultMap<K, UnistNodeTest<S>[]>;

export class EditorConfig<S extends ProseSchema = ProseSchema> {
	schema: S & ProseSchema<"error_block","error_inline">;
	plugins:ProsePlugin[];

	private _mdast2prose: UnistMapper;
	private _parser: MdParser<S>;

	constructor(extensions:NwtExtension<S>[], plugins:ProsePlugin[], keymap:Keymap){
		/** Step 1: Build Schema
		 * @effect Populates the `.type` field of each extension with a
		 *    ProseMirror NodeType, which can be referenced during plugin creation.
		 */
		this.schema = this._buildSchema(extensions);

		/** Step 2: Build Plugins
		 * @note it is important that this happens AFTER schema creation, so that
		 *    the necessary NodeType / MarkType objects have been initialized.
		 */
		this.plugins = this._buildPlugins(extensions, plugins.concat(makeKeymap(keymap)));

		/** Step 3: Build Mapping from Unist AST -> ProseMirror Document
		 * @note it is important that this happens AFTER schema creation, so that
		 *    the necessary NodeType / MarkType objects have been initialized.
		 */
		this._mdast2prose = this._buildMdastMap(extensions);

		/** Step 4: Build Parser
		 * Create a document parser for this configuration.
		 */
		
		// TODO: (2021-05-09) revisit type inference timeout caused by
		// attempt to thread the ProseSchema type through `makeParser`
		// @ts-ignore (ts2589) Type instantiation is excessively deep and possibly infinite.
		let parser = makeParser(this.schema, this._mdast2prose);
		this._parser = parser as MdParser<S>;
	}

	parse(markdown: string): ProseNode | null {
		return this._parser(markdown);
		//return this._parser.parse(text);
	}

	private _buildSchema(extensions:NwtExtension<S>[]): S & ProseSchema<"error_block","error_inline"> {
		// default mark specs
		let markSpecs: { [x:string] : MarkSpec } = {
			error_inline: {
				parseDOM: [{tag: "code.parse-error-inline"}],
				toDOM() {
					return ["code", { class: "parse-error-inline" }];
				}
			}
		};

		// default node specs
		let nodeSpecs: { [x:string] : NodeSpec } = { 
			doc: {
				content: "block+",
				attrs: { yamlMeta: { default: {} } }
			},
			text: {
				group: "inline"
			},
			error_block: {
				content: "text*",
				group: "block",
				code: true,
				defining: true,
				marks: "",
				attrs: {params: {default: ""}},
				parseDOM: [{
					tag: "pre.error-block",
					preserveWhitespace: "full",
					getAttrs: node => {
						return {params: (node as HTMLElement).getAttribute("data-params") || ""}
					}
				}],
				toDOM(node) { 
					let dataParams = node.attrs.params ? {"data-params": node.attrs.params} : {};
					let attrs = { ...dataParams, class: "error-block" }
					return ["pre", attrs, ["code", 0]] 
				}
			},
		};

		// create node and mark specs
		for(let ext of extensions){
			/** @todo (9/27/20) handle duplicate node/mark names? */
			let name = ext.name;
			if(name in nodeSpecs){ throw new Error(`duplicate node name '${name}'!`); }
			if(name in markSpecs){ throw new Error(`duplicate mark name '${name}'!`); }
			
			// TODO what if extension wants to define both a node and a mark?
			// TODO what if extension wants to define multiple nodes?
			// (favor composition over inheritance)
			if(ext instanceof NodeExtension){
				nodeSpecs[name] = ext.createNodeSpec();
			} else if(ext instanceof MarkExtension){
				markSpecs[name] = ext.createMarkSpec();
			}
		}

		console.log(JSON.stringify(nodeSpecs, undefined, 2));

		// build schema
		// TODO: speicalize to ProseSchema<N,M> for some N,M?
		// TODO: is this cast sound?
		let schema = new Schema({
			"nodes" : nodeSpecs,
			"marks" : markSpecs
		}) as S & ProseSchema<"error_block","error_inline">;

		// attach NodeType info to extension stores
		for(let ext of extensions){
			ext._store = { schema };
		}

		return schema;
	}

	private _buildPlugins(extensions:NwtExtension<S>[], plugins:ProsePlugin[] = []): ProsePlugin[] {
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
		let resultPlugins = [];
		resultPlugins.push(makeInputRules({ rules: inputRules }));

		// include extension keymaps
		/** @todo (9/27/20) sort keymap entries by priority? */
		let keymap:Keymap = { };
		keymaps.forEach((cmds, key) => { 
			keymap[key] = chainCommands(...cmds);
		});
		resultPlugins.push(makeKeymap(keymap));

		// include base keymap
		/** @todo (9/27/20) sort keymap entries by priority? */
		resultPlugins.push(makeKeymap(baseKeymap));

		// provided plugins go last
		return resultPlugins.concat(plugins);
	}

	private _buildMdastMap(extensions: NwtExtension<S>[]): UnistMapper {
		// maintain a map from AST nodes -> ProseMirror nodes
		// each value in the map is an array of mappers, which
		// are tested in order until one returns `true`
		let result: UnistMapper
			= new DefaultMap<string, UnistNodeTest[]>(_ => []);

		result.get("text").push({
			map: (node, _) => {
				return [this.schema.text( (node as Md.Text).value )];
			}
		});
		
		for(let ext of extensions) {
			let nodeType: string|null = null;
			let mapper: ((node: Uni.Node, children: ProseNode[]) => ProseNode[]) | null = null;
			let nodeTest: ((node: Uni.Node) => boolean) | null = null;
			
			// TODO: (2021-05-09) clean this up
			if(ext instanceof NodeExtension) {
				let mdastMap = ext.createMdastMap();

				nodeTest = ext.mdastNodeTest;
				nodeType = ext.mdastNodeType;

				if(mdastMap === MdastNodeMapType.NODE_DEFAULT) {
					mapper = nodeMapBasic(ext.nodeType);
				} else if(mdastMap === MdastNodeMapType.NODE_EMPTY) {
					mapper = nodeMapLeaf(ext.nodeType);
				} else if(mdastMap === MdastNodeMapType.NODE_LITERAL) {
					// TODO: avoid cast                        vvvv
					mapper = nodeMapStringLiteral(ext.nodeType) as (node: Uni.Node, children: ProseNode[]) => ProseNode[];
				} else {
					mapper = mdastMap.mapNode;
				}
			} else if(ext instanceof MarkExtension) {
				let mdastMap = ext.createMdastMap();

				nodeTest = ext.mdastNodeTest;
				nodeType = ext.mdastNodeType;

				if(mdastMap === MdastMarkMapType.MARK_DEFAULT) {
					mapper = markMapBasic(ext.markType);
				} else if(mdastMap === MdastMarkMapType.MARK_LITERAL) {
					// TODO: avoid cast                        vvvv
					mapper = markMapStringLiteral(ext.markType) as (node: Uni.Node, children: ProseNode[]) => ProseNode[];
				} else {
					mapper = mdastMap.mapMark;
				}
			}
			
			if(mapper && nodeType && nodeTest) {
				// add this mapper to the list of mappers for nodeType
				result.get(nodeType).push({
					map: mapper,
					test: nodeTest
				});
			}
		}

		console.log("_buildMdastMap")
		console.log(Object.keys(result))
		
		return result;
	}
}