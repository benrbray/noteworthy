const base = require("./webpack.base");
const config = base({ target: "electron-main" });
module.exports = config;