import { Schema, NodeType, MarkType, Node as ProseNode } from "prosemirror-model";
import {
	inputRules, wrappingInputRule, textblockTypeInputRule,
	smartQuotes, emDash, ellipsis, undoInputRule, InputRule
} from "prosemirror-inputrules"
import {
	wrapIn, setBlockType, chainCommands, toggleMark, exitCode,
	joinUp, joinDown, lift, selectParentNode
} from "prosemirror-commands"
import { wrapInList, splitListItem, liftListItem, sinkListItem } from "prosemirror-schema-list"
import { undo, redo } from "prosemirror-history"
import { Transaction, EditorState, Plugin, SelectionRange, TextSelection } from "prosemirror-state";
import { ProseCommand } from "./types";

export const PlainSchema = new Schema({
	nodes : {
		doc: {
			content: "block+"
		}, 
		paragraph: {
			group: "block",
			content: "inline*",
			toDOM() { return ["p", 0] },
			parseDOM: [{ tag: "p" }]
		},
		text: {
			group: "inline"
		}
	}
});

// : (NodeType) → InputRule
// Given a blockquote node type, returns an input rule that turns `"> "`
// at the start of a textblock into a blockquote.
export function blockQuoteRule(nodeType:NodeType) {
	return wrappingInputRule(/^\s*>\s$/, nodeType)
}

// : (NodeType) → InputRule
// Given a list node type, returns an input rule that turns a number
// followed by a dot at the start of a textblock into an ordered list.
export function orderedListRule(nodeType:NodeType) {
	return wrappingInputRule(/^(\d+)\.\s$/, nodeType, match => ({ order: +match[1] }),
		(match, node) => node.childCount + node.attrs.order == +match[1])
}

// : (NodeType) → InputRule
// Given a list node type, returns an input rule that turns a bullet
// (dash, plush, or asterisk) at the start of a textblock into a
// bullet list.
export function bulletListRule(nodeType:NodeType) {
	return wrappingInputRule(/^\s*([-+*])\s$/, nodeType)
}

// : (NodeType) → InputRule
// Given a code block node type, returns an input rule that turns a
// textblock starting with three backticks into a code block.
export function codeBlockRule(nodeType: NodeType) {
	return textblockTypeInputRule(/^```$/, nodeType)
}

// : (NodeType, number) → InputRule
// Given a node type and a maximum level, creates an input rule that
// turns up to that number of `#` characters followed by a space at
// the start of a textblock into a heading whose level corresponds to
// the number of `#` signs.
export function headingRule(nodeType: NodeType, maxLevel:number) {
	return textblockTypeInputRule(new RegExp("^(#{1," + maxLevel + "})\\s$"),
		nodeType, match => ({ level: match[1].length }))
}

function markApplies(doc:ProseNode, ranges:SelectionRange[], type:MarkType):boolean {
	for (let i = 0; i < ranges.length; i++) {
		let { $from, $to } = ranges[i]
		let can = $from.depth == 0 ? doc.type.allowsMarkType(type) : false
		doc.nodesBetween($from.pos, $to.pos, node => {
			if (can) return false
			can = node.inlineContent && node.type.allowsMarkType(type)
		})
		if (can) return true
	}
	return false
}

function markInputRule(pattern: RegExp, markType: MarkType, getAttrs?: (match: string[]) => any) {
	return new InputRule(pattern, (state, match, start, end) => {
		console.log(match, start, end);
		// only apply marks to non-empty text selections
		if (!(state.selection instanceof TextSelection)){ return null; }
		
		// determine if mark applies to match
		let $start = state.doc.resolve(start);
		let $end = state.doc.resolve(end);
		let range = [new SelectionRange($start, $end)];
		if(!markApplies(state.doc, range, markType)){ return null; }

		// apply mark
		let tr = state.tr.replaceWith(start, end, markType.schema.text(match[1],));
		return tr.addMark(
			tr.mapping.map(start),
			tr.mapping.map(end),
			markType.create(getAttrs ? getAttrs(match) : null)
		).removeStoredMark(markType).insertText(match[3]);
	});
}

export function boldRule(markType: MarkType):InputRule {
	return markInputRule(/\*\*([^\s](.*[^\s])?)\*\*(.)$/, markType);
}
export function italicRule(markType: MarkType): InputRule {
	return markInputRule(/(?<!\*)\*([^\s\*](.*[^\s])?)\*([^\*])$/, markType);
}
export function underlineRule(markType: MarkType): InputRule {
	return markInputRule(/_([^\s_](.*[^\s_])?)_(.)$/, markType);
}
export function wikilinkRule(markType: MarkType): InputRule {
	return markInputRule(/\[\[([^\s]([^\]]*[^\s])?)\]\](.)$/, markType);
}
export function strikeRule(markType: MarkType): InputRule {
	return markInputRule(/~([^\s~](.*[^\s~])?)~(.)$/, markType);
}

// : (Schema) → Plugin
// A set of input rules for creating the basic block quotes, lists,
// code blocks, and heading.
export function buildInputRules_markdown(schema:Schema) {
	let rules = smartQuotes.concat(ellipsis, emDash), type
	// nodes
	if (type = schema.nodes.blockquote) rules.push(blockQuoteRule(type))
	if (type = schema.nodes.ordered_list) rules.push(orderedListRule(type))
	if (type = schema.nodes.bullet_list) rules.push(bulletListRule(type))
	if (type = schema.nodes.code_block) rules.push(codeBlockRule(type))
	if (type = schema.nodes.heading) rules.push(headingRule(type, 6))
	// marks
	if (type = schema.marks.strong) rules.push(boldRule(type));
	if (type = schema.marks.em) rules.push(italicRule(type));
	if (type = schema.marks.wikilink) rules.push(wikilinkRule(type));
	if (type = schema.marks.underline) rules.push(underlineRule(type));
	if (type = schema.marks.strike) rules.push(strikeRule(type));
	return inputRules({ rules })
}

const mac = typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false

// :: (Schema, ?Object) → Object
// Inspect the given schema looking for marks and nodes from the
// basic schema, and if found, add key bindings related to them.
// This will add:
//
// * **Mod-b** for toggling [strong](#schema-basic.StrongMark)
// * **Mod-i** for toggling [emphasis](#schema-basic.EmMark)
// * **Mod-`** for toggling [code font](#schema-basic.CodeMark)
// * **Ctrl-Shift-0** for making the current textblock a paragraph
// * **Ctrl-Shift-1** to **Ctrl-Shift-Digit6** for making the current
//   textblock a heading of the corresponding level
// * **Ctrl-Shift-Backslash** to make the current textblock a code block
// * **Ctrl-Shift-8** to wrap the selection in an ordered list
// * **Ctrl-Shift-9** to wrap the selection in a bullet list
// * **Ctrl->** to wrap the selection in a block quote
// * **Enter** to split a non-empty textblock in a list item while at
//   the same time splitting the list item
// * **Mod-Enter** to insert a hard break
// * **Mod-_** to insert a horizontal rule
// * **Backspace** to undo an input rule
// * **Alt-ArrowUp** to `joinUp`
// * **Alt-ArrowDown** to `joinDown`
// * **Mod-BracketLeft** to `lift`
// * **Escape** to `selectParentNode`
//
// You can suppress or map these bindings by passing a `mapKeys`
// argument, which maps key names (say `"Mod-B"` to either `false`, to
// remove the binding, or a new key name string.
export function buildKeymap_markdown(schema:Schema, mapKeys?:{ [key:string] : string|false }) {
	let keys:{ [key:string]: ProseCommand } = {};
	let type;

	function bind(key:string, cmd:any) {
		if (mapKeys) {
			let mapped = mapKeys[key]
			if (mapped === false) return
			if (mapped) key = mapped
		}
		keys[key] = cmd
	}


	bind("Mod-z", undo)
	bind("Shift-Mod-z", redo)
	bind("Backspace", undoInputRule)
	if (!mac) bind("Mod-y", redo)

	bind("Alt-ArrowUp", joinUp)
	bind("Alt-ArrowDown", joinDown)
	bind("Mod-BracketLeft", lift)
	bind("Escape", selectParentNode)

	if (type = schema.marks.strong) {
		bind("Mod-b", toggleMark(type))
		bind("Mod-B", toggleMark(type))
	}
	if (type = schema.marks.em) {
		bind("Mod-i", toggleMark(type))
		bind("Mod-I", toggleMark(type))
	}
	if (type = schema.marks.code)
		bind("Mod-`", toggleMark(type))

	if (type = schema.nodes.bullet_list)
		bind("Shift-Ctrl-8", wrapInList(type))
	if (type = schema.nodes.ordered_list)
		bind("Shift-Ctrl-9", wrapInList(type))
	if (type = schema.nodes.blockquote)
		bind("Ctrl->", wrapIn(type))
	if (type = schema.nodes.hard_break) {
		let br = type, cmd = chainCommands(exitCode, (state, dispatch) => {
			if(dispatch){
				dispatch(state.tr.replaceSelectionWith(br.create()).scrollIntoView())
			}
			return true
		})
		bind("Mod-Enter", cmd)
		bind("Shift-Enter", cmd)
		if (mac) bind("Ctrl-Enter", cmd)
	}
	if (type = schema.nodes.list_item) {
		bind("Enter", splitListItem(type))
		bind("Mod-[", liftListItem(type))
		bind("Shift-Tab", liftListItem(type))
		bind("Mod-]", sinkListItem(type))
		bind("Tab", sinkListItem(type))
	}
	if (type = schema.nodes.paragraph)
		bind("Shift-Ctrl-0", setBlockType(type))
	if (type = schema.nodes.code_block)
		bind("Shift-Ctrl-\\", setBlockType(type))
	if (type = schema.nodes.heading)
		for (let i = 1; i <= 6; i++) bind("Shift-Ctrl-" + i, setBlockType(type, { level: i }))
	if (type = schema.nodes.horizontal_rule) {
		let hr = type
		bind("Mod-_", (state:EditorState, dispatch:((tr:Transaction)=>void)) => {
			dispatch(state.tr.replaceSelectionWith(hr.create()).scrollIntoView())
			return true
		})
	}

	return keys
}