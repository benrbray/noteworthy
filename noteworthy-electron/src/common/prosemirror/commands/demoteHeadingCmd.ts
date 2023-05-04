import { Command as ProseCommand } from "prosemirror-state";
import { NodeType } from "prosemirror-model";

////////////////////////////////////////////////////////////

export function incrHeadingLevelCmd(
	incr:number,
	options:{
		requireTextblockStart:boolean,
		requireEmptySelection:boolean,
	},
	bottomType?:NodeType
):ProseCommand {
	return (state, dispatch, view) => {
		// only works for empty selection
		if(options.requireEmptySelection && !state.selection.empty){ return false; }

		// only works at start of heading block
		let { $anchor } = state.selection;
		if (options.requireTextblockStart) {
			if (view ? !view.endOfTextblock("backward", state)
		         : $anchor.parentOffset > 0 )
		         { return false; }
		}

		// parent must be a heading
		let parent = $anchor.parent;
		/** @todo (9/27/20) revisit typings for node attributes */
		//if(!isHeadingNode(parent)) { return false; }
		if(parent.type.name !== "heading"){ return false; }

		// get heading position
		let headingPos = $anchor.before($anchor.depth);
		let targetLevel = Math.min(6, Math.max(0, parent.attrs.level + incr));

		// change heading to desired level, if positive
		if(targetLevel > 0){
			if(dispatch){
				dispatch(state.tr.setNodeMarkup(
					headingPos, undefined,
					{ level: targetLevel }
				));
			}

			return true;
		}

		// otherwise, demote heading to bottomType, when provided
		if(bottomType) {
			if(dispatch){
				dispatch(state.tr.setNodeMarkup(
					headingPos, bottomType
				));
			}
			return true;
		}

		return false;
	};
}
