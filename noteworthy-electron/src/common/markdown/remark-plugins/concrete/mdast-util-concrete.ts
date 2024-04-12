// unist / micromark / mdast
import * as Uni from "unist";
import * as Md from "@common/markdown/markdown-ast";
import { Token } from "micromark/dist/shared-types";
import { Context } from "mdast-util-to-markdown";

////////////////////////////////////////////////////////////

export interface ThematicBreak extends Uni.Node {
	// from mdast
    type: 'thematicBreak';
	// concrete syntax
	ruleContent?: string
}

export interface ListItem extends Md.Parent {
	// from mdast
    type: 'listItem';
    checked?: boolean;
    spread?: boolean;
    children: Md.BlockContent[];
	// concrete syntax
	marker?: string | undefined;
}

////////////////////////////////////////////////////////////

export function concreteFromMarkdown() {

	function top<T>(stack: T[]) {
		return stack[stack.length - 1]
	}

	function point(d: Uni.Point) {
		return {line: d.line, column: d.column, offset: d.offset}
	}

	function opener(this: any, create: Function, and?: Function) {
		return open

		function open(this: any, token: Token) {
			enter.call(this, create(token), token)
			if (and) and.call(this, token)
		}
	}

	function enter(this: any, node: any, token: Token) {
		this.stack[this.stack.length - 1].children.push(node)
		this.stack.push(node)
		this.tokenStack.push(token)
		node.position = {start: point(token.start)}
		return node
	}

	// -- Thematic Break -------------------------------- //

	function enterThematicBreak(this: any, token: Token) {
    	return {
			type: 'thematicBreak',
			ruleContent: undefined
		}
	}

	function exitThematicBreak(this: any, token: Token): void {
		let hruleNode: ThematicBreak = this.exit(token);
		hruleNode.ruleContent = this.sliceSerialize(token);
	}

	// -- List ------------------------------------------ //

	function exitListItemMarker(this: any, token: Token): void {
		// get the token used for the list marker
		let marker = this.sliceSerialize(token);
		// for unordered lists, save the marker in the ListItem node
		let listItem = top(this.stack) as Md.ListItem;
		let listNode = this.stack[this.stack.length - 2] as Md.List;

		if(!listNode.ordered) {
			listItem.marker = marker;
		}
	}

	// -------------------------------------------------- //

	return {
		enter: {
			thematicBreak: opener(enterThematicBreak)
		},
		exit: {
			thematicBreak: exitThematicBreak,
			listItemMarker: exitListItemMarker
		}
	}
}

////////////////////////////////////////////////////////////

import checkRepeat from "mdast-util-to-markdown/lib/util/check-rule-repeat";
import checkRule from "mdast-util-to-markdown/lib/util/check-rule";

import checkBullet from "mdast-util-to-markdown/lib/util/check-bullet"
import checkListItemIndent from "mdast-util-to-markdown/lib/util/check-list-item-indent"
import flow from "mdast-util-to-markdown/lib/util/container-flow"
import indentLines from "mdast-util-to-markdown/lib/util/indent-lines"

const repeat = (s: string, n: number) => {
	return s.repeat(n);
}

export function concreteToMarkdown() {
	// -- Thematic Break -------------------------------- //

	function handleThematicBreak(node: ThematicBreak, parent: Uni.Node, context: Context): string {
		// determine hrule syntax
		let rule: string;
		if(node.ruleContent) {
			// preserve the original hrule syntax
			rule = node.ruleContent;
		} else {
			// default behavior from mdast
			rule = repeat(
				checkRule(context) + (context.options.ruleSpaces ? ' ' : ''),
				checkRepeat(context)
			);
			rule = context.options.ruleSpaces ? rule.slice(0, -1) : rule;
		}

		return rule;
	}

	// -- List Item ------------------------------------- //

	/**
	 * Same as the default ListItem serialization code, except
	 * that we use the ListItem's `marker`, if present.
	 *
	 * https://github.com/syntax-tree/mdast-util-to-markdown/blob/main/lib/handle/list-item.js#L9
	 */
	function handleListItem(node: ListItem, parent: Md.List, context: Context) {
		// determine which bullet to use
		var bullet: string = node.marker || checkBullet(context)

		// handle ordered list numbering
		if (parent && parent.ordered) {
			bullet =
				((parent.start !== undefined && parent.start > -1) ? parent.start : 1) +
				(context.options.incrementListMarker === false
					? 0
					: parent.children.indexOf(node)) +
				'.'
		}

		// determine indentation
		var listItemIndent = checkListItemIndent(context)
		let size: number = bullet.length + 1

		if (
			listItemIndent === 'tab' ||
			(listItemIndent === 'mixed' && ((parent && parent.spread) || node.spread))
		) {
			size = Math.ceil(size / 4) * 4
		}

		let exit = context.enter('listItem')
		let value = indentLines(flow(node, context), map)
		exit()

		return value

		function map(line: string, index: number, blank: boolean): string {
			if (index) {
				return (blank ? '' : repeat(' ', size)) + line
			}

			return (blank ? bullet : bullet + repeat(' ', size - bullet.length)) + line
		}
	}

	// -------------------------------------------------- //

	return {
		handlers: {
			thematicBreak: handleThematicBreak,
			listItem: handleListItem
		}
	}
}
