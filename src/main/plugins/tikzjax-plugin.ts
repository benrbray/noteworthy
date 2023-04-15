import { PreviewRenderer } from "./codemirror-plugin";

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