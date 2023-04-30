// unist / mdast / remark
import { Processor } from "unified";
import * as Uni from "unist";
import * as Md from "@common/markdown/markdown-ast";
import { unistIsParent, unistSource } from "./unist-utils";

// prosemirror imports
import { Schema as ProseSchema, Node as ProseNode } from "prosemirror-model";

// patched prosemirror types
import { ProseMarkType, ProseNodeType } from "@common/types";
import { UnistMapper } from "@common/extensions/editor-config";

// yaml / toml 
import YAML from "yaml";

////////////////////////////////////////////////////////////////////////////////

/**
 * (https://stackoverflow.com/a/50125960/1444650)
 * 
 * When T is a union type discriminated by K, returns a mapping from
 * possible values of K to the corresponding union members.
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
 *     MapDiscriminatedUnion<"name", Fruits> = {
 *         apple  :  Honeycrisp | GrannySmith
 *         banana : Banana
 *         cherry : Cherry
 *      }
 */

export type DiscriminateUnion<T, K extends keyof T, V extends T[K]> = 
  T extends Record<K, V> ? T : never

export type MapDiscriminatedUnion<T extends Record<K, string>, K extends keyof T> =
  { [V in T[K]]: DiscriminateUnion<T, K, V> };

////////////////////////////////////////////////////////////

// ---------------------------------------------------------

export type AnyChildren<T extends Uni.Parent, ChildT=Uni.Node>
	= { [K in keyof T as Exclude<K, "children">] : T[K] } & { children: ChildT[] };

// ---------------------------------------------------------

export type MdTypeMap = MapDiscriminatedUnion<Md.Node, "type"> //UnionTypeMap<"type", MdNodes>

export type MdMapper<S extends ProseSchema> = {
	[key in keyof MdTypeMap]? : (x: MdTypeMap[key], children: ProseNode[]) => ProseNode[];
}

////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////

// TODO (2021/05/09) these functions should all be relocated

export const nodeMapBasic = <S extends ProseSchema>(nodeType: ProseNodeType) => (node: Uni.Node, children: ProseNode[]) => {
	let result = nodeType.createAndFill({}, children || undefined);
	return result ? [result] : [];
}

export const nodeMapLeaf = <S extends ProseSchema>(nodeType: ProseNodeType) => (node: Uni.Node, _: ProseNode[]) => {
	let result = nodeType.createAndFill({});
	return result ? [result] : [];
}

export const nodeMapStringLiteral = <S extends ProseSchema>(nodeType: ProseNodeType) => (node: Uni.Node & { value: string }, _: ProseNode[]) => {
	// it is illegal to create an empty ProseMirror TextNode
	if(node.value.length < 1) { return []; }

	// create 
	let result = nodeType.createAndFill({}, [nodeType.schema.text(node.value)]);
	return result ? [result] : [];
}

export const markMapBasic = <S extends ProseSchema, T extends Uni.Node>(
	markType: ProseMarkType,
	getAttrs?: (node: T) => Record<string,any>
) => (node: T, children: ProseNode[]) => {
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
	markType: ProseMarkType,
	getAttrs?: (node: T) => Record<string,any>
) => (node: T & { value: string }, _: ProseNode[]) => {
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

////////////////////////////////////////////////////////////

type MdContextMapper<Ctx> = {
	[key in keyof MdTypeMap]? : (x: MdTypeMap[key], ctx: Ctx) => Ctx
}

type MdStateMapper<St> = {
	[key in keyof MdTypeMap]? : (x: MdTypeMap[key], state: St) => St
}

// ---------------------------------------------------------

/**
 * Create a ProseMirror node from a Unist node and its list of 
 * children, which have already been converted to ProseMirror nodes.

 * TODO (2021-05-17) should the node map return new context/state,
 *   instead of context/state being specified by separate maps?
 */
type NodeMap<Ctx=unknown, St=unknown, S extends ProseSchema = ProseSchema>
	= (node: Uni.Node, children:ProseNode[], parseContext: Ctx, parseState: St) => ProseNode[];

/**
 * Returns a new local parse context based on the contents of `node`.
 * 
 * TODO (2021-05-17) enforce immutability here?
 *
 * @note Should **not** modify the input context in-place, but
 *     instead return a copy with the necessary changes.
 */
type ContextMap<Ctx=unknown, N extends Uni.Node = Uni.Node> 
	= (node: N, parseContext: Ctx) => Ctx;

/**
 * Describes how the global parse state should change upon visiting `node`.
 * 
 * TODO (2021-05-17) enforce immutability here?
 * 
 * @note Should **not** modify the input context in-place, but
 *     instead return a copy with the necessary changes.
 */
type StateMap<St=unknown, N extends Uni.Node = Uni.Node>
	= (node: N, parseState: St) => St;

// ---------------------------------------------------------

function getContextMapper<N extends Md.Node, Ctx>(node: N, mappers: MdContextMapper<Ctx>): ContextMap<Ctx, N>|undefined {
	// without correlated record types, we must use a cast to
	// explicitly guarantee that the returned mapper can accept
	// the same node type as input that was passed to this function
	//                        vv                vvv
	return mappers[node.type] as ContextMap<Ctx, N> | undefined;

	// relevant TypeScript issues
	// correlated record types: https://github.com/microsoft/TypeScript/issues/35873
	// co-dependently typed arguments: https://github.com/microsoft/TypeScript/issues/35873
}

function getStateMapper<N extends Md.Node, St>(node: N, mappers: MdStateMapper<St>): StateMap<St, N>|undefined {
	// without correlated record types, we must use a cast to
	// explicitly guarantee that the returned mapper can accept
	// the same node type as input that was passed to this function
	//                        vv                vvv
	return mappers[node.type] as StateMap<St, N> | undefined;

	// relevant TypeScript issues
	// correlated record types: https://github.com/microsoft/TypeScript/issues/35873
	// co-dependently typed arguments: https://github.com/microsoft/TypeScript/issues/35873
}

////////////////////////////////////////////////////////////

export function treeMap<S extends ProseSchema, Ctx, St>(
	node: Md.Node,
	parseContext: Ctx, 
	parseState: St,
	nodeMap: UnistMapper<string>, 
	contextMap: MdContextMapper<Ctx>,
	stateMap: MdStateMapper<St>,
	errorMap: NodeMap<Ctx, St, S>
): [ProseNode[], St] {
	// postorder depth-first traversal

	// 1. use what we know about the parent Mdast node to update the parse context
	// (at this point, the parent ProseNode as NOT yet been constructed yet)
	let contextMapper = getContextMapper(node, contextMap);
	let newParseContext = contextMapper ? contextMapper(node, parseContext) : parseContext; 

	// 2. visit the children, from left to right, accumulating global state
	let nodeContents: ProseNode[] = [];
	let newParseState = parseState;

	if(unistIsParent(node)) {
		// flatmap the results of traversing this node's children
		for(let idx = 0; idx < node.children.length; idx++) {
			let [child, state] = treeMap(
				node.children[idx], 
				newParseContext, newParseState,
				nodeMap, contextMap, stateMap, errorMap
			);

			newParseState = state;
			if(child !== null) { nodeContents = nodeContents.concat(child); }
		}
	}

	// 3. update the global parse state, as a way
	// of propagating information up the tree
	let stateMapper = getStateMapper(node, stateMap);
	newParseState = stateMapper ? stateMapper(node, newParseState) : newParseState; 

	// 3. map this node ; typescript struggles with the result type, so we simplify
	let nodeFn: NodeMap<Ctx, St, S>|null = null;

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
		console.error(`treeMap :: expected ${node.type}, got undefined ; node=`, node);
		nodeFn = errorMap;
	}

	// return the results of the mapping function
	// (note: we intentionally use the original parseContext here!)
	let result: ProseNode[] = nodeFn(node, nodeContents, parseContext, newParseState);
	
	// TypeScript has trouble threading the schema type through this entire function,
	// so this cast is our pinky-promise that we will return a node belonging to the
	// same schema instance as defined by the input
	return [result as ProseNode[], newParseState];
}

/**
 * Local context is used for sending information *down* the tree.
 * TODO: 
 */
export type MdParseContext = {
	inParagraph: boolean;
}

/**
 * Global state is used for propagating information *up* the tree.
 */
export type MdParseState = {
	yaml: { [key:string] : unknown };
}

////////////////////////////////////////////////////////////

function makeNodeErrorHandler<S extends ProseSchema>(
	inlineErrorType: ProseMarkType,
	blockErrorType : ProseNodeType,
	node2src: (node:Uni.Node)=>string|null
): NodeMap<MdParseContext, MdParseState, S> {
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

////////////////////////////////////////////////////////////

export type MdParser<S extends ProseSchema> = (markdown: string) => ProseNode | null;

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
	proseSchema: S,
	nodeMap: UnistMapper<string>,
	md2ast: Processor
): MdParser<S> => {

	// context map for managing local state
	let contextMap: MdContextMapper<MdParseContext> = {
		"paragraph" : (node, ctx): MdParseContext => {
			return { ...ctx, inParagraph: true };
		}
	}

	// some nodes (e.g. YAML) can modify global state
	// TODO (2021-05-17) allow plugins to specify global state maps (like for 'yaml' below)?
	// TODO (2021-05-17) can YAML support be implemented entirely as a plugin?
	// TODO (2021-05-17) instead of returning the entire state object,
	//   perhaps each mapper can return a minimal set of changes that
	//   automatically get merged with the current state by the caller
	//   (or, even safer -- each plugin gets its own global state object?)  
	let stateMap: MdStateMapper<MdParseState> = {
		"yaml" : (node, state): MdParseState => {
			// parse yaml
			let yamlData = YAML.parse(node.value);
			console.warn("found yaml node with data", yamlData);
			// merge state
			return { 
				...state,
				// TODO (2021-05-17) deep merge yaml?
				yaml: { ...state.yaml, ...yamlData }
			};
		}
	}
	
	// make parser
	return (markdown:string) => {
		// Step 1: Use Remark to convert markdown to AST
		// TODO: remove cast?
		let parsedAst: Md.Root = md2ast.parse(markdown) as Md.Root;
		let ast: Md.Root = md2ast.runSync(parsedAst) as Md.Root;
		
		console.log("[mdast2prose] document ast:\n");
		console.log(ast);
		console.log("\n\n\n");

		// Step 2: Use nodeMap to convert AST to ProseMirror Doc

		// initialize parse context
		let parseContext: MdParseContext = {
			inParagraph: false
		}
		// initialize parse state
		let parseState: MdParseState = {
			yaml: {}
		}

		// handle unfamiliar nodes
		let errorMap = makeNodeErrorHandler<S>(
			proseSchema.marks.error_inline,
			proseSchema.nodes.error_block,
			node => unistSource(node, markdown)
		);

		// map over root's children
		let [rootContent, globalState] = treeMap<S, MdParseContext, MdParseState>(
			ast, parseContext, parseState,
			nodeMap, contextMap,
			stateMap, errorMap
		);
		
		console.warn("\nglobalState:", globalState, "\n\n");

		if(rootContent.length == 0) { throw new Error("empty document"); } 
		if(rootContent.length >  1) { throw new Error("multiple top-level nodes"); }

		return rootContent[0];
	};
}