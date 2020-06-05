// Type definitions for prosemirror-markdown 1.0
// Project: https://github.com/ProseMirror/prosemirror-markdown
// Definitions by: Bradley Ayers <https://github.com/bradleyayers>
//                 David Hahn <https://github.com/davidka>
//                 Tim Baumann <https://github.com/timjb>
//                 Patrick Simmelbauer <https://github.com/patsimm>
//                 Ifiokj Jr. <https://github.com/ifiokjr>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.3

import MarkdownIt = require('markdown-it');
import Token = require('markdown-it/lib/token');
import { Fragment, Mark, Node as ProsemirrorNode, Schema } from 'prosemirror-model';

export let schema:Schema;

export interface TokenConfig {
    /**
     * This token maps to a single node, whose type can be looked up
     * in the schema under the given name. Exactly one of `node`,
     * `block`, or `mark` must be set.
     */
	node?: string;

    /**
     * This token also comes in `_open` and `_close` variants, but
     * should add a mark (named by the value) to its content, rather
     * than wrapping it in a node.
     */
	mark?: string;

    /**
     * This token comes in `_open` and `_close` variants (which are
     * appended to the base token name provides a the object
     * property), and wraps a block of content. The block should be
     * wrapped in a node of the type named to by the property's
     * value.
     */
	block?: string;

    /**
     * Attributes for the node or mark. When `getAttrs` is provided,
     * it takes precedence.
     */
	attrs?: Record<string, any>;

    /**
     * A function used to compute the attributes for the node or mark
     * that takes a [markdown-it
     * token](https://markdown-it.github.io/markdown-it/#Token) and
     * returns an attribute object.
     */
	getAttrs?(token: Token): Record<string, any>;

    /**
     * When true, ignore content for the matched token.
     */
	ignore?: boolean;
}

/**
 * A configuration of a Markdown parser. Such a parser uses
 * [markdown-it](https://github.com/markdown-it/markdown-it) to
 * tokenize a file, and then runs the custom rules it is given over
 * the tokens to create a ProseMirror document tree.
 */
export class MarkdownParser<S extends Schema = any> {
    /**
     * Create a parser with the given configuration. You can configure
     * the markdown-it parser to parse the dialect you want, and provide
     * a description of the ProseMirror entities those tokens map to in
     * the `tokens` object, which maps token names to descriptions of
     * what to do with them. Such a description is an object, and may
     * have the following properties:
     *
     * **`node`**`: ?string`
     * : This token maps to a single node, whose type can be looked up
     * in the schema under the given name. Exactly one of `node`,
     * `block`, or `mark` must be set.
     *
     * **`block`**`: ?string`
     * : This token comes in `_open` and `_close` variants (which are
     * appended to the base token name provides a the object
     * property), and wraps a block of content. The block should be
     * wrapped in a node of the type named to by the property's
     * value.
     *
     * **`mark`**`: ?string`
     * : This token also comes in `_open` and `_close` variants, but
     * should add a mark (named by the value) to its content, rather
     * than wrapping it in a node.
     *
     * **`attrs`**`: ?Object`
     * : Attributes for the node or mark. When `getAttrs` is provided,
     * it takes precedence.
     *
     * **`getAttrs`**`: ?(MarkdownToken) → Object`
     * : A function used to compute the attributes for the node or mark
     * that takes a [markdown-it
     * token](https://markdown-it.github.io/markdown-it/#Token) and
     * returns an attribute object.
     *
     * **`ignore`**`: ?bool`
     * : When true, ignore content for the matched token.
     */
	constructor(schema: S, tokenizer: MarkdownIt, tokens: { [key: string]: TokenConfig });
    /**
     * The value of the `tokens` object used to construct
     * this parser. Can be useful to copy and modify to base other
     * parsers on.
     */
	tokens: { [key: string]: Token };
    /**
     * Parse a string as [CommonMark](http://commonmark.org/) markup,
     * and create a ProseMirror document as prescribed by this parser's
     * rules.
     */
	parse(text: string): ProsemirrorNode<S>;
}
/**
 * A parser parsing unextended [CommonMark](http://commonmark.org/),
 * without inline HTML, and producing a document in the basic schema.
 */
export let markdownParser: MarkdownParser;