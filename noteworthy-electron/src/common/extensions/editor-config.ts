// prosemirror imports
import { Schema as ProseSchema, Node as ProseNode, Mark as ProseMark, NodeSpec, MarkSpec } from "prosemirror-model";
import { InputRule } from "prosemirror-inputrules"
import {
	chainCommands, baseKeymap,
} from "prosemirror-commands"
import { Plugin as ProsePlugin, Command as ProseCommand } from "prosemirror-state";
import { keymap as makeKeymap } from "prosemirror-keymap";

// patched prosemirror types
import { ProseKeymap } from "@common/types";
import { markMapBasic, markMapStringLiteral, MdParser, nodeMapBasic, nodeMapLeaf, nodeMapStringLiteral } from "@common/markdown/mdast2prose";

// unist / unified
import * as Uni from "unist";
import * as Md from "@common/markdown/markdown-ast";
import unified, { Processor } from "unified";
import { MdSerializer } from "@common/markdown/prose2mdast";
import { MdError } from "@common/markdown/remark-plugins/error/remark-error";
import { unistIsStringLiteral } from "@common/markdown/unist-utils";

// remark and remark plugins
import remark from "remark-parse";
import remarkMathPlugin from "remark-math";          // latex math blocks
import remarkFrontMatter from "remark-frontmatter";  // yaml frontmatter
import remarkGfm from "remark-gfm";                  // tables, heading ids
import remarkFootnotes from "remark-footnotes";      // pandoc footnotes
import remarkStringify from "remark-stringify";      // markdown to string
import remarkDirective from "remark-directive";      // commonmark directives

// custom remark plugins
import { citePlugin as remarkCitePlugin } from "@benrbray/remark-cite";
import { wikiLinkPlugin as remarkWikilinkPlugin } from '@common/markdown/remark-plugins/wikilink/remark-wikilink';
import { remarkErrorPlugin } from "@common/markdown/remark-plugins/error/remark-error";
import { remarkConcretePlugin } from "@common/markdown/remark-plugins/concrete/remark-concrete";
import { remarkUnwrapImagePlugin } from "@common/markdown/remark-plugins/unwrap-image/remark-unwrap-image";

// project imports
import { DefaultMap } from "@common/util/DefaultMap";
import { SyntaxExtension, NodeExtension, MarkExtension, MdastNodeMapType, MdastMarkMapType, Prose2Mdast_NodeMap_Presets, Prose2Mdast_MarkMap_Presets, MarkSyntaxExtension, NodeSyntaxExtension } from "@common/extensions/extension";
import * as prose2mdast from "@common/markdown/prose2mdast";
import * as mdast2prose from "@common/markdown/mdast2prose";
import { makeInputRulePlugin } from "@common/prosemirror/inputRules";
import { NodeViewConstructor } from "prosemirror-view";

//// EDITOR CONFIG /////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////

type AstNode<BaseT extends Uni.Node> = BaseT | AstParent<BaseT>
type AstParent<BaseT extends Uni.Node> = Uni.Parent & BaseT & { children: AstNode<BaseT> };

// -- Mdast2Prose --------------------------------------------------------------

export type UnistNodeTest<T extends Uni.Node = Uni.Node> = {
	test?: (x: T) => boolean;
	map:  (x: T, children: ProseNode[], ctx: unknown, state: unknown) => ProseNode[];
}

export type UnistMapper<K extends string = string>
	= DefaultMap<K, UnistNodeTest[]>;

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

export type ProseNodeTest<N extends ProseNode = ProseNode> = {
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
	M extends string = string
> = {
	/** A map from ProseMirror Nodes -> Unist Nodes */
	nodes: DefaultMap<N, ProseNodeTest[]>;
	/** A map from ProseMirror Marks -> Unist Nodes */
	marks: DefaultMap<M, ProseMarkTest[]>;
}

////////////////////////////////////////////////////////////////////////////////

export class EditorConfig<S extends ProseSchema = ProseSchema> {
	schema: S & ProseSchema<"error_block","error_inline">;
	plugins:ProsePlugin[];
	nodeViews: { [nodeType:string] : NodeViewConstructor };

	private _mdast2prose: UnistMapper;
	private _prose2mdast: ProseMapper;

	private _mdastParser: Processor;
	private _parser: MdParser<S>;
	private _serializer: MdSerializer;

	constructor(extensions:SyntaxExtension<S>[], plugins:ProsePlugin[], keymap: ProseKeymap){
		/** Step 1: Build Schema
		 * @effect Populates the `.type` field of each extension with a
		 *    ProseMirror NodeType, which can be referenced during plugin creation.
		 * @note it is important that schema creation happens FIRST, so that
		 *    the necessary NodeType / MarkType objects are initialized.
		 */
		this.schema = this._buildSchema(extensions);

		/** Step 2: Build Plugins */
		this.plugins = this._buildPlugins(extensions, plugins.concat(makeKeymap(keymap)));
		this.nodeViews = this._buildNodeViews(extensions);

		/** Step 3: Configure Unified / Remark */
		this._mdastParser = unified()
			.use(remark)
			.use(remarkGfm)
			.use(remarkMathPlugin)
			.use(remarkCitePlugin, {
				syntax: { enableAltSyntax: true },
				toMarkdown: { useNodeValue: true }
			})
			.use(remarkErrorPlugin)
			.use(remarkConcretePlugin)
			.use(remarkFootnotes, { inlineNotes: true })
			.use(remarkWikilinkPlugin)
			.use(remarkFrontMatter, ['yaml', 'toml'])
			.use(remarkDirective)
			.use(remarkUnwrapImagePlugin)
			.use(remarkStringify, {
				// TODO: (2021-05-18) remember bullet type
				bullet: '*',
				fences: true,
				incrementListMarker: true,
				// TODO: (2021-05-18) support autolinks
				resourceLink: true,
				listItemIndent: "one",
			});

		/** Step 3a: Build Mapping from Unist AST -> ProseMirror Document */
		this._mdast2prose = this._buildMdast2Prose(extensions);

		/** Step 3b: Build Document Parser for this Configuration */

		// TODO: (2021-05-09) revisit type inference timeout caused by
		// attempt to thread the ProseSchema type through `makeParser`
		// @ts-ignore (ts2589) Type instantiation is excessively deep and possibly infinite.
		let parser = mdast2prose.makeParser(this.schema, this._mdast2prose, this._mdastParser);
		this._parser = parser as MdParser<S>;

		/** Step 4a: Build Mapping from ProseMirror Document -> Unist AST */
		this._prose2mdast = this._buildProse2Mdast(extensions);

		/** Step 4b: Build Markdown Serializer for this Configuration */
		this._serializer = prose2mdast.makeSerializer(this._prose2mdast, this._mdastParser);
	}

	parse(markdown: string): ProseNode | null {
		return this._parser(markdown);
	}

	parseAST(markdown: string): Md.Node | null {
		// TODO (2022/05/06) right now we are calling _mdastParser.parse in two separate places
		// and any post-transformations need to be duplicated in both.  The two uses should call the
		// same postprocessing function.

		// parse and transform ast
		let parsed = this._mdastParser.parse(markdown);
		let result = this._mdastParser.runSync(parsed);

		if(!result) { return null;              }
		else        { return result as Md.Node; }
	}

	/**
	 * Convert the given ProseMirror document into a Markdown AST.
	 */
	prose2mdast(doc: ProseNode): Md.Node | null {
		const result = prose2mdast.proseTreeMap(doc, this._prose2mdast);

		// TODO (2022/03/06) error handling
		if(result.length >  1) { console.error("multiple top-level nodes"); return null; }
		if(result.length == 0) { console.error("empty document");           return null; }

		// TODO (2022/03/06) avoid cast from Uni.Node to Md.Node
		return result[0] as Md.Node;
	}

	serialize(doc: ProseNode): string | null {
		return this._serializer(doc);
	}

	// -- Build Schema ------------------------------------------------------ //

	private _buildSchema(extensions:SyntaxExtension<S>[]): S & ProseSchema<"error_block","error_inline"> {
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
			parseDOM: [{
				tag: "pre.error-block",
				preserveWhitespace: "full",
				getAttrs: node => { return {} }
			}],
			toDOM(node) {
				return ["pre", { class: "error-block" }, ["code", 0]]
			}
		}

		// build schema
		// TODO: speicalize to ProseSchema<N,M> for some N,M?
		// TODO: is this cast sound?
		let schema = new ProseSchema({
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

	private _buildPlugins(extensions:SyntaxExtension<S>[], plugins:ProsePlugin[] = []): ProsePlugin[] {
		let inputRules: InputRule[] = [];

		// keymap
		let keymaps = new DefaultMap<string, ProseCommand[]>( _ => [] );
		let nodeViews: { [nodeType:string] : NodeViewConstructor } = { };

		// create node and mark specs
		for(let ext of extensions) {

			// accumulate input rules
			inputRules = inputRules.concat(ext.createInputRules());

			// accumulate keymaps
			let extKeymap = ext.createKeymap();
			for(let key in ext.createKeymap()) {
				keymaps.get(key).push(extKeymap[key]);
			}

			// accumulate nodeviews
			if(ext instanceof NodeExtension) {
				let extNodeView = ext.createNodeView();
				if(extNodeView) {
					nodeViews[ext.nodeType.name] = extNodeView;
				}
			}
		}

		// combine all input rules as single ProseMirror plugin
		let resultPlugins = [...plugins, makeInputRulePlugin({ rules: inputRules })];

		// include extension keymaps
		/** @todo (9/27/20) sort keymap entries by priority? */
		let keymap: ProseKeymap = { };
		keymaps.forEach((cmds, key) => {
			keymap[key] = chainCommands(...cmds);
		});
		resultPlugins.push(makeKeymap(keymap));

		// include base keymap
		resultPlugins.push(makeKeymap(baseKeymap));

		// provided plugins go last
		return resultPlugins;
	}

	// -- Build NodeViews --------------------------------------------------- //

	private _buildNodeViews(extensions:SyntaxExtension<S>[]): { [nodeType:string] : NodeViewConstructor } {
		let nodeViews: { [nodeType:string] : NodeViewConstructor } = { };

		// create node and mark specs
		for(let ext of extensions) {
			if(!(ext instanceof NodeExtension)){ continue; }

			// accumulate nodeviews
			let extNodeView = ext.createNodeView();
			if(!extNodeView) { continue; }

			nodeViews[ext.nodeType.name] = extNodeView;
		}

		return nodeViews;
	}

	// -- Build Mdast2Prose ------------------------------------------------- //

	private _buildMdast2Prose(extensions: SyntaxExtension<S>[]): UnistMapper {
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
			if(ext instanceof NodeSyntaxExtension) {
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
			} else if(ext instanceof MarkSyntaxExtension) {
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

	private _buildProse2Mdast(extensions: SyntaxExtension<S>[]): ProseMapper {
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
			if(ext instanceof NodeSyntaxExtension) {
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
			else if(ext instanceof MarkSyntaxExtension) {
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
