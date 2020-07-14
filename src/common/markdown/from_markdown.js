import markdownit from "markdown-it"
import { math_plugin } from "./markdown-it-katex"
import { wikilinks_plugin } from "./markdown-it-wikilinks"
import { tasklist_plugin } from "./markdown-it-tasklists"
import { citation_plugin } from "./markdown-it-citations"
import { tag_plugin } from "./markdown-it-tags"
import { Schema, Mark } from "prosemirror-model"

import { markdownSchema } from "./markdown-schema";

function maybeMerge(a, b) {
	if (a.isText && b.isText && Mark.sameSet(a.marks, b.marks))
		return a.withText(a.text + b.text)
}

// Object used to track the context of a running parse.
class MarkdownParseState {
	constructor(schema, tokenHandlers) {
		this.schema = schema
		this.stack = [{type: schema.topNodeType, content: []}]
		this.marks = Mark.none
		this.tokenHandlers = tokenHandlers
	}

	top() {
		return this.stack[this.stack.length - 1]
	}

	push(elt) {
		if (this.stack.length) this.top().content.push(elt)
	}

	// : (string)
	// Adds the given text to the current position in the document,
	// using the current marks as styling.
	addText(text) {
		if (!text) return
		let nodes = this.top().content, last = nodes[nodes.length - 1]
		let node = this.schema.text(text, this.marks), merged
		if (last && (merged = maybeMerge(last, node))) nodes[nodes.length - 1] = merged
		else nodes.push(node)
	}

	// : (Mark)
	// Adds the given mark to the set of active marks.
	openMark(mark) {
		this.marks = mark.addToSet(this.marks)
	}

	// : (Mark)
	// Removes the given mark from the set of active marks.
	closeMark(mark) {
		this.marks = mark.removeFromSet(this.marks)
	}

	parseTokens(toks) {
		//let domParser = new DOMParser();

		for (let i = 0; i < toks.length; i++) {
			let tok = toks[i]
			let tokenType = tok.type;

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
				console.log(tok);
				handler = noOp;
				console.error("Token type `" + tokenType + "` not supported by Markdown parser"); 
			}

			// handle token
			handler(this, tok)
		}
	}

	// : (NodeType, ?Object, ?[Node]) → ?Node
	// Add a node at the current position.
	addNode(type, attrs, content) {
		let node = type.createAndFill(attrs, content, this.marks)
		if (!node) return null
		this.push(node)
		return node
	}

	// : (NodeType, ?Object)
	// Wrap subsequent content in a node of the given type.
	openNode(type, attrs) {
		this.stack.push({type: type, attrs: attrs, content: []})
	}

	// : () → ?Node
	// Close and return the node that is currently on top of the stack.
	closeNode() {
		if (this.marks.length) this.marks = Mark.none
		let info = this.stack.pop()
		return this.addNode(info.type, info.attrs, info.content)
	}
}

function attrs(spec, token) {
	// support `class` attr by default
	let className = token.attrGet("class");
	if (spec.getAttrs) return {
		...(className && { class:className }),
		...spec.getAttrs(token)
	}
	// For backwards compatibility when `attrs` is a Function
	else if (spec.attrs instanceof Function) return spec.attrs(token)
	else return { ...spec.attrs, ...(className && {class:className }) };
}

// Code content is represented as a single token with a `content`
// property in Markdown-it.
function noOpenClose(type) {
	let tags = [
		"code_inline", "code_block", "fence", 
		"math_inline", "math_display", "wikilink", 
		"tasklist_item", "tag", "citation"
	];
	return tags.includes(type);
}

function isHtmlSingleton(tagName){
	return [ "hr", "br", "img"].includes(tagName)
}
function isSupportedHtmlTag(tagName){
	return [
		"div", "span", "hr", "br", "img", "u", "s", "em", "b",
		"h1", "h2", "h3", "h4", "h5", "h6", "input", "dfn", "cite"
	 ].includes(tagName);
}

function withoutTrailingNewline(str) {
	return str[str.length - 1] == "\n" ? str.slice(0, str.length - 1) : str
}

function noOp() {}

function tokenHandlers(schema, tokens) {
	let handlers = Object.create(null)
	for (let type in tokens) {
		let spec = tokens[type]; 
		
		// some token specs may override html tag
		let tokenType = (spec.html ? spec.html : type);
		
		// define token handlers
		if (spec.block) {
			let nodeType = schema.nodeType(spec.block)
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
		} else if (spec.node) {
			let nodeType = schema.nodeType(spec.node)
			handlers[tokenType] = (state, tok) => state.addNode(nodeType, attrs(spec, tok))
		} else if (spec.mark) {
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
		} else if (spec.ignore) {
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

	handlers.text = (state, tok) => state.addText(tok.content)
	handlers.inline = (state, tok) => state.parseTokens(tok.children)
	handlers.softbreak = handlers.softbreak || (state => state.addText("\n"))

	return handlers
}

// ::- A configuration of a Markdown parser. Such a parser uses
// [markdown-it](https://github.com/markdown-it/markdown-it) to
// tokenize a file, and then runs the custom rules it is given over
// the tokens to create a ProseMirror document tree.
export class MarkdownParser {
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
	constructor(schema, tokenizer, tokens) {
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
	parse(text) {
		let state = new MarkdownParseState(this.schema, this.tokenHandlers), doc
		state.parseTokens(this.tokenizer.parse(text, {}))
		do { doc = state.closeNode() } while (state.stack.length)
		return doc
	}
}

// :: MarkdownParser
// A parser parsing unextended [CommonMark](http://commonmark.org/),
// with inline HTML, and producing a document in the basic schema.
let md = markdownit({html:true})
	.use(math_plugin)
	.use(wikilinks_plugin)
	.use(tasklist_plugin)
	.use(tag_plugin)
	.use(citation_plugin)

export const markdownParser = new MarkdownParser(markdownSchema, md, {
	blockquote: {block: "blockquote"},
	paragraph: {block: "paragraph"},
	list_item: {block: "list_item"},
	bullet_list: {block: "bullet_list"},
	ordered_list: {block: "ordered_list", getAttrs: tok => ({order: +tok.attrGet("start") || 1})},
	heading: {block: "heading", getAttrs: tok => ({level: +tok.tag.slice(1)})},
	code_block: {block: "code_block"},
	fence: {block: "code_block", getAttrs: tok => ({params: tok.info || ""})},
	hr: {node: "horizontal_rule"},
	image: {node: "image", getAttrs: tok => ({
		src: tok.attrGet("src"),
		title: tok.attrGet("title") || null,
		alt: tok.children[0] && tok.children[0].content || null
	})},
	hardbreak: {node: "hard_break"},
	s: { mark: "strike" },
	u: { mark: "underline" },
	em: {mark: "em"},
	tag: {mark: "tag"},
	dfn: {mark: "definition"},
	cite: {mark: "citation"},
	citation: {mark: "citation"},
	strong: {mark: "strong"},
	link: {mark: "link", getAttrs: tok => ({
		href: tok.attrGet("href"),
		title: tok.attrGet("title") || null
	})},
	tasklist_item: {
		node: "tasklist_item",
		getAttrs: tok=> ({
			label:tok.attrGet("label"),
			checked:(tok.attrGet("checked")!="false")
		})
	},
	wikilink: {mark:"wikilink"},
	code_inline: {mark: "code"},
	math_inline: { block: "math_inline", getAttrs: tok => ({params: tok.info || ""})},
	math_display: { block: "math_display", getAttrs: tok => ({params: tok.info || ""})}
})