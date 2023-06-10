// https://github.com/landakram/mdast-util-wiki-link

import * as Mdast from "mdast";
import type { Token } from "micromark-util-types";
import type { Context } from "mdast-util-to-markdown";

////////////////////////////////////////////////////////////

export interface MdastWikilinkOptions_FromMarkdown {
	/**
	 * An array of permalinks that should be considered existing pages.
	 * If a wiki link is parsed and its permalink matches one of these
	 * permalinks, `node.data.exists` will be `true`.
	 * @default []
	 */
	permalinks: string[],
	/**
	 * A function that maps a page name to an array of possible permalinks.
	 * These possible permalinks are cross-referenced with `options.permalinks`
	 * to determine whether a page exists. If a page doesn't exist, the first
	 * element of the array is considered the permalink.
	 * @default (name) => [name.replace(/ /g, '_').toLowerCase()]
	 */
	pageResolver: (pageName: string) => string[],
	/**
	 * A function that maps a permalink to some path. This path is
	 * used as the `href` for the rendered `a`.
	 * @default (permalink) => `#/page/${permalink}`
	 */
	hrefTemplate: (permalink: string) => string,
	/**
	 * A class name that is attached to any rendered wiki links.
	 * @default "internal"
	 */
	wikiLinkClassName: string,
	/**
	 * a class name that is attached to any rendered wiki links
	 * that do not exist.
	 * @default "new"
	 */
	newClassName: string,
}

export interface MdastWikilinkOptions_ToMarkdown {
	/**
	 * A string to be used as the divider for aliases.
	 * @default ":"
	 */
	aliasDivider: string;
}

export type MdastWikilinkOptions
	= MdastWikilinkOptions_FromMarkdown
	& MdastWikilinkOptions_ToMarkdown

////////////////////////////////////////////////////////////

export interface MdWikilink extends Mdast.Literal {
	value: string,
	data: {
		alias: string,
		permalink: string,
		exists: boolean,
		hName?: string,
		hProperties?: {
			className: string,
			href: string,
		}
		hChildren: [{
			type: "text",
			value: string
		}]
	}
}

declare module 'mdast-util-to-markdown' {
  interface ConstructNameMap {
    wikiLink: 'wikiLink'
  }
}

//// FROM MARKDOWN /////////////////////////////////////////

export function fromMarkdown (opts: Partial<MdastWikilinkOptions_FromMarkdown> = {}) {
	// default options
	const permalinks = opts.permalinks || []
	const defaultPageResolver = (name: string) => [name.replace(/ /g, '_').toLowerCase()]
	const pageResolver = opts.pageResolver || defaultPageResolver
	const newClassName = opts.newClassName || 'new'
	const wikiLinkClassName = opts.wikiLinkClassName || 'internal'
	const defaultHrefTemplate = (permalink: string) => `#/page/${permalink}`
	const hrefTemplate = opts.hrefTemplate || defaultHrefTemplate

	function enterWikiLink (this: any, token: Token) {
		this.enter(
		{
			type: 'wikiLink',
			value: null,
			data: {
				alias: null,
				permalink: null,
				exists: null
			}
		},
			token
		)
	}

	function top<T>(stack: T[]) {
		return stack[stack.length - 1]
	}

	function exitWikiLinkAlias (this: any, token: Token) {
		const alias = this.sliceSerialize(token)
		const current = top(this.stack) as MdWikilink;
		current.data.alias = alias
	}

	function exitWikiLinkTarget (this: any, token: Token) {
		const target = this.sliceSerialize(token)
		const current = top(this.stack) as MdWikilink;
		current.value = target
	}

	function exitWikiLink (this: any, token: Token) {
		const wikiLink = this.exit(token)

		const pagePermalinks = pageResolver(wikiLink.value)
		let permalink = pagePermalinks.find(p => permalinks.indexOf(p) !== -1)
		const exists = permalink !== undefined
		if (permalink === undefined) {
			permalink = pagePermalinks[0]
		}

		let displayName = wikiLink.value
		if (wikiLink.data.alias) {
			displayName = wikiLink.data.alias
		}

		let classNames = wikiLinkClassName
		if (!exists) {
			classNames += ' ' + newClassName
		}

		wikiLink.data.alias = displayName
		wikiLink.data.permalink = permalink
		wikiLink.data.exists = exists

		wikiLink.data.hName = 'a'
		wikiLink.data.hProperties = {
			className: classNames,
			href: hrefTemplate(permalink)
		}
		wikiLink.data.hChildren = [{
			type: 'text',
			value: displayName
		}]
	}

	return {
		enter: {
			wikiLink: enterWikiLink
		},
		exit: {
			wikiLinkTarget: exitWikiLinkTarget,
			wikiLinkAlias: exitWikiLinkAlias,
			wikiLink: exitWikiLink
		}
	}
}

//// TO MARKDOWN ///////////////////////////////////////////

import { safe } from 'mdast-util-to-markdown/lib/util/safe.js'

export function toMarkdown (opts: Partial<MdastWikilinkOptions_ToMarkdown> = {}) {
  const aliasDivider = opts.aliasDivider || ':'

  const unsafe = [
    {
      character: '[',
      inConstruct: ['phrasing', 'label', 'reference']
    },
    {
      character: ']',
      inConstruct: ['label', 'reference']
    }
  ]

  function handler (node: MdWikilink, _:unknown, context: Context) {
    const exit = context.enter('wikiLink')

    const nodeValue = safe(context, node.value, { before: '[', after: ']' })
    const nodeAlias = safe(context, node.data.alias, { before: '[', after: ']' })

    let value
    if (nodeAlias !== nodeValue) {
      value = `[[${nodeValue}${aliasDivider}${nodeAlias}]]`
    } else {
      value = `[[${nodeValue}]]`
    }

    exit()

    return value
  }

  return {
    unsafe: unsafe,
    handlers: {
      wikiLink: handler
    }
  }
}
