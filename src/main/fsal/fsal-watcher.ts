import chokidar, { FSWatcher } from "chokidar";
import { EventEmitter } from "events";

////////////////////////////////////////////////////////////

export default class FSALWatchdog extends EventEmitter {

	private _projectDir:string;
	private _process:FSWatcher|null; // chokidar process
	private _isBooting:boolean;
	private _paths:string[];

	constructor(projectDir:string){
		super();

		this._projectDir = projectDir;
		this._process = null;
		this._paths = [];
		this._isBooting = false;
	}

	init(){
		console.log("fsal-watcher :: init()");

		// don't boot up twice, and only boot if there's at least one path
		if(this._paths.length < 1 || this.isBooting()){ return; }
		this._isBooting = true;

		// chokidar's ignored-setting is compatible to anymatch, so we can
		// pass an array containing the standard dotted directory-indicators,
		// directories that should be ignored and a function that returns true
		// for all files that are _not_ in the filetypes list (whitelisting)
		// Further reading: https://github.com/micromatch/anymatch
		let ignoreDirs: RegExp[] = [/(^|[/\\])\../];
		
		this._process = chokidar.watch(this._projectDir, {
			ignored: ignoreDirs,
			persistent: true,
			ignoreInitial: true
		});

		// attach events only after chokidar's initial scan is complete
		this._process.on("ready", (event: string, path: string) => {
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
		this._process.on("all", (event:string,path:string) => {
			console.log("fsal-watcher :: chokidar ::", event, path);
			this.emit(`chokidar-event`, event, {
				path
			});
		});
	}

	isBooting(){ return this._isBooting; };

	ignoreOnce(){

	}

	// == Watched Paths ================================= //

	/** 
	 * Adds a path to the currently watched paths.
	 * @returns self (for chainability)
	 */
	watch(p:string){
		console.log("fsal-watcher :: watch ::", p);
		// ignore duplicate paths
		if (this._paths.includes(p)) { return this; }
		// add the path
		this._paths.push(p);
		// if fsal is booting up, _paths will be watched when chokidar is ready
		if (this.isBooting()) { return this; }
		// start the watchdog if needed
		if (!this._process) { this.init();          }
		else               { this._process.add(p); }
		// chainable
		return this;
	}

	/**
	 * Removes a patch from the watchdog process.
	 * @param p The path to unwatch.
	 * @returns self (for chainability)
	 */
	unwatch(p:string){
		if (!this._process)           { return this; }
		if (!this._paths.includes(p)) { return this; }
		// unwatch
		this._paths.splice(this._paths.indexOf(p), 1);
		this._process.unwatch(p);
		return this;
	}
}