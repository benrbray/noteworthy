const base = require("./webpack.base");
const config = base({target: "electron-renderer"});
module.exports = config;