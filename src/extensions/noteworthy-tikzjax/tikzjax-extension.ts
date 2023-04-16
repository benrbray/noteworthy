// noteworthy
import { NoteworthyExtension, NoteworthyExtensionSpec } from "@main/extensions/noteworthy-extension";

// other extensions
import { PreviewRenderer } from "../noteworthy-codemirror-preview/codemirror-preview-types";

////////////////////////////////////////////////////////////////////////////////

// @ts-ignore
import tikzJaxSource from "@lib/tikzjax/tikzjax.js"
import "@lib/tikzjax/tikzjax.css"

function loadTikzJax(doc: Document) {
	const s = document.createElement("script");
	s.id = "tikzjax";
	s.type = "text/javascript";
	s.innerText = tikzJaxSource;
	doc.body.appendChild(s);
}

window.addEventListener("load", evt => {
	loadTikzJax(window.document);
});

////////////////////////////////////////////////////////////////////////////////

function stripEmptyLines(s: string): string {
	return s.replace(/^\n/gm, "");
}

function makeTikzCdDocument(code: string): string {
	return stripEmptyLines(`
\\usepackage{tikz-cd}
\\begin{document}
\\begin{tikzcd}
${code}
\\end{tikzcd}
\\end{document}
`);
}

export const tikzjaxRenderers: { [lang:string]: PreviewRenderer } = {
	"tikz" : (dom: HTMLElement, code: string): void => {
		dom.innerHTML = `<script type="text/tikz" data-show-console="true">${stripEmptyLines(code)}</script>`;
	},
	"tikzcd" : (dom: HTMLElement, code: string): void => {
		dom.innerHTML = `<script type="text/tikz" data-show-console="true">${makeTikzCdDocument(code)}</script>`;
	}
}

////////////////////////////////////////////////////////////////////////////////

export const tikzJaxExtensionSpec: NoteworthyExtensionSpec<
	"tikzJax",
	["codeMirrorPreview"]
> = {
	name: "tikzJax",
	config: {
		codeMirrorPreview: {
			previewRenderers: tikzjaxRenderers
		}
	}
}

////////////////////////////////////////////////////////////////////////////////

export namespace TikzJax {
	export type Name = "tikzJax";
	export interface Config { };
}

declare module "@main/extensions/noteworthy-extension" {
  export interface CommunityExtensions {
    tikzJax: {
      config: TikzJax.Config
    }
  }
}

export default class TizkJaxExtension extends NoteworthyExtension<TikzJax.Name> {

	constructor() { super(); }

	updateConfig(updated: TikzJax.Config): void {
		// extension has no config, do nothing
	}
	
}