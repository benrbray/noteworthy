// unist imports
import * as Uni from "unist";

////////////////////////////////////////////////////////////////////////////////

export function unistIsParent(node: Uni.Node): node is Uni.Parent {
	return Boolean(node.children);
}

export function unistIsStringLiteral(node: Uni.Node): node is Uni.Literal & { value: string } {
	return (typeof node.value === "string");
}

////////////////////////////////////////////////////////////////////////////////

enum VisitorAction {
	/** Continue traversal as normal. */
	CONTINUE = 1,
	/** Do not traverse this node's children. */
	SKIP     = 2,
	/** Stop traversal immediately. */
	EXIT     = 3
}

/**
 * Invoked when a node (matching test, if given) is found.
 * 
 * Visitors are allowed to have the following side-effects:
 *   - Visitors are free to transform `node`.
 *   - Make changes to the parent of `node` (the last of ancestors).
 *
 * Replacing node itself, if `SKIP` is not returned, still causes its descendants to be visited.

 * If adding or removing previous siblings (or next siblings, in case of reverse) of node,
 * visitor should return a new index (number) to specify the sibling to traverse after node is traversed.
 * Adding or removing next siblings of node (or previous siblings, in case of reverse)
 * is handled as expected without needing to return a new index.
 * Removing the children property of an ancestor still results in them being traversed.
 */
type VisitorAncestors<V extends Uni.Node = Uni.Node> = (node:V, ancestors: Array<Uni.Parent>) => VisitorAction|void;
type Visitor<V extends Uni.Node = Uni.Node> = (node:V) => VisitorAction|void;

// depth-first preorder traversal 
export function visit(tree: Uni.Node, visitor: Visitor): void {
	recurse(tree);

	/**
	 * @param node The root node of a subtree.
	 * @param index The index of `node` with respect to its parent.
	 */
	function recurse(node: Uni.Node): VisitorAction {
		// visit the node itself and handle the result
		let action = visitor(node) || VisitorAction.CONTINUE;
		if(action === VisitorAction.EXIT) { return VisitorAction.EXIT; }
		if(action === VisitorAction.SKIP) { return VisitorAction.SKIP; }
		if(!unistIsParent(node))               { return action; }

		// visit the node's children from first to last
		for(let childIdx = 0; childIdx < node.children.length; childIdx++) {
			// visit child and handle the subtree result
			let subresult = recurse(node.children[childIdx]);
			if(subresult === VisitorAction.EXIT) { return VisitorAction.EXIT; }

			// TODO: if visitor modified the tree, we might want to allow it
			// to return a new childIdx to continue iterating from
		}

		return action;
	}
}

// visit a specific node type
/** @deprecated */
export function visitNodeType<N extends Uni.Node>(
	tree: Uni.Node, 
	typeTest: (node:Uni.Node) => node is N, 
	visitor: Visitor<N>
): never { throw new Error("not implemented") }

////////////////////////////////////////////////////////////////////////////////

// -- removePosition -----------------------------------------------------------

/**
 * Removes all position information from the Unist tree.
 * @returns nothing (modifies the tree in-place)
 */
export const removePositionInfo = (tree: Uni.Node): Uni.Node => {
	visit(tree, node => { delete node.position; });
	return tree;
}

////////////////////////////////////////////////////////////////////////////////

// -- vfile-location -----------------------------------------------------------
// https://github.com/vfile/vfile-location/blob/main/index.js

/**
 * @typedef {import('vfile').VFile} VFile
 */

type PositionalPoint = Pick<Uni.Point, 'line'|'column'>
type FullPoint = Required<Uni.Point>;
type Offset = NonNullable<Uni.Point['offset']>;

/**
 * Get transform functions for the given `document`.
 *
 * @param {string|Uint8Array|VFile} file
 */
export function location(file: string | Uint8Array) {
  var value = String(file)
  /** @type {Array.<number>} */
  var indices: Array<number> = []
  var search = /\r?\n|\r/g

  while (search.test(value)) {
    indices.push(search.lastIndex)
  }

  indices.push(value.length + 1)

  return {toPoint, toOffset}

  /**
   * Get the line and column-based `point` for `offset` in the bound indices.
   * Returns a point with `undefined` values when given invalid or out of bounds
   * input.
   *
   * @param {Offset} offset
   * @returns {FullPoint}
   */
  function toPoint(offset: Offset): FullPoint {
    var index = -1

    if (offset > -1 && offset < indices[indices.length - 1]) {
      while (++index < indices.length) {
        if (indices[index] > offset) {
          return {
            line: index + 1,
            column: offset - (indices[index - 1] || 0) + 1,
            offset
          }
        }
      }
    }

    // @ts-ignore undefined not assignable
    return {line: undefined, column: undefined, offset: undefined}
  }

  /**
   * Get the `offset` for a line and column-based `point` in the bound indices.
   * Returns `-1` when given invalid or out of bounds input.
   *
   * @param {PositionalPoint} point
   * @returns {Offset}
   */
  function toOffset(point: PositionalPoint): Offset {
    var line = point && point.line
    var column = point && point.column
    /** @type {number} */
    var offset: number

    if (
      typeof line === 'number' &&
      typeof column === 'number' &&
      !Number.isNaN(line) &&
      !Number.isNaN(column) &&
      line - 1 in indices
    ) {
      offset = (indices[line - 2] || 0) + column - 1 || 0
    }

    // @ts-ignore used before defined
    return offset > -1 && offset < indices[indices.length - 1] ? offset : -1
  }
}

// -- unist-util-source --------------------------------------------------------

var search = /\r?\n|\r/g

export function unistSource(value: Uni.Node | Uni.Position, file: string): string | null {
  var doc = String(file)
  var loc = location(file)
  // @ts-ignore Looks like a node.
  var position: Uni.Position = (value && value.position) || value || {}
  var startOffset = loc.toOffset(position.start)
  var endOffset = loc.toOffset(position.end)
  var results: Array<string> = []
  var match: RegExpMatchArray|null
  var end: number

  if (startOffset === -1 || endOffset === -1) {
    return null
  }

  while (startOffset < endOffset) {
    search.lastIndex = startOffset
    match = search.exec(doc)
  	// @ts-ignore match.index undefined
    end = match && match.index < endOffset ? match.index : endOffset
    results.push(doc.slice(startOffset, end))
    startOffset = end

  	// @ts-ignore match.index undefined
    if (match && match.index < endOffset) {
      startOffset += match[0].length
      results.push(match[0])
    }
  }

  return results.join('')
}