const base = require("./webpack.base");
const path = require("path");

const CopyWebpackPlugin = require('copy-webpack-plugin');

////////////////////////////////////////////////////////////////////////////////

const PACKAGE_JSON = require("./package.json");
let IS_PRODUCTION = (process.env.NODE_ENV !== "development");

////////////////////////////////////////////////////////////////////////////////


// TODO: (2021/3/01) this was blindly copied from electron-webpack, but I should make an effort to replace+simplify it later
// https://github.com/electron-userland/electron-webpack/blob/8a9d2892ecedd8f0d8158f3175116f34efdf94ed/packages/electron-webpack/src/main.ts#L278
function computeExternals(isRenderer /*bool*/) {
	// (ben @ 2021/03/05) electron-webpack code was written with consideration for other build targets,
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

const config = base({
	target: "electron-main",
	// The point or points to start the bundling process.
	// (if an array is passed, all items will be processed)
	entry : {
		main: "./src/main/index.ts"
	},
	output: {
		chunkFilename: '[name].bundle.js',
		libraryTarget: 'commonjs2',
		path: path.resolve(__dirname, "dist/main")
	},
	// Provides a way of excluding dependencies from the output bundles. Instead
	// the bundle expects to find that dependency in the consumer's environment.
	externals: computeExternals(false),
	// Options for changing how modules are resolved.
	resolve: { 
		// aliases to import more easily from common folders
		alias: { "@" : path.resolve(__dirname, "src/main") },
		// attempt to resolve file extensions in this order
		// (allows leaving off the extension when importing)
		extensions: [".js", ".ts", ".tsx", ".json", ".node"],
	},
	plugins : [
		new CopyWebpackPlugin({
			patterns: [ { from: 'static' } ]
		}),
	],
	// Determine how the different types of modules within a project will be treated.
	module: {
		// An array of rules which are matched to requests when modules 
		// are created, which can odify how modules are created, apply
		// loaders to the module, or modify the parser.
		rules: [
			{
				// config for setting up babel-loader, adapted from electron-webpack
				// https://github.com/electron-userland/electron-webpack/blob/8a9d2892ecedd8f0d8158f3175116f34efdf94ed/packages/electron-webpack/src/configurators/js.ts#L4
				// electron-webpack claims that it's better to use require instead of just preset name to avoid babel resolving 
				test: /\.js$/,
        		exclude: /(node_modules)/,
				use: {
					loader: "babel-loader",
					options: {
						presets : [
							[ require("@babel/preset-env").default, 
								{
									modules: false,
									targets: { node: "14.16.0" } // TODO: update node version here
								}
							],
							require("@babel/preset-typescript").default,
							require("babel-preset-solid"),
						],
						plugins : [
							require("@babel/plugin-syntax-dynamic-import").default,
							require("@babel/plugin-proposal-optional-chaining").default,
						]
					}
				}
			}
		]
	},
});

module.exports = config;