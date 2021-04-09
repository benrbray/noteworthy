// YAML config
import YAML from "yaml";

// solid.js imports
import { afterEffects, SetStateFunction } from "solid-js";

// prosemirror imports
import { Schema as ProseSchema, NodeSpec, Node as ProseNode } from "prosemirror-model";
import { EditorState as ProseEditorState, Transaction, TextSelection } from "prosemirror-state";
import { EditorView as ProseEditorView } from "prosemirror-view";
import { Command as ProseCommand } from "prosemirror-commands";
import { undo, redo } from "prosemirror-history"
import { keymap } from "prosemirror-keymap";

////////////////////////////////////////////////////////////

const mac = typeof navigator != "undefined" ? /Mac/.test(navigator.platform) : false;

function buildKeymap_yaml(schema:ProseSchema, mapKeys?:{ [key:string] : string|false }) {
	let keys:{ [key:string]: ProseCommand } = {};

	function bind(key:string, cmd:ProseCommand) {
		if (mapKeys) {
			let mapped = mapKeys[key];
			if (mapped === false) return;
			if (mapped) key = mapped;
		}
		keys[key] = cmd;
	}

	bind("Mod-z", undo);
	bind("Shift-Mod-z", redo);
	if (!mac) bind("Mod-y", redo);

	let dt = schema.nodes.dt;

	let cmd:ProseCommand = (state, dispatch):boolean => {
		if(dispatch){
			dispatch(state.tr.replaceSelectionWith(dt.create()).scrollIntoView());
		}
			console.log("cmdddd");
		return true;
	}
	bind("Mod-Enter", cmd);
	bind("Shift-Enter", cmd);
	if (mac) bind("Ctrl-Enter", cmd);

	const moveCmd = (dir:(1|-1), offset:number=0):ProseCommand => {
		return (state, dispatch):boolean => {
			let { $from, $to } = state.selection;
			let depth = $from.depth - 1;

			// find dl node
			let dl = $from.node(depth);

			// compute position to move to
			let idx = $from.indexAfter(depth) + (dir < 0 ? -1 : 0);
			idx = Math.max(0, Math.min(dl.content.childCount, idx + offset));
			let pos = dir + $from.posAtIndex(idx, depth);
			if(pos >= state.doc.content.size){ return false; }
			let $pos = state.doc.resolve(pos);

			if(dispatch){
				dispatch(state.tr.setSelection(new TextSelection($pos)));
			}
			return true;
		}
	}

	bind("ArrowDown", moveCmd(+1, +1));
	bind("ArrowUp", moveCmd(-1, -1));
	bind("Tab", moveCmd(+1, 0));
	bind("Enter", moveCmd(+1, 0));
	bind("Shift-Tab", moveCmd(-1, 0));

	return keys;
}

// ProseMirror: Yaml Editor
function makeYamlEditor(
	elt:HTMLElement,
	yamlData:{[key:string] : unknown },
	setYamlMeta:SetStateFunction<{ data : { [key:string]:string } }>
){
	YAML.stringify("", { customTags: ["timestamp"] });
	let schema = new ProseSchema({
			"nodes" : {
				"doc" : {
					content: "block",
				},
				"dl" : {
					group: "block",
					content: "(dt dd)+",
					toDOM() { return ["dl", 0] },
					parseDOM: [{ tag: "dl" }]
				},
				"dt" : {
					content: "inline*",
					toDOM() { return ["dt", 0] },
					parseDOM: [{ tag: "dt" }]
				},
				"dd" : {
					content: "inline*",
					toDOM() { return ["dd", 0] },
					parseDOM: [{ tag: "dd" }]
				},
				"text" : {
					group: "inline"
				}
			}
	});

	// create document
	let list:ProseNode[] = [];
	for(let key in yamlData){
		let value = YAML.stringify(yamlData[key], { customTags: ["timestamp"] }).trim();
		let dt = schema.nodes.dt.createAndFill(undefined, schema.text(key));
		let dd = schema.nodes.dd.createAndFill(undefined, schema.text(value));
		list.push(dt, dd);
	}

	let dl = schema.nodes.dl.createAndFill(undefined, list);
	let doc = schema.nodes.doc.createAndFill(undefined, dl);

	// create prosemirror state
	let plugins = [keymap(buildKeymap_yaml(schema))];
	let config = { schema, plugins, doc };
	let state = ProseEditorState.create(config);

	// create prosemirror instance
	let view = new ProseEditorView(elt, {
		state: state,
		dispatchTransaction(tr:Transaction){
			// apply transaction
			this.updateState(this.state.apply(tr));

			// update metadata
			if(tr.docChanged){
				// get description list
				let dl = this.state.doc.firstChild;
				if(!dl) { throw new Error("no description list!"); }

				// update metadata
				let data:{ [key:string] : string } = {};
				let nodes = dl.content.content;
				for(let idx = 0; idx < nodes.length; idx += 2){
					// normalize key to lowercase
					let key = nodes[idx]?.firstChild?.textContent;
					if(!key || !(key = key.trim().toLowerCase())){ continue; }
					// get value
					let val = nodes[idx+1]?.textContent;
					if(!val){ continue; }
					// set metadata
					data[key] = val.trim();
				}
				
				setYamlMeta({ data });
			}
		}
	});
}

////////////////////////////////////////////////////////////

interface IYamlEditorProps {
	yamlMeta:{ data: { [key:string] : unknown } };
	setYamlMeta:SetStateFunction<{meta : { [key:string] : any }}>
}

// SolidJS: Yaml Editor Component
export const YamlEditor = (props:IYamlEditorProps) => {
	let editor:HTMLDivElement;
	afterEffects(()=>{ makeYamlEditor(editor, props.yamlMeta, props.setYamlMeta) });
	return (<div ref={(elt:HTMLDivElement)=>{editor=elt}}></div>)
}