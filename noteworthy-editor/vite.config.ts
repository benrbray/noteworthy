import { defineConfig } from 'vite';
import { resolve } from 'path';
import solid from 'vite-plugin-solid';
import tsConfigPaths from 'vite-tsconfig-paths';
import dts from 'vite-plugin-dts';
import pkg from "./package.json";

export default defineConfig({
  plugins: [
    solid(),
		tsConfigPaths(),
		dts({
			rollupTypes: true,
			tsconfigPath: "./tsconfig.json"
		}),
  ],
  build: {
    lib: {
			formats: ["es"],
      entry: resolve(__dirname, 'lib/main.ts'),
    },
		rollupOptions: {
			external: [
				...Object.keys(pkg.peerDependencies || {}),
			]
		},
  }
})
