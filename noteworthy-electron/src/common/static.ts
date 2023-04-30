import path from 'path'
import * as url from 'url'

// TODO (2021/03/05) re-enable development
const isDevelopment = false; //(process.env.NODE_ENV === 'development');

declare const __static:string;

// it is an ERROR to call this from the main process, as window is not defined
// see https://github.com/electron-userland/electron-webpack/issues/241#issuecomment-582920906
export function getStatic(relativePath:string = "") {
	if (isDevelopment) {
		return url.resolve(window.location.origin, relativePath)
	}
	return path.resolve(__static, relativePath)
}