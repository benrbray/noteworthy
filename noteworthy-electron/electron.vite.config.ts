import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@common"     : resolve("src/common"),
        "@extensions" : resolve("src/extensions"),
        '@main'       : resolve('src/main'),
        '@renderer'   : resolve('src/renderer/src'),
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
      }
    },
    plugins: [solid()]
  }
})
