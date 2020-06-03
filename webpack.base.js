// adapted from the Notable source
// (https://github.com/notable/notable/blob/54646c1fb64fbcf3cc0857a2791cfb6a6ae48313/webpack.base.js)

const TSConfigPathsPlugin = require("tsconfig-paths-webpack-plugin");
const path = require("path");
const webpack = require("webpack");

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

function base(options){
	return {
		resolve: { plugins: [ new TSConfigPathsPlugin() ] },
		target: options.target,
		plugins: [
			new webpack.DefinePlugin ({
				'Environment.isDevelopment': JSON.stringify ( process.env.NODE_ENV !== 'production' )
			}),
			PluginSkeletonOptimization
		]
	}
}

module.exports = base;