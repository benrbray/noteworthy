// prosemirror
import { Node as ProseNode, Mark as ProseMark } from "prosemirror-model";

// unist
import * as Uni from "unist";
import * as Md from "@common/markdown/markdown-ast";
import { Processor } from "unified";

// project imports
import { ProseMapper, ProseMarkMap, ProseMarkTest, ProseNodeMap } from "@common/extensions/editor-config";
import { StringLiteral, unistIsParent, unistIsStringLiteral } from "./unist-utils";

////////////////////////////////////////////////////////////////////////////////

// -- Node Maps ------------------------------------------------------------- //

/**
 * Creates a single Unist `Node` of the given `type`
 * with the specified children.  Performs no validation.
 */
export const nodeMapDefault: (type:string) => ProseNodeMap
= (type: string) => (
	node: ProseNode,
	children: Uni.Node[]
): Uni.Parent[] => {
	return [{
		type: type,
		children: children
	}];
}

/**
 * Ignores the input node/children and creates an empty Unist
 * `Node` of the specified type, with no children and no content.
 */
export const nodeMapEmpty: (type:string) => ProseNodeMap
= (type: string) => (
	node: ProseNode,
	children: Uni.Node[]
): Uni.Node[] => {
	return [{ type : type }];
}

/**
 * Used to "unwrap" text nodes.  Expects `children` to contain a
 * single Unist `Literal`, whose `value` will be used to create
 * a new `Literal` node of the desired type.
 */
export const nodeMapLiftLiteral: (type:string) => ProseNodeMap
= (type: string) => (
	node: ProseNode,
	children: Uni.Node[]
): StringLiteral[] => {
	// expect unique child literal
	if(children.length !== 1)      { throw new Error(`[prose2mdast] expected exactly one child, found ${children.length}`); }

  const child = children[0];
	if(unistIsParent(child))         { throw new Error("[prose2mdast] expected leaf literal node"); }
  if(!unistIsStringLiteral(child)) { throw new Error("[prose2mdast] expected leaf literal node") }
	if(!child.value)                 { throw new Error("[prose2mdast] expected non-empty literal node"); }

	// create literal node
	return [{
		type: type,
		value: child.value || ""
	}];
}

// -- Mark Maps ------------------------------------------------------------- //


/**
 * Wraps the given Unist `node` in a Unist Node representing the ProseMirror `mark`.
 */
export const markMapDefault: (type:string) => ProseMarkMap
= (type: string) => (
	mark: ProseMark,
	node: Uni.Node
): Uni.Parent => {
	return {
		type: type,
		children: [node]
	};
}

/**
 * Used for ProseMirror marks which should be rendered as childless
 * Unist `Literal` nodes.
 */
export const markMapLiteral: <V=unknown>(type:string) => ProseMarkMap
= <V=unknown>(type: string) => (
	mark: ProseMark,
	node: Uni.Node
): StringLiteral => {
	// expect node to be a text node
	// TODO (2021-05-19) what if value is not a string?
	if(!unistIsStringLiteral(node)) { throw new Error(`[prose2mdast] expected Unist.Literal node when wrapping with mark '${mark.type.name}'`); }

	// create literal node
	return {
		type: type,
		value: node.value
	};
}


////////////////////////////////////////////////////////////


export type MdSerializer = (doc: ProseNode) => string;

/**
 * Uses the given configuration to create a serializer capable of converting
 * ProseMirror documents to markdown strings.
 */
export const makeSerializer = (
	prose2mdast: ProseMapper<string>,
	mdProcessor: Processor
): MdSerializer => {

	// make parser
	return (doc: ProseNode): string => {
		// Step 1: Convert ProseMirror -> Mdast
		let result = proseTreeMap(doc, prose2mdast);

		if(result.length >  1) { throw new Error("multiple top-level nodes"); }
		if(result.length == 0) { throw new Error("empty document"); }

		let ast: Uni.Node = result[0];

		console.log("\n-----------\nPROSE2MDAST\n-----------\n");
		console.log(JSON.stringify(ast, undefined, 2));
		console.log("\n-----------\n");

		// Step 2: Use Remark to convert Mdast -> Markdown
		return mdProcessor.stringify(ast);
	};
}

////////////////////////////////////////////////////////////

// ---------------------------------------------------------

export function proseTreeMap<Ctx=void, St=void>(
	node: ProseNode,
	prose2mdast: ProseMapper
): Uni.Node[] {
	// postorder depth-first traversal

	// 0. handle text nodes and their marks as a special case

	if(node.isText && node.type.name === "text") {
		// create mdast text node
		let textNode: Md.Text = {
			type: "text",
			value: node.text || ""
		}

		// prosemirror marks become a stack of wrapper nodes around each text node
		// TODO (2021-05-18) find optimal order for nested marks?
		// perhaps using a state variable that keeps track of the previous marks?
		// check to_markdown.js to see how PM prefers to combine successive
		// nodes with the same marks

		let markedNode: Uni.Node = textNode;

		// wrapping from first -> last seems to be consistent enough
		for(let idx = 0; idx < node.marks.length; idx++) {
			let mark = node.marks[idx];

			// search for a mark map appropriate for this mark
			let markHandler = prose2mdast.marks.get(mark.type.name).find(
				handler => !handler.test        // if no test specified, succeed by default
						||  handler.test(mark)  // otherwise, ensure the node test passes
			);

			// skip missing mark types
			if(!markHandler) {
				console.error(`proseTreeMap :: handler for mark type ${mark.type.name} not found ; node=`, node);
				// TODO (2021-05-19) gracefully handle missing mark in prose2mdast?
				continue;
			}

			// call the corresponding mark map on the text node
			markedNode = markHandler.map(mark, markedNode);
		}

		// exit early with the wrapped text node
		return [markedNode];
	}


	// 1. for non-text nodes, visit the children, from left to right
	let nodeContents: Uni.Node[] = [];

	if(!node.isText && node.childCount > 0) {
		// flatmap the results of traversing this node's children
		for(let idx = 0; idx < node.childCount; idx++) {
			let child = proseTreeMap(
				node.child(idx),
				prose2mdast
			);

			if(child !== null) { nodeContents = nodeContents.concat(child); }
		}
	}

	// 2. map this node
	let nodeFn: ProseNodeMap<Ctx, St>|null = null;

	for(let test of prose2mdast.nodes.get(node.type.name)) {
		// if no test is present, succeed by default
		// otherwise, check if the node test passes
		if(!test.test || test.test(node)) {
			nodeFn = test.map;
		}
	}

	// handle missing node type
	if(!nodeFn) {
		// TODO (2021-05-18) gracefully handle missing node in prose2mdast?
		console.error("proseTreeMap :: missing handler for node", node);
		throw new Error(`proseTreeMap :: handler for node type ${node.type.name} not found`);
	}

	// return the results of the mapping function
	// TODO (2021-05-18) keep context and state?
	let result: Uni.Node[] = nodeFn(node, nodeContents, {} as Ctx, {} as St);
	return result;
}
