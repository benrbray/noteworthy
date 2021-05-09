// type declarations

declare module NodeJS {
	declare interface Global {
		isQuitting: boolean;
	}
}

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