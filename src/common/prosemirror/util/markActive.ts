import { EditorState } from "prosemirror-state";
import { MarkType } from "prosemirror-model";

////////////////////////////////////////////////////////////

export function markActive(state:EditorState, type:MarkType) {
	let { from, $from, to, empty } = state.selection
	if (empty) return type.isInSet(state.storedMarks || $from.marks())
	else return state.doc.rangeHasMark(from, to, type)
}