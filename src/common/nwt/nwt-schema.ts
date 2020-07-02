// prosemirror imports
import { Schema, Node as ProseNode, NodeSpec, SchemaSpec } from "prosemirror-model"
import OrderedMap from "node_modules/@types/orderedmap";

// project imports
import { markdownSpec } from "../markdown/markdown-schema";

////////////////////////////////////////////////////////////

// -- Root Document ------------------------------------- //

let docSpec:NodeSpec = {
	content: "(block|embed)+"
}

// -- Embedded Documents -------------------------------- //

let embedMdSpec:NodeSpec = {
	content: "block+",
	group: "embed",
	atom: true,
	attrs: { fileName: { default: null } },
	parseDOM: [{
		tag: "div.embed",
		getAttrs(d:string|Node){
			let dom: HTMLElement = d as HTMLElement;
			return {
				...(dom.hasAttribute("data-fileName") && { fileName: dom.getAttribute("data-fileName") })
			}
		}
	}],
	toDOM(node) {
		return ["div", { 
			class: "embed",
			...(node.attrs.fileName && {"data-fileName" : node.attrs.fileName})
		}, 0];
	}
}

////////////////////////////////////////////////////////////

let spec = markdownSpec();

let nwtNodes = {
	"doc": docSpec,
	"embed_md": embedMdSpec
}

export const nwtSchema = new Schema({
	nodes: { ...spec.nodes, ...nwtNodes },
	marks: spec.marks
});