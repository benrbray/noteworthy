/* ENVIRONMENT */

const Environment = {
	//TODO (2021/03/05) re-enable development mode
	//TODO (2021/03/05) how should these be defined when `process` is not available from the sandboxed renderer?
	// see also https://stackoverflow.com/questions/41359504/webpack-bundle-js-uncaught-referenceerror-process-is-not-defined
	//
	// environment: process.env.NODE_ENV,
	isDevelopment: false// (process.env.NODE_ENV == 'development'),
	// wds: { // Webpack Development Server
	// 	protocol: 'http',
	// 	hostname: 'localhost',
	// 	port: process.env.ELECTRON_WEBPACK_WDS_PORT
	// }
};

/* EXPORT */

export default Environment;