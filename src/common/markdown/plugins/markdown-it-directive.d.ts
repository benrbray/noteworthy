export type InlineDirective = (
	state:import("markdown-it/lib/rules_inline/state_inline"),
	content:string,
	dests:[string,string][],
	attrs:{ [key:string]:string|string[] },
	contentStart:number,
	contentEnd:number,
	directiveStart:number,
	directiveEnd:number
) => void;

export type BlockDirective = (
	state:import("markdown-it/lib/rules_block/state_block"),
	content:string, 
	contentTitle:string,
	inlineContent:string,
	dests:[string,string][],
	attrs:{ [key:string]:string|string[] },
	contentStartLine:number, contentEndLine:number,
	contentTitleStart:number, contentTitleEnd:number,
	inlineContentStart:number, inlineContentEnd:number,
	directiveStartLine:number, directiveEndLine:number
) => void;

export interface DirectivePluginOptions {
	inlineDirectives: { [directive_name:string] : InlineDirective };
	blockDirectives: { [directive_name:string] : BlockDirective };
}

function load(md: import("markdown-it"), options?: DirectivePluginOptions | undefined):void;

export default load;