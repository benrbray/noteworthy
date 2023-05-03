// solid
import * as S from "solid-js";
import { For, Show, Match, Switch } from 'solid-js/web';
import { SuggestData, SuggestItemFancy, SuggestItemSimple } from "./autocomplete-extension";

////////////////////////////////////////////////////////////

const renderFancyLabel = (fancy: SuggestItemFancy) => {
	return (<div>
		<For each={fancy.dom}>
		{(a) => {
			return (<span class={a.class}>{a.text}</span>)
		}}
		</For>
	</div>);
}

export const Suggest = (
	props: {
		open: boolean,
		selectedIdx: number,
		pos: {top:number, left:number},
		data: SuggestData,
		onItemHover: (idx: number, evt: MouseEvent) => void,
		onItemClick: (idx: number, evt: MouseEvent) => void
	}
) => {
	// mapping from group -> starting index
	const groupIdxMap = S.createMemo(() => {
		const result = props.data.map(g => g.items.length);
		for(let k = 0, len = 0; k < result.length; k++) {
			let groupLen = result[k];
			result[k] = len;
			len += groupLen;
		}
		return result;
	});

	const classList = () => {
		const isOpen = props.open;
		return {
			"suggest"        : true,
			"suggest-open"   : isOpen,
			"suggest-closed" : !isOpen
		}
	}

	const handleHover = (idx: number) => (evt: MouseEvent) => {
		props.onItemHover(idx, evt);
	}

	const handleClick = (idx: number) => (evt: MouseEvent) => {
		props.onItemClick(idx, evt);
	}

	return (<div
		classList={classList()}
		style={{ top: `${props.pos.top}px`, left: `${props.pos.left}px` }}
	>
		<Show
			when={props.data.length > 0}
			fallback={
				<div class="suggest-group">
					<div class="suggest-group-label">No Results</div>
				</div>}
		>
			<For each={props.data}>
				{(group, idxGrp) => {
					return (
					<div class="suggest-group">
						<div class="suggest-group-label">{group.label}</div>
						<div class="suggest-group-list">
							<For each={group.items}>
							{(item, idxItem) => {
								// compute idx in flattened group hierarchy
								const itemIdx = () => { return groupIdxMap()[idxGrp()] + idxItem() };
								const classList = () => {
									return {
										"suggest-item" : true,
										"selected"     : props.selectedIdx === itemIdx()
									}
								}

								return (
									<div
										classList={classList()} data-idx={itemIdx()}
										onMouseMove={handleHover(itemIdx())}
										onClick={handleClick(itemIdx())}
									>
										<Switch>
											<Match when={item.kind === "simple"}>
												{ (item as SuggestItemSimple).text }
											</Match>
											<Match when={item.kind === "fancy"}>
												{renderFancyLabel(item as SuggestItemFancy)}
											</Match>
										</Switch>
									</div>
								);
							}}
							</For>
						</div>
					</div>
				)}}
			</For>
		</Show>
	</div>);
}
