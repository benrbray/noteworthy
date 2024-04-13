clean:
	rm -rf node_modules
	rm -rf noteworthy-electron/node_modules
	rm -rf noteworthy-web/node_modules

	cd noteworthy-electron && pnpm run clean
	cd noteworthy-electron && pnpm run clean

clean-install: clean
	pnpm install

dev:
	cd noteworthy-electron && pnpm run dev