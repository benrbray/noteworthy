import { For } from "solid-js";

interface ICalendarProps {
	year: number;
	month: number;
}

const WEEKDAYS = ["Su", "M","Tu","W","Th","F","Sa"];
const MONTHS = [
	"January", "February", "March", "April",
	"May", "June", "July", "August", 
	"September", "October", "November", "December"
];

export const Calendar = (props:ICalendarProps) => {
	// get current weekday and last day of prev/current month
	let prev:number = new Date(props.year, props.month, 0).getDate();
	let last:number = new Date(props.year, props.month+1, 0).getDate();
	let today:Date  = new Date(props.year, props.month, 1);
	// create calendar table
	return (<div class="calendar">
		<div class="header">
			<span class="btn prev" />
			<span class="title">{MONTHS[today.getMonth()]} {today.getFullYear()}</span>
			<span class="btn next" />
		</div>
		<table class="calendar">
			{/* Header Row */}
			<thead><tr>
				<For each={WEEKDAYS}>{day => 
					(<th>{day}</th>)
				}</For>
			</tr></thead>
			{/* Calendar Rows */}
			<For each={[0,1,2,3,4,5]}>{rowIdx => (<tr>
				<For each={[0,1,2,3,4,5,6]}>{colIdx => {
					let idx = rowIdx*7 + colIdx;
					let order:number = 0;
					// determine date label
					let num:number = 1 + idx - today.getDay();
					if(num < 1)         { order = -1; num = prev - 1 - num; }
					else if(num > last) { order =  1; num = num - last; }
					// element
					if(order == 0){ return (<td>{num}</td>);           }
					else          { return (<td class="g">{num}</td>); }
				}}</For>
			</tr>)}</For>
		</table>
	</div>)
}

export const CalendarTab = () => {
	let today = new Date(Date.now());
	return (<div id="tab_calendar"><Calendar month={today.getMonth()} year={today.getFullYear()}/></div>)
}