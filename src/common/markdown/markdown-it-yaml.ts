// Markdown-It extension for YAML frontmatter.
// Based on (https://github.com/CaliStyle/markdown-it-meta)

import YAML from "yaml";
import MarkdownIt from "markdown-it";
import StateBlock from "markdown-it/lib/rules_block/state_block";

////////////////////////////////////////////////////////////

function get(state:StateBlock, line:number) {
	const pos = state.bMarks[line];
	const max = state.eMarks[line];
	return state.src.substr(pos, max - pos);
}

const metaRule = (state:StateBlock, start:number, end:number, silent:boolean) => {
	// exit conditions
	if (start !== 0 || state.blkIndent !== 0) { return false; }
	if (state.tShift[start] < 0)              { return false; }
	if (!get(state, start).match(/^---$/))    { return false; }

	// locate YAML frontmatter
	const data = [];
	let line = start;
	while (line < end) {
		line++;
		const str = get(state, line);
		if (str.match(/^---$/)) { break; }
		if (state.tShift[line] < 0) { break; }
		data.push(str);
	}

	// advance state
	state.line = line + 1;
	
	// parse YAML frontmatter
	let parsed:any = null;
	try {
		parsed = YAML.parse(data.join('\n')) || {};
	} catch(err){
		console.error("YAML Parse Error:", err, "\n\nRAW:\n", data.join("\n"));
	}
	/** @todo (7/14/20) is this the best way to share metadata? */
	if(parsed){
		state.env.yamlMeta = parsed;
	}

	return true;
}

export const yaml_plugin:MarkdownIt.PluginWithOptions = (md:MarkdownIt, options:any) => {
	md.block.ruler.before('code', 'meta', metaRule, { alt: [] });
}