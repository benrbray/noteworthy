/* markdown-it-wikilinks */

// markdown-it imports
import MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token";
import { RenderRule } from "markdown-it/lib/renderer";
import { RuleInline } from "markdown-it/lib/parser_inline";
import StateInline from "markdown-it/lib/rules_inline/state_inline";

////////////////////////////////////////////////////////////

// Test if potential opening or closing delimieter
// Assumes the string `str` starts at state.src[pos]
function isValidOpen(state:StateInline, pos:number, str:string) {
	let max = state.posMax;
	let strEnd = pos + str.length;
	let nextChar:number = strEnd <= max ? state.src.charCodeAt(strEnd) : -1;
	// check non-whitespace conditions for opening
	return !(nextChar === 0x20/* " " */ || nextChar === 0x09/* \t */);
}

// Test if potential opening or closing delimieter
// Assumes the string `str` starts at state.src[pos]
function isValidClose(state: StateInline, pos: number, str:string) {
	let prevChar:number = pos > 0 ? state.src.charCodeAt(pos - 1) : -1;
	// check non-whitespace conditions for closing
	return !(prevChar === 0x20/* " " */ || prevChar === 0x09/* \t */);
}

const tag_rule:RuleInline = (state:StateInline, silent:boolean) => {
	let start, match, token, res, esc_count;
	let pos:number = state.pos;
	let max:number = state.posMax;

	let open_tag:string = "#[";
	let close_tag:string = "]";
	let open_len = open_tag.length;
	let close_len = close_tag.length;

	if (pos + open_len > max)  { return false; }

	let slice = state.src.slice(pos, pos + open_len);

	let is_open:boolean  = (slice == open_tag);
	if(!is_open){ return false; }

	if (!isValidOpen(state, state.pos, open_tag)) {
		if (!silent) { state.pending += open_tag; }
		state.pos += open_len;
		return true;
	}

	// First check for and bypass all properly escaped delimieters
	// This loop will assume that the first leading backtick can not
	// be the first character in state.src, which is known since
	// we have found an opening delimieter already.
	start = state.pos + open_len;
	match = start;
	while ((match = state.src.indexOf(close_tag, match)) !== -1) {
		// Found potential ]], look for escapes, pos will point to
		// first non escape when complete
		pos = match - 1;
		while (state.src[pos] === "\\") { pos -= 1; }

		// Even number of escapes, potential closing delimiter found
		if (((match - pos) % 2) == 1) { break; }
		match += 1;
	}

	// No closing delimter found.  Consume [[ and continue.
	if (match === -1) {
		if (!silent) { state.pending += open_tag; }
		state.pos = start;
		return true;
	}

	// Check if we have empty content, ie: @[].  Do not parse.
	if (match - start === 0) {
		if (!silent) { state.pending += open_tag + close_tag; }
		state.pos = start + close_len;
		return true;
	}

	// Check for valid closing delimiter
	if (!isValidClose(state, match, close_tag)) {
		if (!silent) { state.pending += open_tag; }
		state.pos = start;
		return true;
	}

	if (!silent) {
		token = state.push('tag', 'tag', 0);
		token.markup = open_tag;
		token.content = state.src.slice(start, match);
	}

	state.pos = match + 1;
	return true;
}

export const tag_plugin:MarkdownIt.PluginWithOptions = (md:MarkdownIt) => {

	// Inline Renderer -------------------------------------

	const inlineRenderer:RenderRule = (tokens:Token[], idx:number) => {
		return tokens[idx].content;
	};
	md.inline.ruler.after('escape', 'tag', tag_rule);
	md.renderer.rules.tag = inlineRenderer;
}