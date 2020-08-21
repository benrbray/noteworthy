// adapted from the Notable source
// (https://github.com/notable/notable/blob/54646c1fb64fbcf3cc0857a2791cfb6a6ae48313/webpack.base.js)

const TSConfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require("path");
const webpack = require("webpack");
const merge = require("webpack-merge");

////////////////////////////////////////////////////////////

// (7/16/20) webpack+babel https://stackoverflow.com/a/52323181/1444650
// (7/16/20) babel-preset-solid https://github.com/ryansolid/solid
// (7/16/20) solidjs+ts advice:  https://gitter.im/solidjs-community/community?at=5d92f910d97d8e3549e2b7ef

/** @todo (7/16/20) set development mode to FALSE before publishing */
const IS_DEVELOP = true;

////////////////////////////////////////////////////////////

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

////////////////////////////////////////////////////////////

function base(options){
	// modify default config with a config function
	// (https://webpack.electron.build/modifying-webpack-configurations#using-a-config-function)
	return (config) => {
		// merge incoming config with a few extra options
		let result = merge(config, ({
			resolve: { plugins: [ new TSConfigPathsPlugin() ] },
			target: options.target,
			plugins: [
				new webpack.DefinePlugin ({
					'Environment.isDevelopment': JSON.stringify ( process.env.NODE_ENV !== 'production' )
				}),
				new CopyWebpackPlugin({
					patterns: [
						{ from: 'static' }
					]
				}),
				PluginSkeletonOptimization
			],
			devtool: "source-map"
		}));

		// default electron-webpack rule matches both .ts and .tsx
		const tsxIndex = result.module.rules.findIndex(rule =>
			rule.test.toString().match(/tsx/)
		);

		// modify rule to match only .ts files
		const tsxRule = result.module.rules[tsxIndex];
		tsxRule.test = /\.ts$/;

		// create separate rule for tsx files
		/** @todo (7/17/20) does this merge have any unintended consequences? */
		result = merge(result, { module : { rules : [
			{
				test: /\.tsx$/,
				exclude: [/node_modules/],
				use: {
					loader: "babel-loader",
						options: merge(tsxRule.options, {
						babelrc: false,
						presets: [
							[ '@babel/preset-env', { 
								"targets": { "electron": "9.0.2", }
							} ],
							'solid',
							'@babel/preset-typescript'
						],
						plugins: ["@babel/plugin-proposal-optional-chaining"],
						cacheDirectory: true,
						cacheCompression: !IS_DEVELOP,
						compact: !IS_DEVELOP,
					}),
				}
			}
		]}});
		
		return result;
	}
}

module.exports = base;