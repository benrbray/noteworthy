// adapted from the Notable source
// (https://github.com/notable/notable/blob/54646c1fb64fbcf3cc0857a2791cfb6a6ae48313/webpack.base.js)

const TSConfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const path = require("path");
const webpack = require("webpack");
const { merge } = require("webpack-merge");

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

////////////////////////////////////////////////////////////////////////////////

function base(options){
	// modify default config with a config function
	// (https://webpack.electron.build/modifying-webpack-configurations#using-a-config-function)
	let IS_PRODUCTION = (process.env.NODE_ENV !== "development");
	//let isRenderer = (options.target == "electron-renderer");
	return (env) => {
		// merge incoming config with a few extra options
		let result = merge({
			mode: IS_PRODUCTION ? "production" : "development",
			// Absolute path for resolving entry points and loaders from configuration. 
			// By default, webpack uses the current directory, but it is recommended to 
			// manually provide a value.
			context : path.resolve(__dirname),
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
				PluginSkeletonOptimization
			],
			// Determine how the different types of modules within a project will be treated.
			module: {
				// An array of rules which are matched to requests when modules 
				// are created, which can odify how modules are created, apply
				// loaders to the module, or modify the parser.
				rules: [
					{
						test: /\.node$/,
						use: "node-loader"
					},
					{
						test: /\.ts$/,
						exclude: /(node_modules)/,
						use: [{
							"loader": "ts-loader",
							"options": {
								"transpileOnly": false,
								"configFile": path.resolve(__dirname, "tsconfig.json")
							}
						}]
					},
				]
			},
			/* TODO (2021/3/1) disable source-map in production mode */
			devtool: "source-map"
		}, options);

		return result;
	}
}

module.exports = base;