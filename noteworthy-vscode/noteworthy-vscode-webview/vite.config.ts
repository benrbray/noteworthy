import { defineConfig } from 'vite'
import { resolve } from 'path'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [solid()],
  build: {
    outDir: "dist",
    lib: {
      entry: resolve(__dirname, "lib/main.tsx"),
      name: "noteworthy-vscode-webview",
      fileName: "noteworthy-vscode-webview"
    }
  }
})
