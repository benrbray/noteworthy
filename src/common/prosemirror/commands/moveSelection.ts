import { Command as ProseCommand } from "prosemirror-commands";
import { TextSelection } from "prosemirror-state";

/** @todo (10/4/20) code review wanted for this command */
export const moveSelection = (dir:(1|-1)): ProseCommand => {
	return (state, dispatch, view) => {
		// get selection
		let { $from, $to } = state.selection;
		let fromIndex = $from.index(0);
		let toIndex   = $to.index(0);

		// if dir > 0, 
		//     find the top-level block AFTER the selection
		//     and move it to BEFORE the selection
		// if dir < 0,
		//     find the top-level block BEFORE the selection
		//     and move it to AFTER the selection

		// compute index of 
		let MOVING_DOWN = (dir > 0);
		let moveNodeIndex = (MOVING_DOWN ? toIndex + 1 : fromIndex - 1);
		let insertIndex   = (MOVING_DOWN ? fromIndex   : toIndex   + 1);

		// ensure there is a node at the index
		let maxIndex  = state.doc.content.content.length;
		if(moveNodeIndex < 0 || moveNodeIndex >= maxIndex){ return true; }

		// compute move / insert positions
		/** @note posAtIndex does not check whether the input index is valid,
		 *  so it is crucial that we perform this validation ourselves, as above
		 */
		let moveNodePos = (MOVING_DOWN ? $to : $from).posAtIndex(moveNodeIndex, 0);
		let insertPos   = (MOVING_DOWN ? $from : $to).posAtIndex(insertIndex,   0);

		let moveNode = state.doc.nodeAt(moveNodePos);
		if(!moveNode) { return false; }

		if(dispatch){
			/** @todo (10/4/20) does this change guarantee a valid document wrt the schema? */
			let tr = state.tr.insert(insertPos, moveNode);
			tr = tr.deleteRange(
				tr.mapping.map(moveNodePos),
				tr.mapping.map(moveNodePos+moveNode.nodeSize)
			);
			dispatch(tr);
		}

		return true;
	};
}

export const moveSelectionUp   = () => moveSelection(-1);
export const moveSelectionDown = () => moveSelection(+1);