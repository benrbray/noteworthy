import chokidar, { FSWatcher } from "chokidar";
import { EventEmitter } from "events";
import { FsalEvents, ChokidarEvents } from "@common/events";

////////////////////////////////////////////////////////////

export default class FSALWatchdog extends EventEmitter {

	private _process:FSWatcher|null; // chokidar process
	private _isBooting:boolean;
	private _paths:Set<string>
	private _ignoreDotfiles:boolean;

	constructor(ignoreDotfiles:boolean=true){
		super();

		this._ignoreDotfiles = ignoreDotfiles;

		this._process = null;
		this._paths = new Set<string>();
		this._isBooting = false;
	}

	/**
	 * @param p initial path to watch
	 */
	async init(p?:string){
		console.log("fsal-watcher :: init() :: path=", p);

		// don't boot up twice, and only boot if there's at least one path
		if(this._paths.size < 1 || this.isBooting()){ return; }
		this._isBooting = true;

		/** @todo (9/13/20)
		 * Had to disable .dotfile ignore because user config 
		 * folder is ~/.config/noteworth on some systems.
		 * 
		 * Real solution requires multiple chokidar instances:
		 *    > global instance for ad hoc file watching
		 *    > per-workspace instance, 
		 *
		 * FSAL should also have an option to emit events ONLY
		 * when a listener-specified folder has changed.
		 *
		 * E.g. the ThemeService should only receive events
		 * when the theme folder has changed!  Right now it receives
		 * all chokidar events.
		 */

		// chokidar's ignored-setting is compatible to anymatch, so we can
		// pass an array containing the standard dotted directory-indicators,
		// directories that should be ignored and a function that returns true
		// for all files that are _not_ in the filetypes list (whitelisting)
		// Further reading: https://github.com/micromatch/anymatch
		let ignoreDirs: (RegExp|string)[] = this._ignoreDotfiles?[
			///(^|[/\\])\../,
			'**/.noteworthy/**',
			'**/.git/**',
			'**/.vscode/**'
		]:[];
		
		this._process = chokidar.watch( (p?p:[]), {
			ignored: ignoreDirs,
			persistent: true,
			ignoreInitial: true
		});

		// attach events only after chokidar's initial scan is complete
		this._process.on(ChokidarEvents.READY, (event: string, path: string) => {
			if(!this._process){
				console.error("chokidar :: ready :: unknown startup error"); 
				return;
			}
			// check for paths that may have been added while starting up
			console.log("chokidar :: ready");
			let alreadyWatched = Object.keys(this._process.getWatched());
			for(let p of this._paths){
				if(!alreadyWatched.includes(p)){
					this._process.add(p);
				}
			}
			// finished booting
			this._isBooting = false;
		});

		// chokidar events
		this._process.on(ChokidarEvents.ALL, (event:string,path:string) => {
			this.emit(FsalEvents.CHOKIDAR_EVENT, event, { path });
		});
	}

	destroy(){
		if(this._process){
			this._process.removeAllListeners();
			this._process.close();
			this._process = null;
		}

		this._paths.clear();
		this._isBooting = false;
	}

	isBooting(){ return this._isBooting; };

	ignoreOnce(){ }

	// == Watched Paths ================================= //

	/** 
	 * Adds a path to the currently watched paths.
	 * @returns self (for chainability)
	 */
	watch(p:string){
		console.log("fsal-watcher :: watch ::", p);
		// ignore duplicate paths
		if (this._paths.has(p)) { console.log("\tpath already watched");return this; }
		// add the path
		this._paths.add(p);
		// if fsal is booting up, _paths will be watched when chokidar is ready
		if (this.isBooting()) { console.log("\twatcher booting"); return this; }
		// start the watchdog if needed
		if (!this._process) { console.log("\tinitializing watcher");this.init(p);          }
		else                { this._process.add(p); }
		// chainable
		return this;
	}

	/**
	 * Removes a patch from the watchdog process.
	 * @param p The path to unwatch.
	 * @returns self (for chainability)
	 */
	unwatch(p:string){
		console.log("fsal-watcher :: unwatch ::", p);
		if (!this._process)           { return this; }
		// remove from watched paths
		this._paths.delete(p);
		this._process.unwatch(p);
		return this;
	}

	unwatchAll(){
		for(let p in this._paths){
			this.unwatch(p);
		}
	}
}