// prosemirror imports
import { Node as ProseNode, Mark } from "prosemirror-model";

// noteworthy imports
import { ICrossRefProvider } from "@main/plugins/crossref-plugin";
import { IDoc, DocMeta, ParserFor } from "./doctypes";
import { IOutlineProvider, IOutlineEntry } from "@main/plugins/outline-plugin";
import { defaultMarkdownConfig } from "@common/extensions/default-config";
import { IMetadataProvider, IMetadata } from "@main/plugins/metadata-plugin";

////////////////////////////////////////////////////////////////////////////////

interface IMarkdownDoc extends IDoc { }

export class MarkdownDoc implements IMarkdownDoc, ICrossRefProvider, IOutlineProvider, IMetadataProvider {
	
	constructor(private _doc:ProseNode){

	}

	get proseDoc():ProseNode { return this._doc; }
	
	// -- IMarkdownDoc ---------------------------------- //

	getMeta(): DocMeta {
		return this._doc.attrs["yamlMeta"] || {};
	}
	
	static parse(serialized: string) : MarkdownDoc|null {
		let doc = defaultMarkdownConfig.parse(serialized);
		if(!doc){ return null; }
		return new MarkdownDoc(doc);
	}

	// -- IOutlineProvider ------------------------------ //

	public IS_OUTLINE_PROVIDER:true = true;

	getOutline(): IOutlineEntry[] {
		let entries:IOutlineEntry[] = [];

		// find all headings
		this._doc.descendants((node:ProseNode, pos:number, parent:ProseNode) => {
			// search for headings only
			if(!(node.type.name == "heading")){ return true; }

			// headings contribute to outline
			let level = node.attrs["level"];
			entries.push({
				depth    : (level===undefined ? 0 : (level-1)),
				label    : node.textContent,
				uniqueId : node.textContent, /** @todo ensure uniqueness */
			});

			// do not recurse within headings
			return false;
		})

		return entries;
	}

	// -- IMetadataProvider ----------------------------- //

	public IS_METADATA_PROVIDER: true = true;
	
	getMetadata(): IMetadata {
		/** @todo (10/2/20) unify this function with getMeta() above */
		return this._doc.attrs["yamlMeta"];
	}

	// -- ICrossRefProvider ----------------------------- //

	public IS_XREF_PROVIDER:true = true;

	getTagsDefined():string[] {
		let tags:string[] = [];
		
		// tags defined by YAML metadata
		let meta = this.getMeta();
		if(meta.tags_defined){
			/** @todo (7/28/20) handle different tag list formats
			 * tags_defined: justonetag
			 * tags_defined: [properly, formatted, yaml list]
			 * tags_defined: improperly, formatted, yaml list
			 */
			// handle improperly formatted yaml list
			let defs:string | string[] = meta.tags_defined;
			if(!Array.isArray(defs)){
				defs = defs.split(/\s*,\s*/g);
			}

			tags = tags.concat(defs);
		}

		return tags;
	}

	getTagsMentioned():string[] {
		let tags:string[] = [];

		// tags mentioned by YAML metadata
		let meta = this.getMeta();
		if(meta.tags){
			/** @todo (7/28/20) handle different tag list formats
			 * tags_defined: justonetag
			 * tags_defined: [properly, formatted, yaml list]
			 * tags_defined: improperly, formatted, yaml list
			 */
			// handle improperly formatted yaml list
			let mentioned:string | string[] = meta.tags;
			if(!Array.isArray(mentioned)){
				mentioned = mentioned.split(/\s*,\s*/g);
			}

			tags = tags.concat(mentioned);
		}

		// find all wikilinks, tags, citations
		this._doc.descendants((node:ProseNode, pos:number, parent:ProseNode) => {
			if(!node.type.isText){ return true; }

			let markTypes = ["wikilink", "tag", "citation"];

			if(node.marks.find((mark:Mark) => markTypes.includes(mark.type.name))) {
				tags.push(node.textContent);
			}
			return false;
		})

		return tags;
	}
}

export const MarkdownParser = new ParserFor(MarkdownDoc);