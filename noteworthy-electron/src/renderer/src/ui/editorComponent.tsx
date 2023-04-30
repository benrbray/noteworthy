// solidjs
import { render } from "solid-js/web";
import { createEffect, createSignal, onCleanup } from "solid-js";

////////////////////////////////////////////////////////////////////////////////

export interface EditorComponentProps {
	
}

export const EditorComponent = (props: EditorComponentProps) => {
	

	const timer = setInterval(() => {

	}, 2000);

	onCleanup(() => clearInterval(timer));
} 