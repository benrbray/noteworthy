import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import solid from 'vite-plugin-solid'

////////////////////////////////////////////////////////////////////////////////

import type { PluginOption } from 'vite';

// https://github.com/vitejs/vite/issues/8619#issuecomment-1654973621
export function watchNodeModules(modules: string[]): PluginOption {
  return {
    name: 'watch-node-modules',
    config() {
      return {
        server: {
          watch: {
            ignored: modules.map((m) => `!**/node_modules/${m}/**`),
          },
        },
        optimizeDeps: {
          exclude: modules,
        },
      };
    },
  };
}

////////////////////////////////////////////////////////////////////////////////

// configuration for electron-vite
// https://electron-vite.org/config/
export default defineConfig({
  main: {
    plugins: [
			externalizeDepsPlugin(),
			watchNodeModules([
				"noteworthy-editor"
			])
		],
		build: {
			lib: {
				// compile main as an es module (*.mjs)
				entry: "src/main/index.ts",
				formats: ["es"]
			}
		},
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
    plugins: [solid()]
  }
})
