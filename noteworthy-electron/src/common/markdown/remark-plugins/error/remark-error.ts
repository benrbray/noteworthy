/**
 * A Remark plugin to serialize nodes that represent Markdown
 * parse errors or other unrecognized document fragments that
 * arise during the mdast -> prosemirror parsing process.
 *
 * During parsing, the raw Markdown source of these regions
 * is preserved as part of the document in a special error block.
 * When serializing, this plugin copies the contents of these
 * error blocks verbatim to the output.
 */

// unist / remark / mdast / micromark
import * as Uni from "unist";
import { Context } from "mdast-util-to-markdown";
import { Handle, Options as ToMarkdownOptions } from 'mdast-util-to-markdown';

////////////////////////////////////////////////////////////

export function remarkErrorPlugin (this:any, opts = {}): any {
  const data = this.data()

  function add (field:string, value:unknown) {
    if (data[field]) data[field].push(value)
    else data[field] = [value]
  }

  add('toMarkdownExtensions', errorToMarkdown())
}

////////////////////////////////////////////////////////////

/**
 * Represents a parse error or otherwise unrecognized content
 * whose string value should be reproduced verbatim in the output.
 * No escaping is performed when serializing this node.
 */
export interface MdError extends Uni.Node {
	type: "error",
	value: string
}

declare module 'mdast-util-to-markdown' {
  interface ConstructNameMap {
    error: 'error'
  }
}

export function errorToMarkdown(): ToMarkdownOptions {

	function handler (node: MdError, _:unknown, context: Context) {
		// most remark extensions use this context enter/exit to
		// assist with escaping unsafe characters, but the goal
		// here is to reproduce the node's value verbatim.  It's
		// not clear from the remark docs whether enter/exit has
		// some other purpose, so we still include it
		const exit = context.enter('error')
		exit()

		return node.value;
	}

	return {
		unsafe: [],
		handlers: {
			// TODO as of (2021-05-07), the typings for Handle do not reflect
			// that the handler will be passed nodes of a specific type
			// @ts-ignore added 2023/06/10, since the remark typings seem to have changed
			error: handler as unknown as Handle
		}
	}
}
