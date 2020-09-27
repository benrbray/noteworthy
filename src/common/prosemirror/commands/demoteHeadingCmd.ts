import { ProseCommand } from "@common/types";
import { Node as ProseNode, ResolvedPos, NodeType } from "prosemirror-model";
import { markdownSpec } from "@common/markdown/markdown-schema";
import { liftTarget } from "prosemirror-transform";

////////////////////////////////////////////////////////////

/** @todo (9/26/20) use the types defined below to make it 
 * easier to mix-and-match ProseMirror node types elsewhere */

// converts a ProseMirror attr spec to the correct attr types
type ProseAttrTypeFromSpec<T> = {
	[attr in keyof T] : (T[attr] extends { default : infer P } ? P : never)
}

type ProseNodeWithAttrs<T> = ProseNode & { attrs: T };

// types for markdown heading node
type HeadingNodeAttrSpec = ReturnType<typeof markdownSpec>["nodes"]["heading"]["attrs"];
type HeadingNodeAttrs = ProseAttrTypeFromSpec<HeadingNodeAttrSpec>;
type HeadingNode = ProseNodeWithAttrs<HeadingNodeAttrs>

function isHeadingNode(node: ProseNode): node is HeadingNode {
	return node.type.name == "heading";
}

////////////////////////////////////////////////////////////

export function incrHeadingLevelCmd(incr:number, requireTextblockStart:boolean, bottomType?:NodeType):ProseCommand {
	return (state, dispatch, view) => {
		// only works at start of heading block
		let { $anchor } = state.selection;
		if (requireTextblockStart) {
			if (view ? !view.endOfTextblock("backward", state) 
		         : $anchor.parentOffset > 0 ) 
		         { return false; }
		}
		
		// parent must be a heading
		let parent = $anchor.parent;
		if(!isHeadingNode(parent)) { return false; }

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