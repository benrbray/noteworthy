export {}

declare global {
	/* use var, not let or const, see https://stackoverflow.com/a/69429093 */
	var isQuitting: boolean;
}