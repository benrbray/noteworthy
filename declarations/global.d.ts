// (https://stackoverflow.com/a/53098695/1444650)
// import needed to make this a module 
import { Fragment } from "prosemirror-model";

declare module "prosemirror-model" {
	interface Fragment {
		// as of (3/31/20) official @types/prosemirror-model
		// was missing Fragment.content, so we define it here
		content: Node[];
	}
}
