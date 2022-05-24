import { Suspense, For, createResource, JSX } from "solid-js";
import { MainIpcHandlers } from "@main/MainIPC";
import { IFileMeta } from "@common/files";
import { visitNodeType } from "@common/markdown/unist-utils";


// unist / unified
import * as Uni from "unist";
import * as Md from "@common/markdown/markdown-ast";

////////////////////////////////////////////////////////////////////////////////

export interface BibliographyProps {
	proxy: MainIpcHandlers;
	citationKeys: string[];
}

interface BibliographyData {
	data: string | null;
}

export const BibliographyComponent = (props: BibliographyProps) => {

	const [citations] = createResource<BibliographyData, typeof props>(
		() => props,
		async (pr, getPrev) => {
			const bibliography = await pr.proxy.citations.generateBibliography(pr.citationKeys);
			console.log(bibliography);
			return { data: bibliography };
		}
	);


	
	return (<div id="bibliography">
		<h2>Bibliography</h2>
		<p innerHTML={citations()?.data || ""}/>
	</div>);
}