const base = require("./webpack.base");
const path = require("path");
const fsExtra = require("fs-extra");

// Extracts CSS into separate files, creating one CSS file for each JS file that
// contains CSS. Supports On-Demand-Loading of CSS and SourceMaps.
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
// simplifies creation of HTML files to serve webpack bundles
const HtmlWebpackPlugin = require('html-webpack-plugin')

////////////////////////////////////////////////////////////////////////////////

const PACKAGE_JSON = require("./package.json");
let IS_PRODUCTION = (process.env.NODE_ENV !== "development");

// path to node_modules
const nodeModulePath = IS_PRODUCTION ? null : path.resolve(require.resolve("electron"), "..", "..")

// define css loaders
// see (https://github.com/electron-userland/electron-webpack/blob/a6ecb394336fa710f13f90106f6943e5330ab562/packages/electron-webpack/src/targets/RendererTarget.ts)
// TODO: (2021/3/1) are we missing extra config for this plugin?  https://github.com/electron-userland/electron-webpack/blob/a6ecb394336fa710f13f90106f6943e5330ab562/packages/electron-webpack/src/targets/RendererTarget.ts#L99
let cssLoaders = [MiniCssExtractPlugin.loader, "css-loader"];
if(!IS_PRODUCTION){ 
	cssLoaders = ["css-hot-loader"].concat(cssLoaders);
}

//// BABEL /////////////////////////////////////////////////////////////////////

// config for setting up babel-loader, adapted from electron-webpack
// https://github.com/electron-userland/electron-webpack/blob/8a9d2892ecedd8f0d8158f3175116f34efdf94ed/packages/electron-webpack/src/configurators/js.ts#L4


// https://github.com/electron-userland/electron-webpack/blob/8a9d2892ecedd8f0d8158f3175116f34efdf94ed/packages/electron-webpack/src/configurators/js.ts#L5
// better to use require instead of just preset name to avoid babel resolving 
// (in our test we set custom resolver - and only in case of explicit required it works)

const babelPresets = [
	[ require("@babel/preset-env").default, 
	  	{
			modules: false,
			// TODO: update node version here
			targets: { node: "14.16.0" }
		}
	],
	require("@babel/preset-typescript").default,
	require("babel-preset-solid"),
];

const babelPlugins = [
	require("@babel/plugin-syntax-dynamic-import").default,
	require("@babel/plugin-proposal-optional-chaining").default,
];

//// ELECTRON INDEX HTML ///////////////////////////////////////////////////////

// TODO: (2021/3/1) this function was copied from electron-webpack, and it should
// be removed/simplified to prevent a maintenance nightmare later
// https://github.com/electron-userland/electron-webpack/blob/a6ecb394336fa710f13f90106f6943e5330ab562/packages/electron-webpack/src/targets/RendererTarget.ts#L192
function generateIndexFile(nodeModulePath /* string|null */, template /* string */) {
	// // do not use add-asset-html-webpack-plugin - no need to copy vendor files to output (in dev mode will be served directly, in production copied)
	// const assets = []; // await getDllAssets(path.join(configurator.commonDistDirectory, "renderer-dll"), configurator);
	// const scripts /*Array<string>*/ = [];
	// const css /*Array<string>*/ = [];

	// for (const asset of assets) {
	// 	if (asset.endsWith(".js")) {
	// 		scripts.push(`<script type="text/javascript" src="${asset}"></script>`)
	// 	}
	// 	else {
	// 		css.push(`<link rel="stylesheet" href="${asset}">`)
	// 	}
	// }

	let html = template;
	const title = "Noteworthy";
	if (title) { html = html.replace("</head>", `<title>${title}</title></head>`); }

	if (nodeModulePath) { html = html.replace("</head>", `<script>require('module').globalPaths.push("${nodeModulePath.replace(/\\/g, "/")}")</script></head>`) }

	//html = html.replace("</head>", '<script>require("source-map-support/source-map-support.js").install()</script></head>')

	//if (scripts.length) { html = html.replace("</head>", `${scripts.join("")}</head>`); }
	//if (css.length)     { html = html.replace("</head>", `${css.join("")}</head>`);     }

	const filePath = path.join("./dist", ".renderer-index-template.html");
	fsExtra.outputFileSync(filePath, html);
	return `!!html-loader!${filePath}`
}

let template = fsExtra.readFileSync(PACKAGE_JSON.electronWebpack.renderer.template, {encoding: "utf8"});

////////////////////////////////////////////////////////////////////////////////

const config = base({
	target: "web",
	// Absolute path for resolving entry points and loaders from configuration. 
	// By default, webpack uses the current directory, but it is recommended to 
	// manually provide a value.
	context : path.resolve(__dirname),
	// The point or points to start the bundling process.
	// (if an array is passed, all items will be processed)
	entry : {
		renderer: "./src/renderer/index.ts",
	},
	output: {
		chunkFilename: '[name].bundle.js',
		path: path.resolve(__dirname, "dist/renderer")
	},
	// Options for changing how modules are resolved.
	resolve: { 
		// aliases to import more easily from common folders
		alias: { "@" : path.resolve(__dirname, "src/renderer") },
		// attempt to resolve file extensions in this order
		// (allows leaving off the extension when importing)
		extensions: [".js", ".ts", ".tsx", ".json", ".css", ".node"],
	},
	plugins: [
		new MiniCssExtractPlugin(),
		//
		// https://github.com/electron-userland/electron-webpack/blob/a6ecb394336fa710f13f90106f6943e5330ab562/packages/electron-webpack/src/targets/RendererTarget.ts#L124
		new HtmlWebpackPlugin({
			filename: "index.html",
			template: generateIndexFile(nodeModulePath, template),
			minify: false,
			nodeModules: nodeModulePath
		})
		//
		// TODO activate this in production mode https://github.com/electron-userland/electron-webpack/blob/ebbf9150b1549fbe7b5e97e9a972e547108eba50/packages/electron-webpack/src/targets/BaseTarget.ts#L74
		//new LoaderOptionsPlugin({minimize: true})
		// TODO remove old assets in prod 
		// new WebpackRemoveOldAssetsPlugin(dllManifest)
		//
		// TODO add in prod? https://github.com/electron-userland/electron-webpack/blob/8a9d2892ecedd8f0d8158f3175116f34efdf94ed/packages/electron-webpack/src/targets/MainTarget.ts#L36 
		// do not add for main dev (to avoid adding to hot update chunks), our main-hmr install it
		// new BannerPlugin({
		// 	banner: 'require("source-map-support/source-map-support.js").install();',
		// 	test: /\.js$/,
		// 	raw: true,
		// 	entryOnly: true,
		// }))
	],
	// Determine how the different types of modules within a project will be treated.
	module: {
		// An array of rules which are matched to requests when modules 
		// are created, which can odify how modules are created, apply
		// loaders to the module, or modify the parser.
		rules: [
			{
				// https://github.com/eemeli/yaml/issues/228#issuecomment-785772112
				test: /node_modules\/yaml\/browser\/index\.js$/,
				use: {
					loader: 'babel-loader',
					options: {
						plugins: ['@babel/plugin-proposal-export-namespace-from']
					}
				}
			},
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
				test: /\.css$/i,
				use: cssLoaders
			},
			{
				test: /\.(html)$/,
				use: { "loader": "html-loader" }
			},
			{
				test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
				use: {
					loader: "url-loader",
					options: {
						limit: 10 * 1024,
						name: `fonts/[name]--[folder].[ext]`
					}
				}
			},
			// using SolidJS requires custom babel plugin
			{
				test: /\.tsx$/,
				exclude: [/node_modules/],
				use: {
					loader: "babel-loader",
					options: {
						babelrc: false,
						presets: [
							[ '@babel/preset-env', { 
								// TODO: update electron version here
								"targets": { "electron": "12.0.0", }
							} ],
							'solid',
							'@babel/preset-typescript'
						],
						plugins: ["@babel/plugin-proposal-optional-chaining"],
						cacheDirectory: true,
						cacheCompression: IS_PRODUCTION,
						compact: IS_PRODUCTION,
					},
				}
			},
		]
	}
});

module.exports = config;