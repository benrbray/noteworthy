// adapted from the Notable source
// (https://github.com/notable/notable/blob/54646c1fb64fbcf3cc0857a2791cfb6a6ae48313/webpack.base.js)

const TSConfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require("path");
const webpack = require("webpack");
const merge = require("webpack-merge");

const PACKAGE_JSON = require("./package.json");

////////////////////////////////////////////////////////////

// (7/16/20) webpack+babel https://stackoverflow.com/a/52323181/1444650
// (7/16/20) babel-preset-solid https://github.com/ryansolid/solid
// (7/16/20) solidjs+ts advice:  https://gitter.im/solidjs-community/community?at=5d92f910d97d8e3549e2b7ef

////////////////////////////////////////////////////////////

// TODO: this was copied from the Notable config, what does it do and should it be kept?
function PluginSkeletonOptimization ( compiler ) { // Loading heavy resources after the skeleton
  compiler.plugin ( 'compilation', compilation => {
    compilation.hooks.htmlWebpackPluginAfterHtmlProcessing = {
      async promise ( data ) {
        data.html = data.html.replace ( /<link(.*?)rel="stylesheet">(.*?)<body>(.*?)<script/, '$2<body>$3<link$1rel="stylesheet"><script' ); // Moving the main CSS to the bottom in order to make the skeleton load faster
        return data;
      }
    };
  });
}

// TODO: (2021/3/21) this was blindly copied from electron-webpack, but I should make an effort to replace+simplify it later
// https://github.com/electron-userland/electron-webpack/blob/8a9d2892ecedd8f0d8158f3175116f34efdf94ed/packages/electron-webpack/src/main.ts#L278
function computeExternals(isRenderer /*bool*/) {
	// electron-webpack code was written with consideration for other build targets,
	// but for our purposes, if we're not the renderer we MUST be the main process
	let isMain = !isRenderer;

	// whitelisted modules
	const manualWhiteList = PACKAGE_JSON.electronWebpack.whiteListedModules;
	const whiteListedModules = new Set(manualWhiteList || [])

	if (isRenderer) {
		whiteListedModules.add("react")
		whiteListedModules.add("react-dom")
	}

	const filter = (name) => !name.startsWith("@types/") && (whiteListedModules == null || !whiteListedModules.has(name))
	const externals = Object.keys(PACKAGE_JSON.dependencies).filter(filter)
	externals.push("electron")
	externals.push("webpack")
	// because electron-devtools-installer specified in the devDependencies, but required in the index.dev
	externals.push("electron-devtools-installer")
	if (isMain) {
		externals.push("webpack/hot/log-apply-result")
		externals.push("electron-webpack/out/electron-main-hmr/HmrClient")
		externals.push("source-map-support/source-map-support.js")
	}

	// if (this.electronWebpackConfiguration.externals != null) {
	// 	return externals.concat(this.electronWebpackConfiguration.externals)
	// }

	return externals;
}

////////////////////////////////////////////////////////////////////////////////

function base(options){
	// modify default config with a config function
	// (https://webpack.electron.build/modifying-webpack-configurations#using-a-config-function)
	let IS_PRODUCTION = (process.env.NODE_ENV !== "development");
	let isRenderer = (options.target == "electron-renderer");
	let DIRNAME = path.resolve(__dirname);
	return (env) => {
		// merge incoming config with a few extra options
		let result = merge(options, {
			mode: IS_PRODUCTION ? "production" : "development",
			// Absolute path for resolving entry points and loaders from configuration. 
			// By default, webpack uses the current directory, but it is recommended to 
			// manually provide a value.
			context : path.resolve(__dirname),
			externals: computeExternals(isRenderer),
			// Dependencies to exclude from the output bundles.  Instead, the created 
			// bundle relies on that dependency to be present in the consumer's environment.
			// This feature is typically most useful to library developers.
			// exclude : [],
			// Configure whether to polyfill or mock certain Node.js globals.
			node : {
				"__dirname" : false,  // use standard __dirname behavior
				"__filename" : false  // use standard __filename behavior
			},
			// Options for changing how modules are resolved.
			resolve: { 
				// webpack plugins which set additional resolve configuration
				plugins: [
					// automatically creates aliases for `compilerOptions.paths` entry in tsconfig.json
					// (warning:  as of 2021/3/1, does not work with implicit `baseUrl` introduced by TypeScript 4.1)
					new TSConfigPathsPlugin()
				],
				// aliases to import more easily from common folders
				alias: {
					"common" : path.resolve(__dirname, "src/common/")
				}	
			},
			//
			plugins: [
				// make `Environment.isDevelopment` available as global variable
				new webpack.DefinePlugin ({
					'Environment.isDevelopment': JSON.stringify ( IS_PRODUCTION )
				}),
				// make static directory path available as global variable
				// TODO differences in __static path for production vs development?
				// https://github.com/electron-userland/electron-webpack/blob/ebbf9150b1549fbe7b5e97e9a972e547108eba50/packages/electron-webpack/src/targets/BaseTarget.ts#L121
				new webpack.DefinePlugin({
					__static: `"${path.join(__dirname, "static").replace(/\\/g, "\\\\")}"`,
					"process.env.NODE_ENV": IS_PRODUCTION ? "\"production\"" : "\"development\""
				}),
				new CopyWebpackPlugin({
					patterns: [ { from: 'static' } ]
				}),
				PluginSkeletonOptimization
			],

			/* TODO (2021/3/1) disable source-map in production mode */
			devtool: "source-map"
		});

		return result;
	}
}

module.exports = base;