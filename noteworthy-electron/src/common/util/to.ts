/**
 * async await wrapper for easy error handling like so:
 * 
 *   let [err,result] = await to(otherAsyncFunction());
 *   if(err){ handle error }
 * 
 * @see https://github.com/scopsy/await-to-js
 * @see https://stackoverflow.com/a/53689892/1444650
 * @param promise
 * @param errorExt Additional Information you can pass to the err object
 */
export async function to<U = Error, T = any>(
	promise: Promise<T>,
): Promise<[U,undefined]|[null, T]> {
	return promise
		.then<[null, T]>((data: T) => [null, data])
		.catch<[U, undefined]>((err: U) => {
			// attach extra error information
			return [err, undefined];
		});
}