import markdownit from "markdown-it"
import { yaml_plugin } from "./plugins/markdown-it-yaml"
import { math_plugin } from "./plugins/markdown-it-katex"
import { wikilinks_plugin } from "./plugins/markdown-it-wikilinks"
import { tasklist_plugin } from "./plugins/markdown-it-tasklists"
import { citation_plugin } from "./plugins/markdown-it-citations"
import { tag_plugin } from "./plugins/markdown-it-tags"
import { Schema as ProseSchema, Mark as ProseMark, Node as ProseNode, NodeType, MarkType } from "prosemirror-model";

import { markdownSchema } from "./markdown-schema";
import StateInline from "markdown-it/lib/rules_inline/state_inline";
import StateBlock from "markdown-it/lib/rules_block/state_block";
import Token from "markdown-it/lib/token";
import MarkdownIt from "markdown-it";
import directive_plugin, { DirectivePluginOptions } from "./plugins/markdown-it-directive";
import { randomId } from "@common/util/random";

////////////////////////////////////////////////////////////

/* ==== TYPES =========================================== */

interface IBlockType {
	type: "block";
	block: string;
	html?:string;
	getAttrs?: (tok:Token) => any;
}

interface INodeType {
	type: "node";
	node: string;
	html?:string;
	getAttrs?: (tok:Token) => any;
}

interface IMarkType {
	type: "mark";
	mark: string;
	html?:string;
	getAttrs?: (tok:Token) => any;
}

interface IIgnoreType {
	type: "ignore";
	html?:string;
	getAttrs?: (tok:Token) => any;
}

type IParserSpec = IBlockType | INodeType | IMarkType | IIgnoreType;

type TokenHandler = (state:MarkdownParseState, tok:Token)=>any;

/* ==== MARKDOWN PARSE STATE ============================ */

/* -- Helpers ------------------------------------------- */

function maybeMerge(a:any, b:any) {
	if (a.isText && b.isText && ProseMark.sameSet(a.marks, b.marks))
		return a.withText(a.text + b.text)
}

function withoutTrailingNewline(str:string):string {
	return str[str.length - 1] == "\n" ? str.slice(0, str.length - 1) : str
}

/* -- Parse State --------------------------------------- */

// Object used to track the context of a running parse.
class MarkdownParseState {

	schema:ProseSchema;
	stack: {type:NodeType, content:ProseNode[], attrs?:any}[];
	marks: ProseMark[];
	tokenHandlers:{ [type:string] : TokenHandler}

	constructor(schema:ProseSchema, tokenHandlers:{ [type:string] : TokenHandler}, topAttrs:any) {
		this.schema = schema
		this.marks = ProseMark.none
		this.tokenHandlers = tokenHandlers

		// create ProseMirror topNode with specified attrs (e.g. YAML)
		this.stack = [{type: schema.topNodeType, content: [], attrs: topAttrs}]
	}

	top() {
		return this.stack[this.stack.length - 1]
	}

	push(elt:ProseNode) {
		if (this.stack.length) this.top().content.push(elt)
	}

	// : (string)
	// Adds the given text to the current position in the document,
	// using the current marks as styling.
	addText(text:string) {
		if (!text) return
		let nodes = this.top().content, last = nodes[nodes.length - 1]
		let node = this.schema.text(text, this.marks), merged
		if (last && (merged = maybeMerge(last, node))) nodes[nodes.length - 1] = merged
		else nodes.push(node)
	}

	// : (Mark)
	// Adds the given mark to the set of active marks.
	openMark(mark:ProseMark) {
		this.marks = mark.addToSet(this.marks)
	}

	// : (Mark)
	// Removes the given mark from the set of active marks.
	closeMark(mark:MarkType) {
		this.marks = mark.removeFromSet(this.marks)
	}

	parseTokens(toks:Token[]) {
		//let domParser = new DOMParser();

		for (let i = 0; i < toks.length; i++) {
			let tok:Token = toks[i]
			let tokenType:string = tok.type;

			// html_inline tokens have a `content` property, storing
			// the html tag as a string like "<div>" or "</div>"
			if(tokenType === "html_inline" || tokenType === "html_block"){
				// extract tag contents
				let match = tok.content.trim().match(/<(\/?)([a-zA-Z\-]+)(?:\s*(.*))>/);
				if(!match){ throw new Error("Invalid html token! " + tok.content); }
				let closed = (match[1] === "/");
				let tagName = match[2].toLowerCase();
				if(!isSupportedHtmlTag(tagName)){
					console.error("Unsupported HTML Tag!", tok.content);
					tokenType = "text";
					//throw new Error("Unsupported HTML Tag! " + tok.content);
				}
				
				// extract attrs
				let attrs = {};
				/** @todo (6/21/20) this won't work outside a BrowserWindow!
				 * need to come up with a different solution (e.g. jsdom)
				 */
				/*if(!closed){
					let parsed = domParser.parseFromString(match[0], "text/html");
					if(parsed.body.children.length > 0){
						attrs = parsed.body.children[0].attributes;
					} else if(parsed.head.children.length > 0){
						attrs = parsed.head.children[0].attributes;
					}
					if(attrs){ console.log("found attrs", attrs); }
				}*/
				
				// old regex code for parsing attrs
				/*let attrs = new Map();
				let attrStr = match[3];
				if(attrStr.length > 1){
					let regex = /\s*([a-zA-Z\-]+)(\s*=\s*('((?:[^']|\\')*)'|"((?:[^"]|\\")*)"))?/g;
					let attrMatch;
					while(attrMatch = regex.exec(attrStr)){
						console.log("found attr:", attrMatch);
					}
				}*/
				// determine token type
				if(isHtmlSingleton(tagName)){
					tokenType = tagName;
				} else {
					tokenType = tagName + (closed ? "_close" : "_open");
				}
			}
			
			// fetch token handler for this type
			let handler = this.tokenHandlers[tokenType];
			if (!handler) { 
				handler = noOp;
				console.error("Token type `" + tokenType + "` not supported by Markdown parser"); 
			}

			// handle token
			handler(this, tok)
		}
	}

	// : (NodeType, ?Object, ?[Node]) → ?Node
	// Add a node at the current position.
	addNode(type:NodeType, attrs:object, content?:ProseNode[]) {
		let node = type.createAndFill(attrs, content, this.marks)
		if (!node) return null
		this.push(node)
		return node
	}

	// : (NodeType, ?Object)
	// Wrap subsequent content in a node of the given type.
	openNode(type:NodeType, attrs:object) {
		this.stack.push({type: type, attrs: attrs, content: []})
	}

	// : () → ?Node
	// Close and return the node that is currently on top of the stack.
	closeNode() {
		if (this.marks.length) this.marks = ProseMark.none
		let info = this.stack.pop()
		if(!info){ throw new Error("from_markdown :: no node to close!"); }
		return this.addNode(info.type, info.attrs, info.content)
	}
}

/* -- Attrs --------------------------------------------- */

function attrs(spec:IParserSpec, token:Token) {
	// support `class` attr by default
	let className = token.attrGet("class");
	if (spec.getAttrs) return {
		...(className && { class:className }),
		...spec.getAttrs(token)
	}
	// For backwards compatibility when `attrs` is a Function
	//else if (spec.attrs instanceof Function) return spec.attrs(token)
	//else return { ...spec.attrs, ...(className && {class:className }) };
}

/* -- Token Handlers ------------------------------------ */

function tokenHandlers(schema:ProseSchema, tokens:{ [type:string] : IParserSpec }): { [type:string] : TokenHandler} {
	let handlers:{ [type:string] : TokenHandler } = Object.create(null)
	for (let type in tokens) {
		let spec:IParserSpec = tokens[type]; 
		
		// some token specs may override html tag
		let tokenType = (spec.html ? spec.html : type);
		
		// define token handlers
		if (spec.type == "block") {
			let nodeType = schema.nodes[spec.block];
			if (noOpenClose(tokenType)) {
				handlers[tokenType] = (state, tok) => {
					state.openNode(nodeType, attrs(spec, tok))
					state.addText(withoutTrailingNewline(tok.content))
					state.closeNode()
				}
			} else {
				handlers[tokenType + "_open"] = (state, tok) => state.openNode(nodeType, attrs(spec, tok))
				handlers[tokenType + "_close"] = state => state.closeNode()
			}
		} else if (spec.type == "node") {
			let nodeType = schema.nodes[spec.node];
			handlers[tokenType] = (state, tok) => state.addNode(nodeType, attrs(spec, tok))
		} else if (spec.type == "mark") {
			let markType = schema.marks[spec.mark]
			if (noOpenClose(tokenType)) {
				handlers[tokenType] = (state, tok) => {
					state.openMark(markType.create(attrs(spec, tok)))
					state.addText(withoutTrailingNewline(tok.content))
					state.closeMark(markType)
				}
			} else {
				handlers[tokenType + "_open"] = (state, tok) => state.openMark(markType.create(attrs(spec, tok)))
				handlers[tokenType + "_close"] = state => state.closeMark(markType)
			}
		} else if (spec.type == "ignore") {
			if (noOpenClose(tokenType)) {
				handlers[tokenType] = noOp
			} else {
				handlers[tokenType + '_open'] = noOp
				handlers[tokenType + '_close'] = noOp
			}
		} else {
			throw new RangeError("Unrecognized parsing spec " + JSON.stringify(spec))
		}
	}

	handlers["text"] = (state, tok) => state.addText(tok.content)
	handlers["inline"] = (state, tok) => tok.children && state.parseTokens(tok.children);
	handlers["softbreak"] = handlers.softbreak || (state => state.addText("\n"))

	return handlers
}

/* ==== MARKDOWN PARSER ================================= */

// ::- A configuration of a Markdown parser. Such a parser uses
// [markdown-it](https://github.com/markdown-it/markdown-it) to
// tokenize a file, and then runs the custom rules it is given over
// the tokens to create a ProseMirror document tree.
export class MarkdownParser {

	schema:ProseSchema;
	tokenizer:markdownit;
	tokens: { [type:string] : IParserSpec };
	tokenHandlers: { [type:string] : TokenHandler };

	// :: (Schema, MarkdownIt, Object)
	// Create a parser with the given configuration. You can configure
	// the markdown-it parser to parse the dialect you want, and provide
	// a description of the ProseMirror entities those tokens map to in
	// the `tokens` object, which maps token names to descriptions of
	// what to do with them. Such a description is an object, and may
	// have the following properties:
	//
	// **`node`**`: ?string`
	//   : This token maps to a single node, whose type can be looked up
	//     in the schema under the given name. Exactly one of `node`,
	//     `block`, or `mark` must be set.
	//
	// **`block`**`: ?string`
	//   : This token comes in `_open` and `_close` variants (which are
	//     appended to the base token name provides a the object
	//     property), and wraps a block of content. The block should be
	//     wrapped in a node of the type named to by the property's
	//     value.
	//
	// **`mark`**`: ?string`
	//   : This token also comes in `_open` and `_close` variants, but
	//     should add a mark (named by the value) to its content, rather
	//     than wrapping it in a node.
	//
	// **`attrs`**`: ?Object`
	//   : Attributes for the node or mark. When `getAttrs` is provided,
	//     it takes precedence.
	//
	// **`getAttrs`**`: ?(MarkdownToken) → Object`
	//   : A function used to compute the attributes for the node or mark
	//     that takes a [markdown-it
	//     token](https://markdown-it.github.io/markdown-it/#Token) and
	//     returns an attribute object.
	//
	// **`ignore`**`: ?bool`
	//   : When true, ignore content for the matched token.
	constructor(schema:ProseSchema, tokenizer:markdownit, tokens:{ [type:string] : IParserSpec }) {
		// :: Object The value of the `tokens` object used to construct
		// this parser. Can be useful to copy and modify to base other
		// parsers on.
		this.tokens = tokens
		this.schema = schema
		this.tokenizer = tokenizer
		this.tokenHandlers = tokenHandlers(schema, tokens)
	}

	// :: (string) → Node
	// Parse a string as [CommonMark](http://commonmark.org/) markup,
	// and create a ProseMirror document as prescribed by this parser's
	// rules.
	parse(text:string) {
		
		// tokenize with markdown-it
		let env:any = {};
		let tokens = this.tokenizer.parse(text, env);
		let yamlMeta = env["yamlMeta"] || {};
		if(Object.keys(yamlMeta).length > 0){
			console.log("YAML:", yamlMeta);
		}
		
		// parse tokens
		let state = new MarkdownParseState(this.schema, this.tokenHandlers, {yamlMeta});
		state.parseTokens(tokens);

		// parse tokens and convert to ProseMirror ducment
		let doc:ProseNode|null;
		do { doc = state.closeNode() } while (state.stack.length);

		/** @todo (7/28/20) gracefully handle parse errors */
		if(!doc){
			console.error("from_markdown :: parse error!");
			return null;
		}

		// return document + metadata
		return doc;
	}
}

/* ==== CONFIGURATION =================================== */

/* -- MarkdownIt Tokenizer ------------------------------ */

// :: MarkdownParser
// A parser parsing unextended [CommonMark](http://commonmark.org/),
// with inline HTML, and producing a document in the basic schema.

console.log(directive_plugin);

let md = markdownit({html:true})
	.use(yaml_plugin)
	.use(math_plugin)
	.use(wikilinks_plugin)
	.use(tasklist_plugin)
	.use(tag_plugin)
	.use(citation_plugin)
	.use(directive_plugin, {
		inlineDirectives : { },
		blockDirectives: {
			"region" : (
				state, content, contentTitle, inlineContent, dests, attrs,
				contentStartLine, contentEndLine,
				contentTitleStart, contentTitleEnd,
				inlineContentStart, inlineContentEnd,
				directiveStartLine, directiveEndLine
			) => {
				// open tag
				const token = state.push('region_open', '', 1);
				token.map = [ directiveStartLine, directiveEndLine ];

				// region attrs
				let id = attrs && attrs.id;
				if(typeof id !== "string"){
					if(Array.isArray(id) && id.length > 0){
						id = id[0];
					} else { 
						/** @todo (7/30/20) ask user to provide region name if not present */
						id = randomId(); 
						console.error("no region id found -- using generated id =", id);
					}
				}
				token.attrs = [ ["regionName", id] ];

				// parse inner content
				// (https://github.com/hilookas/markdown-it-directive-webcomponents/blob/9d1f6c04ad00406e5b7e14cb07dfdcb461ca6717/index.js#L99)
				const oldMax = state.lineMax;
				state.line = contentStartLine;
				state.lineMax = contentEndLine;
				state.md.block.tokenize(state, contentStartLine, contentEndLine);
				state.lineMax = oldMax;

				// close tag
				const token_close = state.push("region_close", "", -1);
			},
			"embed" : (
				state, content, contentTitle, inlineContent, dests, attrs,
				contentStartLine, contentEndLine,
				contentTitleStart, contentTitleEnd,
				inlineContentStart, inlineContentEnd,
				directiveStartLine, directiveEndLine
			) => {
				// open tag
				const token = state.push('embed_block', '', 0);
				token.map = [ directiveStartLine, directiveEndLine ];

				console.log("EMBED ATTRS", attrs);
				console.log("\tcontent", content)
				console.log("\tcontentTitle", contentTitle)
				console.log("\tinlineContent", inlineContent)
				console.log("\tdests", dests);

				// file name
				let fileName = attrs && attrs.id;
				if(typeof fileName !== "string"){
					if(Array.isArray(fileName) && fileName.length > 0){
						fileName = fileName[0];
					} else { 
						/** @todo (7/30/20) ask user to provide region name if not present */
						throw new Error("no fileName found in embed");
					}
				}

				// region name
				let regionName = attrs && attrs.region;
				if(typeof regionName !== "string"){
					if(Array.isArray(regionName) && regionName.length > 0){
						regionName = regionName[0];
					} else { 
						/** @todo (7/30/20) ask user to provide region name if not present */
						throw new Error("no regionName found in embed");
					}
				}
				console.log("EMBED BLOCK", fileName, regionName);

				token.attrs = [ ["fileName", fileName], ["regionName", regionName] ];

				state.line = contentEndLine;
			}
		}
	});

/* -- Token Types --------------------------------------- */

// Code content is represented as a single token with a `content`
// property in Markdown-it.
function noOpenClose(type:string):boolean {
	let tags = [
		"code_inline", "code_block", "fence", 
		"math_inline", "math_display", "wikilink", 
		"tasklist_item", "tag", "citation"
	];
	return tags.includes(type);
}

function isHtmlSingleton(tagName:string): boolean {
	return [ "hr", "br", "img"].includes(tagName)
}
function isSupportedHtmlTag(tagName:string):boolean {
	return [
		"div", "span", "hr", "br", "img", "u", "s", "em", "b",
		"h1", "h2", "h3", "h4", "h5", "h6", "input", "dfn", "cite"
	 ].includes(tagName);
}

function noOp() {}

/* -- Parser Configuration ------------------------------ */

export const markdownParser = new MarkdownParser(markdownSchema, md, {
	/* -- Blocks ---------------------------------------- */
	blockquote:   { type:"block", block: "blockquote"  },
	paragraph:    { type:"block", block: "paragraph"   },
	list_item:    { type:"block", block: "list_item", getAttrs: tok => ({ bullet: tok.markup || "*" })   },
	bullet_list:  { type:"block", block: "bullet_list", getAttrs: tok => ({ bullet: tok.markup || "*" }) },
	code_block:   { type:"block", block: "code_block"  },
	region:       { type:"block", block:"region", getAttrs: tok => ({ region: tok.attrGet("regionName")||undefined}) },

	ordered_list: { type:"block", block: "ordered_list", getAttrs: tok => ({order: +(tok.attrGet("start") || 1)})},
	heading:      { type:"block", block: "heading",      getAttrs: tok => ({level: +tok.tag.slice(1)})},
	fence:        { type:"block", block: "code_block",   getAttrs: tok => ({params: tok.info || ""})},
	
	math_inline:  { type:"block", block: "math_inline",  getAttrs: tok => ({params: tok.info || ""})},
	math_display: { type:"block", block: "math_display", getAttrs: tok => ({params: tok.info || ""})},


	/* -- Nodes ----------------------------------------- */
	hr:        { type:"node", node: "horizontal_rule" },
	hardbreak: { type:"node", node: "hard_break"      },

	image: { type:"node", node: "image", getAttrs: tok => ({
		src: tok.attrGet("src"),
		title: tok.attrGet("title") || null,
		alt: tok.children && tok.children[0] && tok.children[0].content || null
	})},

	embed_block:  { 
		type:"node",
		node: "embed",
		getAttrs: (tok:Token) => ({
			fileName: tok.attrGet("fileName")||undefined,
			regionName: tok.attrGet("regionName")||undefined
		})
	},

	tasklist_item: {
		type: "node",
		node: "tasklist_item",
		getAttrs: tok=> ({
			label:tok.attrGet("label"),
			checked:(tok.attrGet("checked")!="false")
		})
	},

	/* -- Marks ----------------------------------------- */
	s:           { type:"mark", mark: "strike"     },
	u:           { type:"mark", mark: "underline"  },
	em:          { type:"mark", mark: "em"         },
	tag:         { type:"mark", mark: "tag"        },
	dfn:         { type:"mark", mark: "definition" },
	cite:        { type:"mark", mark: "citation"   },
	citation:    { type:"mark", mark: "citation"   },
	strong:      { type:"mark", mark: "strong"     },
	wikilink:    { type:"mark", mark:"wikilink"    },
	code_inline: { type:"mark", mark: "code"       },

	link: {type:"mark",mark: "link", getAttrs: tok => ({
		href: tok.attrGet("href"),
		title: tok.attrGet("title") || null
	})},
})