import { resolve } from "path";
import { defineConfig } from "vite";
import vitePluginDts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    vitePluginDts({ insertTypesEntry: true })
  ],
  resolve: {
    alias: {
      "@common" : "src/common",
    }
  },
  build: {
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'NoteworthyEditor',
      // the proper extensions will be added
      fileName: 'noteworthy-editor',
    },
    // rollupOptions: {
    //   // make sure to externalize deps that shouldn't be bundled
    //   // into your library
    //   external: ['vue'],
    //   output: {
    //     // Provide global variables to use in the UMD build
    //     // for externalized deps
    //     globals: {
    //       vue: 'Vue',
    //     },
    //   },
    // },
  }
})