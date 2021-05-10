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
import { UnistMapper } from "@common/extensions/editor-config";

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

export const markMapBasic = <S extends ProseSchema, T extends Uni.Node>(
	markType: ProseMarkType<S>,
	getAttrs?: (node: T) => Record<string,any>
) => (node: T, children: ProseNode<S>[]) => {
	let attrs = getAttrs ? getAttrs(node) : { };

	return children.flatMap(childNode => {
		// marks on non-text nodes is unsupported
		// TODO: (2021-05-09) this should probably return an error node
		if(!childNode.isText) { return []; }
		// copy the child, adding a new mark
		return childNode.mark(childNode.marks.concat([markType.create(attrs)]));
	});
}

export const markMapStringLiteral = <S extends ProseSchema, T extends Uni.Node = Uni.Node>(
	markType: ProseMarkType<S>,
	getAttrs?: (node: T) => Record<string,any>
) => (node: T & { value: string }, _: ProseNode<S>[]) => {
	// it is illegal to create an empty ProseMirror TextNode
	// TODO: (2021-05-09) this should probably return an error node
	if(node.value.length < 1) { return []; }

	// compute ProseMirror node attrs from AST node
	let attrs = getAttrs ? getAttrs(node) : { };

	// create text node and wrap it in the provided markType
	let textNode = markType.schema.text(node.value)
	let result = textNode.mark([markType.create(attrs)]);
	return result ? [result] : [];
}

type MdContextMapper<Ctx> = {
	[key in keyof MdTypeMap]? : (x: MdTypeMap[key], ctx: Ctx) => Ctx
}

type NodeMap<Ctx=unknown, S extends ProseSchema = ProseSchema> = (node: Uni.Node, children:ProseNode<S>[], parseContext: Ctx) => ProseNode<S>[];
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
	nodeMap: UnistMapper<string, S>, 
	contextMap: MdContextMapper<Ctx>,
	errorMap: NodeMap<Ctx, S>
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
	let nodeFn: NodeMap<Ctx, S>|null = null;

	for(let test of nodeMap.get(node.type)) {
		// if no test is present, succeed by default
		// otherwise, check if the node test passes
		if(!test.test || test.test(node)) {
			nodeFn = test.map;
		}
	}
	
	// if node type not recognized, fail gracefully by wrapping unfamiliar
	// content in a code block, rather than silently deleting it
	if(!nodeFn) {
		console.log(`treeMap :: expected ${node.type}, got undefined ; node=`, node);
		nodeFn = errorMap;
	}

	// return the results of the mapping function
	// (note: we are using the original parseContext here!)
	let result: ProseNode[] = nodeFn(node, nodeContents, parseContext);
	
	// TypeScript has trouble threading the schema type through this entire function,
	// so this cast is our pinky-promise that we will return a node belonging to the
	// same schema instance as defined by the input
	return result as ProseNode<S>[];
}

type MdParseContext = {
	inParagraph: boolean;
}

////////////////////////////////////////////////////////////

function makeNodeErrorHandler<S extends ProseSchema>(
	inlineErrorType: ProseMarkType<S>,
	blockErrorType : ProseNodeType<S>,
	node2src: (node:Uni.Node)=>string|null
): NodeMap<MdParseContext, S> {
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
	proseSchema: S, nodeMap: UnistMapper<string, S>
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