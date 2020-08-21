export function filterNonVoid<T>(array:(T|null|undefined)[]): T[] {
	return array.filter(isNonVoid);
}

export function isNonVoid<T>(value : T | null | undefined): value is T {
	return value !== null && value !== undefined;
} 