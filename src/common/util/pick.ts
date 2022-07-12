/**
 * Return a new object with only the specified keys (non-inclusive, meaning
 * that non-existent keys will not be present in the returned object).
 * @see https://stackoverflow.com/a/56592365
 */
export function pick<T, K extends keyof T>(obj: T, keys: K[]) {
	return Object.fromEntries(
		keys
		.filter(key => key in obj) // remove this line to make inclusive
		.map(key => [key, obj[key]])
	)
};