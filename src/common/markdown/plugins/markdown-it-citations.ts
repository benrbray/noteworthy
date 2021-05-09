/* markdown-it-wikilinks */

// markdown-it imports
import MarkdownIt from "markdown-it";
import Token from "markdown-it/lib/token.js";
import { RenderRule } from "markdown-it/lib/renderer.js";
import { RuleInline } from "markdown-it/lib/parser_inline.js";
import StateInline from "markdown-it/lib/rules_inline/state_inline.js";

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

const citation_rule:RuleInline = (state:StateInline, silent:boolean) => {
	var start, match, token, res, esc_count;
	let pos:number = state.pos;
	let max:number = state.posMax;

	if (pos + 2 > max)  { return false; }

	let slice = state.src.slice(pos, pos+2);

	let is_open:boolean  = (slice == "@[");
	if(!is_open){ return false; }

	if (!isValidOpen(state, state.pos, "@[")) {
		if (!silent) { state.pending += "@["; }
		state.pos += 2;
		return true;
	}

	// First check for and bypass all properly escaped delimieters
	// This loop will assume that the first leading backtick can not
	// be the first character in state.src, which is known since
	// we have found an opening delimieter already.
	start = state.pos + 2;
	match = start;
	while ((match = state.src.indexOf("]", match)) !== -1) {
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
		if (!silent) { state.pending += "@["; }
		state.pos = start;
		return true;
	}

	// Check if we have empty content, ie: @[].  Do not parse.
	if (match - start === 0) {
		if (!silent) { state.pending += "@[]"; }
		state.pos = start + 1;
		return true;
	}

	// Check for valid closing delimiter
	if (!isValidClose(state, match, "]")) {
		if (!silent) { state.pending += "@["; }
		state.pos = start;
		return true;
	}

	if (!silent) {
		token = state.push('citation', 'citation', 0);
		token.markup = "@[";
		token.content = state.src.slice(start, match);
	}

	state.pos = match + 1;
	return true;
}

export const citation_plugin:MarkdownIt.PluginWithOptions = (md:MarkdownIt) => {

	// Inline Renderer -------------------------------------

	const inlineRenderer:RenderRule = (tokens:Token[], idx:number) => {
		return tokens[idx].content;
	};
	md.inline.ruler.after('escape', 'citation', citation_rule);
	md.renderer.rules.citation = inlineRenderer;
}