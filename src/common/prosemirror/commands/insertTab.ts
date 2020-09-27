import { ProseCommand } from "@common/types";

export const insertTab:ProseCommand = (state, dispatch, view) => {
	if(dispatch) dispatch(state.tr.deleteSelection().insertText("\t"));
	return true;
};