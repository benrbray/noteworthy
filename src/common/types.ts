declare module NodeJS {
	interface Global {
		isQuitting?: boolean;
	}
}

// convenience type for common prosemirror callback signature
type ProseCommand = (
	state: import("prosemirror-state").EditorState,
	dispatch?: ((tr: import("prosemirror-state").Transaction) => void),
	view?: import("prosemirror-view").EditorView
) => boolean;