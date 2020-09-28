// prosemirror imports
import { EditorState } from "prosemirror-state";
import { MarkType, Node as ProseNode } from "prosemirror-model";
import { SelectionRange, TextSelection } from "prosemirror-state";
import { InputRule } from "prosemirror-inputrules";

////////////////////////////////////////////////////////////

export function markActive(state:EditorState, type:MarkType) {
	let { from, $from, to, empty } = state.selection
	if (empty) return type.isInSet(state.storedMarks || $from.marks())
	else return state.doc.rangeHasMark(from, to, type)
}

export function markApplies(doc:ProseNode, ranges:SelectionRange[], type:MarkType):boolean {
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

export function markInputRule(pattern: RegExp, markType: MarkType, getAttrs?: (match: string[]) => any) {
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
		).removeStoredMark(markType).insertText(match[2]);
	});
}