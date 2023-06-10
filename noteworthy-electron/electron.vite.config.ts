import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import solid from 'vite-plugin-solid'

// list ESM-only package names here
const esmOnlyPackages = [
  "unified",
	"mdast-util-to-markdown",
	"mdast-util-to-string"
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: esmOnlyPackages })],
    resolve: {
      alias: {
        "@common"     : resolve("src/common"),
        "@extensions" : resolve("src/extensions"),
        '@main'       : resolve('src/main'),
        '@renderer'   : resolve('src/renderer/src'),
        '@resources'   : resolve('resources'),
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@common"     : resolve("src/common")
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        "@common"     : resolve("src/common"),
        "@extensions" : resolve("src/extensions"),
        '@main'       : resolve('src/main'),
        '@preload'    : resolve('src/preload'),
        '@renderer'   : resolve('src/renderer/src'),
        '@resources'   : resolve('resources'),
      }
    },
    plugins: [solid()],
		build: { rollupOptions: { output: {
      manualChunks(id: string) {
        for(const pkgName of esmOnlyPackages) {
          if(id.includes(pkgName)) { return pkgName; }
        }
				return;
    }}}}
  }
})
