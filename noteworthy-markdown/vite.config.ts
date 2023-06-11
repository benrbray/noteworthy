import { resolve } from "path";
import { defineConfig } from "vite";
import vitePluginDts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    vitePluginDts({ insertTypesEntry: true })
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'NoteworthyMarkdown',
      fileName: 'noteworthy-markdown',
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