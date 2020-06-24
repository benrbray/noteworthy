/** 
 * Markdown-it plugin to render GitHub-style task lists; see
 *
 * https://github.com/revin/markdown-it-task-lists
 * https://github.com/blog/1375-task-lists-in-gfm-issues-pulls-comments
 * https://github.com/blog/1825-task-lists-in-all-markdown-documents
 */

 // markdown-it imports
import MarkdownIt from "markdown-it";
import StateCore from "markdown-it/lib/rules_core/state_core";
import Token from "markdown-it/lib/token";

////////////////////////////////////////////////////////////

let disableCheckboxes:boolean = true;
let useLabelWrapper:boolean = false;
let useLabelAfter:boolean = false;

// -- Types --------------------------------------------- //

interface IPluginOptions {
	enabled?:boolean;
	label?:boolean;
	labelAfter?:boolean;
}

interface ITokenConstructor {
	new(type: string, tag: string, nesting: Token.Nesting): Token;
}

// -- Plugin -------------------------------------------- //

export const tasklist_plugin = (md:MarkdownIt, options:IPluginOptions) => {
	if (options) {
		disableCheckboxes = !options.enabled;
		useLabelWrapper = !!options.label;
		useLabelAfter = !!options.labelAfter;
	}

	md.core.ruler.after('inline', 'github-task-lists', (state:StateCore) => {
		var tokens = state.tokens;
		let foundTodo:boolean = false;
		for (var i = 2; i < tokens.length; i++) {
			if (isTodoItem(tokens, i)) {
				todoify(tokens[i], state.Token);
				attrSet(tokens[i-2], 'class', 'task-list-item' + (!disableCheckboxes ? ' enabled' : ''));
				attrSet(tokens[parentToken(tokens, i-2)], 'class', 'contains-task-list');
				foundTodo = true;
			}
		}
		return foundTodo;
	});
};

// -- Parser -------------------------------------------- //

function attrSet(token: Token, name:string, value:string) {
	var index = token.attrIndex(name);
	var attr:[string,string] = [name, value];

	if (index < 0) {
		token.attrPush(attr);
	} else {
		if(token.attrs) { token.attrs[index] = attr };
	}
}

function parentToken(tokens: Token[], index:number) {
	var targetLevel = tokens[index].level - 1;
	for (var i = index - 1; i >= 0; i--) {
		if (tokens[i].level === targetLevel) {
			return i;
		}
	}
	return -1;
}

function isTodoItem(tokens: Token[], index:number) {
	return isInline(tokens[index]) &&
	       isParagraph(tokens[index - 1]) &&
	       isListItem(tokens[index - 2]) &&
	       startsWithTodoMarkdown(tokens[index]);
}

function todoify(token: Token, TokenConstructor: ITokenConstructor) {
	console.log("todoify:", token);
	if(!token.children){ return; }
	token.children.unshift(makeCheckbox(token, TokenConstructor));
	token.children[1].content = token.children[1].content.slice(3);
	token.content = token.content.slice(3);
	/*if (useLabelWrapper) {
		if (useLabelAfter) {
			token.children.pop();

			// Use large random number as id property of the checkbox.
			var id = 'task-item-' + Math.ceil(Math.random() * (10000 * 1000) - 1000);
			token.children[0].content = token.children[0].content.slice(0, -1) + ' id="' + id + '">';
			token.children.push(afterLabel(token.content, id, TokenConstructor));
		} else {
			token.children.unshift(beginLabel(TokenConstructor));
			token.children.push(endLabel(TokenConstructor));
		}
	}*/
}

function makeCheckbox(token: Token, TokenConstructor:ITokenConstructor) {
	var checkbox = new TokenConstructor('tasklist_item', '', 0);
	var disabledAttr = disableCheckboxes ? ' disabled="" ' : '';
	checkbox.attrSet("label", token.content.slice(3).trim());
	checkbox.content = token.content.slice(3).trim();
	if (token.content.indexOf('[ ] ') === 0) {
		checkbox.attrSet("checked", "false");
		//checkbox.content = '<input class="task-list-item-checkbox"' + disabledAttr + 'type="checkbox">';
	} else if (token.content.indexOf('[x] ') === 0 || token.content.indexOf('[X] ') === 0) {
		checkbox.attrSet("checked", "true");
		//checkbox.content = '<input class="task-list-item-checkbox" checked=""' + disabledAttr + 'type="checkbox">';
	}
	console.log("making checkbox", checkbox);
	return checkbox;
}

// these next two functions are kind of hacky; probably should really be a
// true block-level token with .tag=='label'
function beginLabel(TokenConstructor: ITokenConstructor) {
	var token = new TokenConstructor('tasklist_label', '', 0);
	token.content = '<label>';
	return token;
}

function endLabel(TokenConstructor: ITokenConstructor) {
	var token = new TokenConstructor('tasklist_label', '', 0);
	token.content = '</label>';
	return token;
}

function afterLabel(content:string, id:string, TokenConstructor: ITokenConstructor) {
	var token = new TokenConstructor('tasklist_label', '', 0);
	token.content = '<label class="task-list-item-label" for="' + id + '">' + content + '</label>';
	token.attrs = [["for", id]];
	return token;
}

function isInline(token:Token) { return token.type === 'inline'; }
function isParagraph(token:Token) { return token.type === 'paragraph_open'; }
function isListItem(token:Token) { return token.type === 'list_item_open'; }

function startsWithTodoMarkdown(token:Token) {
	// leading whitespace in a list item is already trimmed off by markdown-it
	return token.content.indexOf('[ ] ') === 0 || token.content.indexOf('[x] ') === 0 || token.content.indexOf('[X] ') === 0;
}