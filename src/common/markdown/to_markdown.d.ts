// Type definitions for prosemirror-markdown 1.0
// Project: https://github.com/ProseMirror/prosemirror-markdown
// Definitions by: Bradley Ayers <https://github.com/bradleyayers>
//                 David Hahn <https://github.com/davidka>
//                 Tim Baumann <https://github.com/timjb>
//                 Patrick Simmelbauer <https://github.com/patsimm>
//                 Ifiokj Jr. <https://github.com/ifiokjr>
// Definitions: https://github.com/DefinitelyTyped/DefinitelyTyped
// TypeScript Version: 2.3

export type MarkSerializerMethod<S extends Schema = any> = (
	state: MarkdownSerializerState<S>,
	mark: Mark<S>,
	parent: Fragment<S>,
	index: number,
) => void;

export interface MarkSerializerConfig<S extends Schema = any> {
	open: string | MarkSerializerMethod<S>;
	close: string | MarkSerializerMethod<S>;
	mixable?: boolean;
	expelEnclosingWhitespace?: boolean;
	escape?: boolean;
}
/**
 * A specification for serializing a ProseMirror document as
 * Markdown/CommonMark text.
 */
export class MarkdownSerializer<S extends Schema = any> {
	constructor(
		nodes: {
			[name: string]: (
				state: MarkdownSerializerState<S>,
				node: ProsemirrorNode<S>,
				parent: ProsemirrorNode<S>,
				index: number,
			) => void;
		},
		marks: {
			[key: string]: MarkSerializerConfig;
		},
	);
    /**
     * The node serializer
     * functions for this serializer.
     */
	nodes: { [name: string]: (p1: MarkdownSerializerState<S>, p2: ProsemirrorNode<S>) => void };
    /**
     * The mark serializer info.
     */
	marks: { [key: string]: any };
    /**
     * Serialize the content of the given node to
     * [CommonMark](http://commonmark.org/).
     */
	serialize(content: ProsemirrorNode<S>, options?: { [key: string]: any }): string;
}
/**
 * A serializer for the [basic schema](#schema).
 */
export let markdownSerializer: MarkdownSerializer;
/**
 * This is an object used to track state and expose
 * methods related to markdown serialization. Instances are passed to
 * node and mark serialization methods (see `toMarkdown`).
 */
export class MarkdownSerializerState<S extends Schema = any> {
    /**
     * The options passed to the serializer.
     */
	options: { tightLists?: boolean | null };
    /**
     * Render a block, prefixing each line with `delim`, and the first
     * line in `firstDelim`. `node` should be the node that is closed at
     * the end of the block, and `f` is a function that renders the
     * content of the block.
     */
	wrapBlock(delim: string, firstDelim: string | undefined, node: ProsemirrorNode<S>, f: () => void): void;
    /**
     * Ensure the current content ends with a newline.
     */
	ensureNewLine(): void;
    /**
     * Prepare the state for writing output (closing closed paragraphs,
     * adding delimiters, and so on), and then optionally add content
     * (unescaped) to the output.
     */
	write(content?: string): void;
    /**
     * Close the block for the given node.
     */
	closeBlock(node: ProsemirrorNode<S>): void;
    /**
     * Add the given text to the document. When escape is not `false`,
     * it will be escaped.
     */
	text(text: string, escape?: boolean): void;

    /**
     * Render the given node as a block.
     */
	render(node: ProsemirrorNode<S>): void;

    /**
     * Render the contents of `parent` as block nodes.
     */
	renderContent(parent: ProsemirrorNode<S>): void;

    /**
     * Render the contents of `parent` as inline content.
     */
	renderInline(parent: ProsemirrorNode<S>): void;

    /**
     * Render a node's content as a list. `delim` should be the extra
     * indentation added to all lines except the first in an item,
     * `firstDelim` is a function going from an item index to a
     * delimiter for the first line of the item.
     */
	renderList(node: ProsemirrorNode<S>, delim: string, firstDelim: (p: number) => string): void;

    /**
     * Escape the given string so that it can safely appear in Markdown
     * content. If `startOfLine` is true, also escape characters that
     * has special meaning only at the start of the line.
     */
	esc(str: string, startOfLine?: boolean): string;

    /**
     * Repeat the given string `n` times.
     */
	repeat(str: string, n: number): string;

    /**
     * Get leading and trailing whitespace from a string. Values of
     * leading or trailing property of the return object will be undefined
     * if there is no match.
     */
	getEnclosingWhitespace(text: string): { leading?: string | null; trailing?: string | null };

    /**
     * Wraps the passed string in a string of its own
     */
	quote(str: string): string;
}