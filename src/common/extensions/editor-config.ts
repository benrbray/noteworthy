// prosemirror imports
import { Schema, Node as ProseNode, Mark as ProseMark, NodeSpec, MarkSpec, DOMOutputSpec } from "prosemirror-model";
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
import { NwtExtension, NodeExtension, MarkExtension, MdastNodeMapType, MdastMarkMapType, Prose2Mdast_NodeMap_Presets, Prose2Mdast_MarkMap_Presets } from "./extension";
import * as prose2mdast from "@common/markdown/prose2mdast";

// patched prosemirror types 
import { ProseSchema } from "@common/types";
import { makeParser, markMapBasic, markMapStringLiteral, MdParser, nodeMapBasic, nodeMapLeaf, nodeMapStringLiteral } from "@common/markdown/mdast2prose";

// unist
import * as Uni from "unist";
import * as Md from "@common/markdown/markdown-ast";
import { MdSerializer } from "@common/markdown/prose2mdast";
import { MdError } from "@common/markdown/remark-plugins/error/remark-error";
import { unistIsStringLiteral } from "@common/markdown/unist-utils";

//// EDITOR CONFIG /////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////

type AstNode<BaseT extends Uni.Node> = BaseT | AstParent<BaseT>
type AstParent<BaseT extends Uni.Node> = Uni.Parent & BaseT & { children: AstNode<BaseT> };

// -- Mdast2Prose --------------------------------------------------------------

export type UnistNodeTest<S extends ProseSchema = ProseSchema, T extends Uni.Node = Uni.Node> = {
	test?: (x: T) => boolean;
	map:  (x: T, children: ProseNode<S>[], ctx: unknown, state: unknown) => ProseNode<S>[];
}

export type UnistMapper<K extends string = string, S extends ProseSchema = ProseSchema>
	= DefaultMap<K, UnistNodeTest<S>[]>;

// -- Prose2Mdast --------------------------------------------------------------

/**
 * Create a ProseMirror node from a Unist node and its list of 
 * children, which have already been converted to ProseMirror nodes.

 * TODO (2021-05-17) should the node map return new context/state,
 *   instead of context/state being specified by separate maps?
 */
export type ProseNodeMap<Ctx=unknown, St=unknown>
	= (node: ProseNode, children:Uni.Node[], ctx: Ctx, state: St) => Uni.Node[];

/**
 * The given `node` should have `mark` as one of its marks.  Return an appropriate
 * node to represent their combination.  (usually a simple wrapper node)   
 */
export type ProseMarkMap
	= (mark: ProseMark, node:Uni.Node) => Uni.Node;

export type ProseNodeTest<S extends ProseSchema = ProseSchema, N extends ProseNode<S> = ProseNode<S>> = {
	test?: (x: N) => boolean;
	map: ProseNodeMap<unknown, unknown>
}

export type ProseMarkTest<M extends ProseMark = ProseMark> = {
	/** Predicate to decide whether this mapper can be used for the specified mark. */
	test?: (mark: M) => boolean;
	map: ProseMarkMap
}

export type ProseMapper<
	N extends string = string,
	M extends string = string,
	S extends ProseSchema<N,M> = ProseSchema<N,M>
> = {
	/** A map from ProseMirror Nodes -> Unist Nodes */
	nodes: DefaultMap<N, ProseNodeTest<S>[]>;
	/** A map from ProseMirror Marks -> Unist Nodes */
	marks: DefaultMap<M, ProseMarkTest[]>;
}

////////////////////////////////////////////////////////////////////////////////

export class EditorConfig<S extends ProseSchema = ProseSchema> {
	schema: S & ProseSchema<"error_block","error_inline">;
	plugins:ProsePlugin[];

	private _mdast2prose: UnistMapper;
	private _prose2mdast: ProseMapper;
	private _parser: MdParser<S>;
	private _serializer: MdSerializer;

	constructor(extensions:NwtExtension<S>[], plugins:ProsePlugin[], keymap:Keymap){
		/** Step 1: Build Schema
		 * @effect Populates the `.type` field of each extension with a
		 *    ProseMirror NodeType, which can be referenced during plugin creation.
		 * @note it is important that schema creation happens FIRST, so that
		 *    the necessary NodeType / MarkType objects are initialized.
		 */
		this.schema = this._buildSchema(extensions);

		/** Step 2: Build Plugins */
		this.plugins = this._buildPlugins(extensions, plugins.concat(makeKeymap(keymap)));

		/** Step 3a: Build Mapping from Unist AST -> ProseMirror Document */
		this._mdast2prose = this._buildMdast2Prose(extensions);

		/** Step 3b: Build Document Parser for this Configuration */

		// TODO: (2021-05-09) revisit type inference timeout caused by
		// attempt to thread the ProseSchema type through `makeParser`
		// @ts-ignore (ts2589) Type instantiation is excessively deep and possibly infinite.
		let parser = makeParser(this.schema, this._mdast2prose);
		this._parser = parser as MdParser<S>;

		/** Step 4a: Build Mapping from ProseMirror Document -> Unist AST */
		this._prose2mdast = this._buildProse2Mdast(extensions);

		/** Step 4b: Build Markdown Serializer for this Configuration */
		this._serializer = prose2mdast.makeSerializer(this._prose2mdast);
	}

	parse(markdown: string): ProseNode | null {
		return this._parser(markdown);
	}

	serialize(doc: ProseNode): string | null {
		return this._serializer(doc);
	}

	// -- Build Schema ------------------------------------------------------ //

	private _buildSchema(extensions:NwtExtension<S>[]): S & ProseSchema<"error_block","error_inline"> {
		// default mark specs
		let markSpecs: { [x:string] : MarkSpec } = {
			error_inline: {
				parseDOM: [{tag: "code.error-inline"}],
				toDOM() {
					return ["code", { class: "error-inline" }];
				}
			}
		};

		// default node specs
		let nodeSpecs: { [x:string] : NodeSpec } = { 
			text: { group: "inline" }
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

		// error block spec must be created last,
		// to avoid becoming the default top-level block node
		// TODO (2021-05-17) can error blocks be defined as an extension instead?
		nodeSpecs["error_block"] = {
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

	// -- Build Plugins ----------------------------------------------------- //

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

	// -- Build Mdast2Prose ------------------------------------------------- //

	private _buildMdast2Prose(extensions: NwtExtension<S>[]): UnistMapper {
		// maintain a map from AST nodes -> ProseMirror nodes
		// each value in the map is an array of mappers, which
		// are tested in order until one returns `true`
		let result: UnistMapper
			= new DefaultMap<string, UnistNodeTest[]>(_ => []);

		// provide default handler for text nodes
		result.get("text").push({
			map: (node, _) => {
				return [this.schema.text( (node as Md.Text).value )];
			}
		});

		// TODO (2021-05-17) we should be able to ignore YAML nodes with an extension,
		// rather than defining this special handler here
		result.get("yaml").push({
			// ignore yaml nodes, as they are handled differently
			map: (node, _) => []
		});
		
		// accumulate node maps
		for(let ext of extensions) {
			let nodeType: string|null = null;
			let mapper: ((node: Uni.Node, children: ProseNode[], ctx:unknown, state:unknown) => ProseNode[]) | null = null;
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
		
		return result;
	}

	// -- Build Prose2Mdast ------------------------------------------------- //

	private _buildProse2Mdast(extensions: NwtExtension<S>[]): ProseMapper {
		// maintain a map from ProseMirror nodes -> AST nodes
		// each value in the map is an array of mappers, which
		// are tested in order until one returns `true`
		let result: ProseMapper = {
			nodes: new DefaultMap<string, ProseNodeTest[]>(_ => []),
			marks: new DefaultMap<string, ProseMarkTest[]>(_ => [])
		}

		// special handler for block errors
		result.nodes.get("error_block").push({
			map: (node: ProseNode, children: Uni.Node[]): [MdError] => {
				// expect children to contain only text nodes
				if(children.find(n => (n.type !== "text")) !== undefined) {
					throw new Error("expected error_block to contain only text nodes!");
				}

				// serialize contents
				return [{
					type: "error",
					value: node.textContent
				}];
			}
		});

		// special handlers for inline errors
		result.marks.get("error_inline").push({
			map: (mark: ProseMark, node: Uni.Node): MdError => {
				// expect literal node
				if(!unistIsStringLiteral(node)) { throw new Error("expected error_inline to be a text node"); }

				return {
					type: "error",
					value: node.value
				};
			}
		});
		
		// accumulate node / mark handlers for each extension
		for(let ext of extensions) {

			// accumulate node handlers
			if(ext instanceof NodeExtension) {
				let mapper: ProseNodeMap<unknown, unknown>;
				let p2m = ext.prose2mdast();
				let proseNodeType: string = ext.nodeType.name;

				// do not allow plugins to override handling of text nodes
				if(proseNodeType === "text") {
					// TODO (2021-05-19) error handling
					console.error("[prose2mdast] cannot override default handling of text nodes ; ignoring plugin-specified handler!");
					continue;
				}

				// TODO: (2021-05-18) clean this up
				if(p2m === Prose2Mdast_NodeMap_Presets.NODE_DEFAULT) {
					mapper = prose2mdast.nodeMapDefault(ext.mdastNodeType);
				} else if(p2m === Prose2Mdast_NodeMap_Presets.NODE_EMPTY) {
					mapper = prose2mdast.nodeMapEmpty(ext.mdastNodeType);
				} else if(p2m === Prose2Mdast_NodeMap_Presets.NODE_LIFT_LITERAL) {
					mapper = prose2mdast.nodeMapLiftLiteral(ext.mdastNodeType);
				} else {
					mapper = p2m.create;
				}

				// add this mapper to the list of mappers for nodeType
				result.nodes.get(proseNodeType).push({
					map: mapper,
				});
			}
			// accumulate mark handlers
			else if(ext instanceof MarkExtension) {
				let mapper: ProseMarkMap;
				let p2m = ext.prose2mdast();

				// TODO: (2021-05-18) clean this up
				if(p2m === Prose2Mdast_MarkMap_Presets.MARK_DEFAULT) {
					mapper = prose2mdast.markMapDefault(ext.mdastNodeType);
				} else if(p2m === Prose2Mdast_MarkMap_Presets.MARK_LITERAL) {
					mapper = prose2mdast.markMapLiteral(ext.mdastNodeType);
				} else {
					mapper = p2m.create;
				}

				// add this mapper to the list of mappers for nodeType
				let proseMarkType: string = ext.markType.name;
				result.marks.get(proseMarkType).push({
					map: mapper,
				});
			}

		}
		
		return result;
	}
}