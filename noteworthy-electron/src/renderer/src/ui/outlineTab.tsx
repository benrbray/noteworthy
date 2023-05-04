import { For, createResource, Suspense } from "solid-js";
import { IOutline, IOutlineEntry } from "@main/plugins/outline-plugin";

////////////////////////////////////////////////////////////

interface IOutlineTabProps {
	//outline: IOutline | null;
	getOutline: () => Promise<IOutline|null>;
}

export const OutlineTab = (props:IOutlineTabProps) => {
	// fetch outline
	const [res] = createResource<{ outline: IOutline|null }>(
		async (k, getPrev) => ({
			outline: await props.getOutline()
		}),
	);

	// render
	return (<div id="tab_outline" class="tab-contents">
		<Suspense fallback={"waiting for outline..."}>
			<For each={res()?.outline || []} fallback={<div>no outline!</div>}>
			{(entry:IOutlineEntry)=>(
				<div class="list-item" data-depth={entry.depth} title={entry.label}>
					{entry.label}
				</div>
			)}
			</For>
		</Suspense>
	</div>)
}