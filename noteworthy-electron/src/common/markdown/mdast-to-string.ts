/**
 * Adapted From:
 * https://github.com/syntax-tree/mdast-util-to-string
 */

import * as Mdast from "mdast";
import * as Md from "@common/markdown/markdown-ast";
import { unistIsParent, unistIsStringLiteral } from "@common/markdown/unist-utils";

////////////////////////////////////////////////////////////

/**
 * Get the text content of a node.
 * Prefer the node’s plain-text fields, otherwise serialize its children,
 * and if the given value is an array, serialize the nodes in it.
 */
export function mdastTextContent(node: Md.Node, options?: { includeImageAlt : boolean }): string {
	var {includeImageAlt = true} = options || {}
	return one(node, includeImageAlt)
}

function one(node: Md.Node, includeImageAlt: boolean): string {
	// handle degenerate nodes
	if(!node || typeof node !== "object") { return ""; }
	// look for a "value"
	if(unistIsStringLiteral(node)) {
		return node.value;
	}
	// look for an "alt"
	if(includeImageAlt && (node as Mdast.Image).alt !== undefined) {
		return (node as Mdast.Image).alt as string;
	}
	// otherwise, concatenate the node's children
	if(unistIsParent(node)) {
		let result = all(node.children, includeImageAlt);
		if(result) { return result };
	}
	// the node itself might be an array
	if(Array.isArray(node)) {
		return all(node, includeImageAlt);
	}

	return "";
}

function all(values: Md.Node[], includeImageAlt: boolean): string {
	var result: string[] = [];

	for(let idx = 0; idx < values.length; idx++ ) {
		result[idx] = one(values[idx], includeImageAlt)
	}

	return result.join('')
}
