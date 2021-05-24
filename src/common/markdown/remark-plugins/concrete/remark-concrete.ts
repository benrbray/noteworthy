/**
 * Markdown syntax is redundant, allowing multiple ways to express
 * constructs like hrules, lists, and headings.  The default MDAST
 * parser throws away all this syntactic information, preserving
 * only the meaning.
 *
 * For applications which load and save a user's personal Markdown
 * files, this behavior will erase the user's personal preferences
 * for syntax and document formatting, which is not ideal.
 *
 * Thankfully, the micromark tokenizers provide enough information
 * to reconstruct the original input, it's just that MDAST decides
 * to throw it away.  This plugin preserves SOME, but not ALL, of
 * the concrete syntax information as part of the syntax tree.
 */

// unist / remark / mdast / micromark
import * as Uni from "unist";
import * as Mdast from "mdast";
import { Context } from "mdast-util-to-markdown";
import { Handle, Options as ToMarkdownOptions } from 'mdast-util-to-markdown';

// project imports
import { concreteFromMarkdown, concreteToMarkdown } from "./mdast-util-concrete";

////////////////////////////////////////////////////////////

export function remarkConcretePlugin (this:any, opts = {}): any {
	const data = this.data()

	function add (field:string, value:unknown) {
		if (data[field]) data[field].push(value)
		else data[field] = [value]
	}

	add('fromMarkdownExtensions', concreteFromMarkdown())
	add('toMarkdownExtensions', concreteToMarkdown())
}