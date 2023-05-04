// type declarations

interface ProxyConstructor {
	new <TSource extends object, TTarget extends object>(target: TSource, handler: ProxyHandler<TSource>): TTarget;
}

// -- Remark / Micromark / Mdast ------------------------ //

declare module "remark-wiki-link" {
	import { Plugin } from "unified"

	let wikiLinkPlugin : Plugin;
}

declare module "micromark/dist/util/chunked-splice" {
	function chunkedSplice<T>(list: T[], start: number, remove: number, items: T[]): void;
	export = chunkedSplice;
}

declare module "micromark/dist/util/shallow" {
	function shallow<T>(object: T): T;
	export = shallow;
}

declare module "micromark/dist/util/resolve-all" {
	import { Construct, Event, Tokenizer } from "micromark/dist/shared-types";
	function resolveAll(constructs: Construct[], events: Event[], context: Tokenizer): any;
	export = resolveAll;
}

declare module "mdast-util-to-markdown/lib/util/safe.js" {
	import { Context, SafeOptions } from "mdast-util-to-markdown";

	// as of (2021-05-07) this function had no exported typings
	function safe(context: Context, input: string, config: Partial<SafeOptions> ): string;
	export = safe
}

declare module "micromark-extension-wiki-link" {
	function syntax(opts?: { aliasDivider?: string }): any;
}

// -- Required by @common/remark-plugins/concrete/remark-concrete --------------

declare module "repeat-string" {
	/**
	 * Repeat the given string the specified number of times.
	 */
	function repeat(str: string, count: number): string;
	export = repeat;
}

declare module "mdast-util-to-markdown/lib/util/check-rule-repeat" {
	import { Context } from "mdast-util-to-markdown";

	/**
	 * Returns the number of repetitions to use when serializing thematic breaks.
	 * https://github.com/syntax-tree/mdast-util-to-markdown/blob/f3df7410049ed426ef8734ec762a38aa2feee73f/lib/util/check-rule-repeat.js#L3
	 */
	function checkRepeat(context: Context): number;
	export = checkRepeat;
}

declare module "mdast-util-to-markdown/lib/util/check-rule" {
	import { Context } from "mdast-util-to-markdown";

	/**
	 * Returns the marker that should be used to serialize thematic breaks.
	 * https://github.com/syntax-tree/mdast-util-to-markdown/blob/f3df7410049ed426ef8734ec762a38aa2feee73f/lib/util/check-rule.js#L3
	 */
	function checkRepeat(context: Context): string;
	export = checkRepeat;
}

declare module "mdast-util-to-markdown/lib/util/check-bullet" {
	import { Context } from "mdast-util-to-markdown";
	/**
	 * Returns the default bullet style for list items.
	 * https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/check-bullet.js#L3
	 */
	function checkBullet(context: Context): "*"|"-"|"+";
	export = checkBullet;
}

declare module "mdast-util-to-markdown/lib/util/check-list-item-indent" {
	import { Context } from "mdast-util-to-markdown";
	/**
	 * Returns the default indent style for list items.
	 * https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/check-list-item-indent.js#L3
	 */
	function checkListItemIndent(context: Context): 'one'|'tab'|'mixed';
	export = checkListItemIndent;
}

declare module "mdast-util-to-markdown/lib/util/container-flow" {
	import { Context } from "mdast-util-to-markdown";
	import { Parent } from "unist";

	/**
	 * https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/container-flow.js#L5
	 */
	function flow(parent: Parent, context: Context): string ;
	export = flow;
}

declare module "mdast-util-to-markdown/lib/util/indent-lines" {
	/**
	 * https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/util/indent-lines.js#L5
	 */
	function indentLines(value: string, map: (line: string, index: number, blank: boolean) => string): string;
	export = indentLines;
}
