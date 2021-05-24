// unist / micromark / mdast
import * as Uni from "unist";
import * as Mdast from "mdast";
import { Token } from "micromark/dist/shared-types";
import { MdastExtension } from "mdast-util-from-markdown/types";
import { Context } from "mdast-util-to-markdown";
import { stringifyPosition } from "@common/markdown/unist-utils";

////////////////////////////////////////////////////////////

export interface ThematicBreak extends Mdast.ThematicBreak {
	ruleContent?: string
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

	function closer(and?: Function) {
		return close

		function close(this: any, token: Token) {
			if (and) and.call(this, token)
			exit.call(this, token)
		}
	}

	function exit(this: any, token: Token) {
		var node = this.stack.pop()
		var open = this.tokenStack.pop()

		if (!open) {
			throw new Error(
				'Cannot close `' +
				token.type +
				'` (' +
				stringifyPosition({start: token.start, end: token.end}) +
				'): it’s not open'
			)
		} else if (open.type !== token.type) {
			throw new Error(
				'Cannot close `' +
				token.type +
				'` (' +
				stringifyPosition({start: token.start, end: token.end}) +
				'): a different token (`' +
				open.type +
				'`, ' +
				stringifyPosition({start: open.start, end: open.end}) +
				') is open'
			)
		}

		node.position.end = point(token.end)
		return node
	}

	function enterThematicBreak(this: any, token: Token) {
    	return {
			type: 'thematicBreak',
			ruleContent: undefined
		}
	}

	function exitThematicBreak(this: any, token: Token): void {
		let hruleNode: ThematicBreak = this.exit(token);
		hruleNode.ruleContent = this.sliceSerialize(token);
		console.log("\n\nHRULECONTENT\n", hruleNode.ruleContent, "\n\n");
	}

	return {
		enter: {
			thematicBreak: opener(enterThematicBreak)
		},
		exit: {
			thematicBreak: exitThematicBreak,
		}
	}
}

////////////////////////////////////////////////////////////

import repeat from "repeat-string";
import checkRepeat from "mdast-util-to-markdown/lib/util/check-rule-repeat";
import checkRule from "mdast-util-to-markdown/lib/util/check-rule";

export function concreteToMarkdown() {
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

	return {
		handlers: {
			thematicBreak: handleThematicBreak
		}
	}
}