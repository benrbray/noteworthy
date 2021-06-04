const base = require("./webpack.base.js");
const path = require("path");

module.exports = base({
	target: "electron-preload",
	entry: {
		preload: "./src/renderer/preload.ts",
	},
	externals: {
		electron: "commonjs2 electron"
	},
	output: {
		filename: '[name].js',
		path: path.resolve(__dirname, "dist/preload")
	},
	// Options for changing how modules are resolved.
	resolve: { 
		// aliases to import more easily from common folders
		// attempt to resolve file extensions in this order
		// (allows leaving off the extension when importing)
		extensions: [".js", ".ts", ".json", ".node"],
	},
	module: {
		// An array of rules which are matched to requests when modules 
		// are created, which can odify how modules are created, apply
		// loaders to the module, or modify the parser.
		rules: [
			{
				test: /\.js$/,
				exclude: /(node_modules)/,
				use: {
					loader: "babel-loader",
					options: {
						presets : [
							[ require("@babel/preset-env").default, 
								{
									modules: false,
									targets: { electron: "12.0.0" }
								}
							],
							require("@babel/preset-typescript").default,
						],
						plugins : [
							require("@babel/plugin-syntax-dynamic-import").default,
							require("@babel/plugin-proposal-optional-chaining").default,
							require("@babel/plugin-transform-modules-commonjs").default
						]
					}
				}
			}
		]
	}
});