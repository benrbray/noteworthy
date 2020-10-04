import { Command as ProseCommand } from "prosemirror-commands";

export const insertTab:ProseCommand = (state, dispatch, view) => {
	if(dispatch) dispatch(state.tr.deleteSelection().insertText("\t"));
	return true;
};