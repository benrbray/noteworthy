import { IFileMeta } from "@common/files";
import { For, createResourceState, Suspense } from "solid-js";

////////////////////////////////////////////////////////////

interface IHistoryTabProps {
	//outline: IOutline | null;
	navHistory: { history: IFileMeta[], currentIdx: number };
	handleHistoryClick: (evt:MouseEvent) => void;
}

export const HistoryTab = (props: IHistoryTabProps) => {
	// render
	return (<div id="tab_outline" class="tab-contents">
		<Suspense fallback={"waiting for outline..."}>
			<For each={props.navHistory.history} fallback={<div>no outline!</div>}>
			{(entry: IFileMeta, idx)=>(
				<div 
					class={(idx() == props.navHistory.currentIdx) ? "list-item file active" : "list-item file"}
					data-history-idx={idx()}
					title={entry.name}
					onClick={props.handleHistoryClick}
				>
					{entry.name}
				</div>
			)}
			</For>
		</Suspense>
	</div>)
}