const base = require("./webpack.base");
const path = require("path");

const PACKAGE_JSON = require("./package.json");
let IS_PRODUCTION = (process.env.NODE_ENV !== "development");

////////////////////////////////////////////////////////////////////////////////

const config = base({
	target: "electron-main",
	// The point or points to start the bundling process.
	// (if an array is passed, all items will be processed)
	entry : {
		main: "./src/main/index.ts"
	},
	output: {
		filename: '[name].js',
		chunkFilename: '[name].bundle.js',
		libraryTarget: 'commonjs2',
		path: path.resolve(__dirname, "dist/main")
	},
	// Choose a style of source mapping to enhance the debugging process.
	devtool : "source-map",
	// Options for changing how modules are resolved.
	resolve: { 
		// aliases to import more easily from common folders
		alias: { "@" : path.resolve(__dirname, "src/main") },
		// attempt to resolve file extensions in this order
		// (allows leaving off the extension when importing)
		extensions: [".js", ".ts", ".tsx", ".json", ".node"],
	},
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
			},
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
});

console.log("//// MAIN CONFIG ///////////////////////////////////////////////");

console.log(config());

console.log("////////////////////////////////////////////////////////////////");

module.exports = config;