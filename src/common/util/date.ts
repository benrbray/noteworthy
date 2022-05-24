import { parse as parseCslDate, format as formatCslDate, DateCsl, DateCslInvalid, DateCslValid } from "@citation-js/date";

export interface DateParts {
	year:   number,
	month?: number|undefined,
	day?:   number|undefined
}

function isRawDate(date: DateCsl): date is DateCslInvalid {
	return "raw" in date;
}

function isDateParts(date: DateCsl): date is DateCslValid {
	return "date-parts" in date;
}


export function parseDate(date: string): DateParts | null {
	const dateCsl: any = parseCslDate(date);
	
	if(isDateParts(dateCsl)) {
		const [year,month,day] = dateCsl["date-parts"][0];
		return { year, month, day };
	} else {
		// do not attempt to fix invalid dates
		// TODO (2022/03/07) accept a wider range of date formats
		return null;
	}
}

export function formatDate(date: DateParts): string {
	const { year, month, day } = date;

	let dateParts: [number]|[number,number]|[number,number,number];
	if(month === undefined)    { dateParts = [year];        }
	else if(day === undefined) { dateParts = [year, month]; }
	else                       { dateParts = [year];        } 
	
	return formatCslDate({ "date-parts" : [dateParts] });
}