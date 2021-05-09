// unist
import unified from "unified";
import * as Uni from "unist";

// micromark
import micromark from "micromark/lib";
import { SyntaxExtension } from "micromark/dist/shared-types";
import { citeSyntax, citeHtml } from "@benrbray/micromark-extension-cite";

// mdast
import * as Md from "mdast";
import toMarkdown from "mdast-util-to-markdown";

// remark and remark plugins
import remark from "remark-parse";
import remarkMathPlugin from "remark-math";
import remarkFrontMatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import remarkFootnotes from "remark-footnotes";
import { wikiLinkPlugin as remarkWikilinkPlugin } from 'remark-wiki-link';

// custom remark plugins
import { citePlugin, CitePluginOptions } from "@benrbray/remark-cite";
import { citeToMarkdown } from "@benrbray/mdast-util-cite"; 

// prosemirror imports
import { Node as ProseNode } from "prosemirror-model";
import { unistIsParent, unistIsStringLiteral, unistSource } from "./unist-utils";
//import { editorSchema } from "./schema";

// patched prosemirror types
import { ProseSchema, ProseMarkType, ProseNodeType } from "@common/types";

////////////////////////////////////////////////////////////////////////////////

/**
 * When T is a union type discriminated by S, returns a mapping from
 * possible values of S to the corresponding union members.
 * 
 * For instance, if we have the following union type:
 *     
 *     type Honeycrisp   = { name : "apple", kind : "honeycrisp"  }
 *     type GrannySmith  = { name : "apple", kind : "grannysmith"  }
 *     type Banana       = { name : "banana" }
 *     type Cherry       = { name : "cherry" }
 *     type Fruits       = Honeycrisp | GrannySmith | Banana | Cherry;
 *
 * The result should be equivalent to:
 *     
 *     UnionMap<"name", Fruits> = {
 *         apple  :  Honeycrisp | GrannySmith
 *         banana : Banana
 *         cherry : Cherry
 *      }
 * 
 * In practice, TypeScript will infer a redundant Record<,> constraint
 * on the types, but we can think of the type as being equivalent to the above.
 */
type UnionTypeMap<S extends string, T extends Record<S, string>> = {
	[key in T[S]] : T & Record<S, key>
}

/**
 * https://stackoverflow.com/a/50125960/1444650
 */

export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = 
  T extends Record<K, V> ? T : never

export type MapDiscriminatedUnion<T extends Record<K, string>, K extends keyof T> =
  { [V in T[K]]: DiscriminateUnion<T, K, V> };

////////////////////////////////////////////////////////////

// -- Mdast Math -------------------------------------------

/** Inline math node from [`mdast-util-math`](https://github.com/syntax-tree/mdast-util-math/blob/main/from-markdown.js#L60). */
interface MdBlockMath extends Md.Literal {
	type: "math"
}

/** Block math node from [`mdast-util-math`](https://github.com/syntax-tree/mdast-util-math/blob/main/from-markdown.js#L20). */
interface MdInlineMath extends Md.Literal {
	type: "inlineMath"
}

type MdMath = MdBlockMath | MdInlineMath;

// -- Mdast Wikilinks --------------------------------------

interface MdWikilink extends Md.Literal {
	type: "wikiLink",
	data: Uni.Data & {
		"alias"     : string,
        "permalink" : string,
        "exists"    : boolean,
	}
}

// -- remark-frontmatter -----------------------------------

interface MdFrontmatterYAML extends Md.Literal { type: "yaml" }
interface MdFrontmatterTOML extends Md.Literal { type: "toml" }
interface MdFrontmatterJSON extends Md.Literal { type: "json" }

type MdFrontmatter = MdFrontmatterYAML | MdFrontmatterTOML | MdFrontmatterJSON;

// ---------------------------------------------------------

export type MdNodes = Md.Content | MdMath | MdWikilink | MdFrontmatter;

export type MdTypeMap = MapDiscriminatedUnion<MdNodes, "type"> //UnionTypeMap<"type", MdNodes>

export type MdMapper<S extends ProseSchema> = {
	[key in keyof MdTypeMap]? : (x: MdTypeMap[key], children: ProseNode<S>[]) => ProseNode<S>[];
}

////////////////////////////////////////////////////////////

declare module "prosemirror-model" {
	interface Schema<N,M> {
		// as of (2021-05-04) the return type was incorrect              vvvv
		text(text: string, marks?: Array<Mark<Schema<N, M>>>): ProseNode<this>;
		/**
		* An object mapping the schema's node names to node type objects.
		*/
		nodes: { [name in N]: NodeType<Schema<N, M>> } & { [key: string]: NodeType<Schema<N, M>> };
		/**
		* A map from mark names to mark type objects.
		*/
		marks: { [name in M]: MarkType<Schema<N, M>> } & { [key: string]: MarkType<Schema<N, M>> };
	}
}

////////////////////////////////////////////////////////////

// TODO (2021/05/09) these functions should all be relocated

export const nodeMapBasic = <S extends ProseSchema>(nodeType: ProseNodeType<S>) => (node: Uni.Node, children: ProseNode<S>[]) => {
	console.log(`nodeMapBasic -- nodeType=${nodeType.name}, mdastType=${node.type}`);
	console.log("mdast", node);
	console.log("children", children);

	let result = nodeType.createAndFill({}, children || undefined);
	console.log("result", result);

	return result ? [result] : [];
}

// export const nodeMapUpdateContext = <S extends ProseSchema, Ctx>(nodeType: ProseNodeType<S>, contextUpdater: (ctx: Ctx) => Ctx) => 
// 	(node: Uni.Node, children: ProseNode<S>[], ctx: Ctx) => {
// 		let result = nodeType.createAndFill({}, children || undefined);
// 		return result ? [result] : [];
// 	}

export const nodeMapLeaf = <S extends ProseSchema>(nodeType: ProseNodeType<S>) => (node: Uni.Node, _: ProseNode<S>[]) => {
	let result = nodeType.createAndFill({});
	return result ? [result] : [];
}

export const nodeMapStringLiteral = <S extends ProseSchema>(nodeType: ProseNodeType<S>) => (node: Uni.Node & { value: string }, _: ProseNode<S>[]) => {
	// it is illegal to create an empty ProseMirror TextNode
	if(node.value.length < 1) { return []; }

	// create 
	let result = nodeType.createAndFill({}, [nodeType.schema.text(node.value)]);
	return result ? [result] : [];
}

export const markMapBasic = <S extends ProseSchema, T extends Uni.Node>(markType: ProseMarkType<S>, getAttrs?: (node: T) => Record<string,any>) => (node: T, children: ProseNode<S>[]) => {
	let attrs = getAttrs ? getAttrs(node) : { };

	return children.flatMap(childNode => {
		// marks on non-text nodes is unsupported
		if(!childNode.isText) { return []; }
		// copy the child, adding a new mark
		return childNode.mark(childNode.marks.concat([markType.create(attrs)]));
	});
}

type MdContextMapper<Ctx> = {
	[key in keyof MdTypeMap]? : (x: MdTypeMap[key], ctx: Ctx) => Ctx
}

// function makeMdastContextMap(schema: typeof editorSchema): MdContextMapper<MdParseContext> {
// 	return {
// 		"paragraph" : (node, ctx): MdParseContext => {
// 			return { ...ctx, inParagraph: true };
// 		}
// 	}
// }

// function makeMdastNodeMap(schema: typeof editorSchema): MdMapper<typeof editorSchema> { 
// 	return {
		
// 		"text" : (node, children) => {
// 			return [schema.text(node.value)];
// 		},

// 		/* ---- Marks ----------------------------------- */

// 		"emphasis"   : markMapBasic(schema.marks.em),
// 		"strong"     : markMapBasic(schema.marks.strong),
// 		"inlineCode" : markMapBasic(schema.marks.code),
// 		"link"       : markMapBasic(schema.marks.link, 
// 			node => ({
// 				href:  node.url,
// 				title: node.title
// 			})
// 		),

// 		/* ---- Nodes ----------------------------------- */

// 		/* nodes with a straightforward mapping */
// 		"paragraph"     : nodeMapBasic(schema.nodes.paragraph),
// 		"blockquote"    : nodeMapBasic(schema.nodes.blockquote),
// 		"listItem"      : nodeMapBasic(schema.nodes.list_item),

// 		/* leaf nodes */
// 		"thematicBreak" : nodeMapLeaf(schema.nodes.horizontal_rule),
// 		"break"         : nodeMapLeaf(schema.nodes.hard_break),

// 		"code" : nodeMapStringLiteral(schema.nodes.code_block),

// 		"heading" : (node, children) => {
// 			let type = schema.nodes.heading;

// 			// ignore empty headings
// 			if(children.length < 1) { return []; }

// 			let result = type.createAndFill({ level: node.depth }, children);
// 			return result ? [result] : [];
// 		},

// 		"list" : (node, children) => {
// 			let type = node.ordered ? schema.nodes.ordered_list : schema.nodes.bullet_list;
// 			let result = type.createAndFill({}, children);
// 			return result ? [result] : [];
// 		},

// 		"image" : (node, children) => {
// 			let type = schema.nodes.image;
// 			let result = type.createAndFill({
// 				src: node.url,
// 				alt: node.alt,
// 				title: node.title
// 			});
// 			return result ? [result] : [];
// 		},

// 		/* ---- Plugin: Math ---------------------------- */

// 		"math"       : nodeMapStringLiteral(schema.nodes.math_display),
// 		"inlineMath" : nodeMapStringLiteral(schema.nodes.math_inline),

// 		/* ---- Plugin: Wikilinks ----------------------- */

// 		"wikiLink" : (node, children) => {
// 			let markType = schema.marks.strong;
// 			return [schema.text(node.value, [markType.create()])];
// 		}

// 		/* ---- Plugin: Frontmatter --------------------- */
// 	}
// }

type NodeMap<S extends ProseSchema, Ctx=unknown> = (node: Uni.Node, children:ProseNode<S>[], parseContext: Ctx) => ProseNode<S>[];
type ContextMap<Ctx=unknown, N extends Uni.Node = Uni.Node> = (node: N, parseContext: Ctx) => Ctx;

function getContextMapper<N extends Md.Content, Ctx>(node: N, mappers: MdContextMapper<Ctx>): ContextMap<Ctx, N>|undefined {
	// without correlated record types, we must use a cast to
	// explicitly guarantee that the returned mapper can accept
	// the same node type as input that was passed to this function
	//                        vv                vvv
	return mappers[node.type] as ContextMap<Ctx, N> | undefined;

	// relevant TypeScript issues
	// correlated record types: https://github.com/microsoft/TypeScript/issues/35873
	// co-dependently typed arguments: https://github.com/microsoft/TypeScript/issues/35873
}

export function treeMap<S extends ProseSchema, Ctx>(
	node: Md.Content,
	parseContext: Ctx, 
	nodeMap: MdMapper<S>, 
	contextMap: MdContextMapper<Ctx>,
	errorMap: NodeMap<S, Ctx>
): ProseNode<S>[] {
	// postorder depth-first traversal

	// 1. use what we know about the parent Mdast node to update the parse context
	// (at this point, the parent ProseNode as NOT yet been constructed yet)
	let contextMapper = getContextMapper(node, contextMap);
	let newParseContext = contextMapper ? contextMapper(node, parseContext) : parseContext; 
	
	// 2. visit the children, from left to right
	let nodeContents: ProseNode<S>[] = [];

	if(unistIsParent(node)) {
		// flatmap the results of traversing this node's children
		for(let idx = 0; idx < node.children.length; idx++) {
			let child: ProseNode<S>[] = treeMap(node.children[idx], newParseContext, nodeMap, contextMap, errorMap);
			if(child !== null) { nodeContents = nodeContents.concat(child); }
		}
	}

	// 3. map this node ; typescript struggles with the result type, so we simplify
	let nodeFn = nodeMap[node.type] as NodeMap<S, Ctx>|undefined;
	
	// if node type not recognized, fail gracefully by wrapping unfamiliar
	// content in a code block, rather than silently deleting it
	if(nodeFn === undefined) {
		console.log(`treeMap :: expected ${node.type}, got undefined`);  
		nodeFn = errorMap;
	}

	// return the results of the mapping function
	// (note: we are using the original parseContext here!)
	let result = nodeFn(node, nodeContents, parseContext)
	return result;
}

type MdParseContext = {
	inParagraph: boolean;
}

////////////////////////////////////////////////////////////

function makeNodeErrorHandler<S extends ProseSchema>(
	inlineErrorType: ProseMarkType<S>,
	blockErrorType : ProseNodeType<S>,
	node2src: (node:Uni.Node)=>string|null
): NodeMap<S, MdParseContext> {
	return (node, _, context) => {
		// get markdown source for node
		let nodeSrc = node2src(node);
		if(nodeSrc === null) {
			console.error("encountered unfamiliar node ; failed to produce corresponding markdown source");
			return [];
		}

		// handle inline errors
		if(context.inParagraph) {
			// return text node marked with an error
			let mark     = inlineErrorType.create();
			let textNode = inlineErrorType.schema.text(nodeSrc, [mark]);
			return textNode ? [textNode] : [];
		}
		// handle block errors
		else {
			// return default error node
			let textNode = blockErrorType.schema.text(nodeSrc);
			let result   = blockErrorType.createAndFill({}, [textNode]);
			return result ? [result] : [];
		}
	}
}

export type MdParser<S extends ProseSchema> = (markdown: string) => ProseNode<S>;

/**
 * Uses the given configuration to create a parser capable of converting
 * markdown strings to ProseMirror documents.
 *
 * @precondition So that the parser can gracefully fail on unrecognized
 *    AST nodes, the given schema must have an "error" node and "error" mark,
 *    for block-level and inline-level errors, respectively.
 *
 * @warning The `nodeMap` maps AST nodes to ProseMirror nodes, but performs
 *    no validation.  Nodes which violate the schema will silently disappear.
 *    (to be exact, they will never be created by ProseMirror in the first place)
 */
export const makeParser = <S extends ProseSchema<"error_block","error_inline">>(
	proseSchema: S, nodeMap: MdMapper<S>
): MdParser<S> => {

	// markdown parsers
	var md2ast = unified()
		.use(remark)
		.use(remarkGfm)
		.use(remarkMathPlugin)
		.use(citePlugin, { enableAltSyntax: true })
		.use(remarkFootnotes, { inlineNotes: true })
		.use(remarkWikilinkPlugin)
		.use(remarkFrontMatter, ['yaml', 'toml']);
	
	return (markdown:string) => {
		// Step 1: Use Remark to convert markdown to AST
		let ast: Md.Root = md2ast.parse(markdown) as Md.Root; // TODO: remove cast?

		// Step 2: Use nodeMap to convert AST to ProseMirror Doc

		// initialize parse context
		let parseContext: MdParseContext = {
			inParagraph: false
		}

		// handle unfamiliar nodes
		let errorMap = makeNodeErrorHandler<S>(
			proseSchema.marks.error_inline,
			proseSchema.nodes.error_block,
			node => unistSource(node, markdown)
		);

		// make context map
		let contextMap: MdContextMapper<MdParseContext> = {
			"paragraph" : (node, ctx): MdParseContext => {
				return { ...ctx, inParagraph: true };
			}
		}

		// map over root's children
		let rootContent: ProseNode<S>[] = ast.children.flatMap(
			node => treeMap<S, MdParseContext>(node, parseContext, nodeMap, contextMap, errorMap)
		);

		console.log("\n\n");
		console.dir(rootContent);
		console.log("\n\n");

		// create top-level node
		let proseDoc = proseSchema.topNodeType.createAndFill({}, rootContent);

		if(proseDoc) { return proseDoc; }
		else         { throw new Error("unable to parse markdown document"); }
	};
}

// export const mdast2prose = (document: Md.Root, node2src: (node:Uni.Node)=>string|null, proseSchema: typeof editorSchema): ProseNode => {
// 	let nodeMappers    = makeMdastNodeMap(proseSchema);
// 	let contextMappers = makeMdastContextMap(proseSchema);
// 	let errorMap       = makeNodeErrorHandler(proseSchema.marks.parse_error, proseSchema.nodes.error_block, node2src);

// 	// initial parse context
// 	let parseContext: MdParseContext = {
// 		inParagraph: false
// 	}

// 	// map over root's children
// 	let rootContent: ProseNode[] = document.children.flatMap(node => treeMap(node, parseContext, nodeMappers, contextMappers, errorMap));

// 	// create top-level node
// 	let proseDoc = proseSchema.topNodeType.createAndFill({}, rootContent);

// 	if(proseDoc) { return proseDoc; }
// 	else         { throw new Error("unable to parse markdown document"); }
// }