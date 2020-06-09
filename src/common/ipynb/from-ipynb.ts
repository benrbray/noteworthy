import { Node as ProsemirrorNode, DOMParser } from "prosemirror-model";
import { ipynbSchema } from "./ipynb-schema";
import { EditorState } from "prosemirror-state";
import { markdownParser } from "../markdown"

interface IpynbMarkdownCell {
	cell_type: "markdown",
	metadata?: any
	source: string[]
}

interface IpynbCodeCell {
	cell_type: "code",
	execution_count?: number,
	metadata?: any,
	outputs: any[],
	source: string[]
}

interface IpynbJSON {
	cells : (IpynbMarkdownCell|IpynbCodeCell)[];
	metadata: any
}

export class IpynbParser {
	constructor(){
		
	}

	parse(content:string):any {
		let notebook:IpynbJSON = JSON.parse(content);
		let proseContent = [];

		/** @todo invisible placeholders for empty cells? */
		
		for(let cell of notebook.cells){
			if(cell.cell_type == "markdown"){
				let cellText:string = cell.source.join("");
				if (cellText.length < 1) { cellText = "&#65279;"; }

				let cellMarkdown = markdownParser.parse(cellText).toJSON();

				console.log(cellMarkdown);
				console.log(cellText);

				proseContent.push({
					type: "cell_markdown",
					content: cellMarkdown.content
				})
			} else {
				let cellText: string = cell.source.join("");
				if (cellText.length < 1) { cellText = "&#65279;"; }
				proseContent.push({
					type: "cell_code",
					content: [
						{ type: "text", text: cellText }
					]
				})
			}
		}

		console.log(proseContent);

		return {
			"doc" :{
				type: "doc",
				content: proseContent
			},
			"selection": {
				"type": "text",
				"anchor": 2,
				"head": 2
			}
		};
	}
}

export const ipynbParser = new IpynbParser(); 