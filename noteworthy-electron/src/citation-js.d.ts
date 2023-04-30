declare module "@citation-js/plugin-bibtex" {

}

declare module "@citation-js/plugin-csl" {

}

declare module "@citation-js/date" {

	type DateY = [number];
	type DateYM = [number, number];
	type DateYMD = [number, number, number];

	type DateCslParts = DateY | DateYM | DateYMD;

	type DateCslValid = { "date-parts" : [DateCslParts] };
	type DateCslInvalid = { "raw" : string };
	type DateCsl = DateCslValid | DateCslInvalid;

	function parse(date: string, endDate?: string): DateCsl;
	function format(date: DateCsl, delimiter?: string): string;
}

declare module "@citation-js/core" {

	type InputData = any; 

	interface InputOptions {
		/** Default output options, used when calling `Cite.get()`. */
		output?: OutputOptions;
		/** Max number of parsing iterations used when parsing. */
		maxChainLength?: number;
		/** Generate a parsing chain graph.  Holds info on how an entry was parsed. */
		generateGraph?: boolean;
		/** Force parsing as a certain input format if the type checking methods fail (or are slow, and you already know what the input type is, etc.). */
		forceType?: unknown;
		strict?: boolean;
		target?: unknown;
	}

	interface OutputOptions {
		format: string;
		type: string;
		style: string;
		lang: string;
		prepend: string;
		append: string;
	}

	/**
	 * Create a `Cite` object with almost any kind of data, and manipulate it with its default methods.
	 * @param data Input data
	 * @param options Input options
	 */
	class Cite {
		
		constructor(data: InputData, options?: InputOptions);

		public static async(data: InputData, options?: InputOptions): Promise<Cite>;
		public static async(data: InputData, options: InputOptions|undefined, callback: (result: Cite) => void): void;
		
		/**
		 * Get a list of the data entry IDs, in the order of that list
		 * @returns List of IDs
		 */
		public getIds(): string[];
		
		/**
		 * Get formatted data from your object.
		 * @param format format module name
		 * @param options module options (see relevant documentation)
		 * @returns formatted data
		 */
		public format(format: string, ...options: any[]): string | object[];

		/**
		 * Get formatted data from your object.
		 * @param options Output options
		 * @returns The formatted data
		 */
		public get(options?: OutputOptions): string | object[];

		/**
		 * The default options for the output. See [input options](../#cite.in.options)
		 */
		protected _options: OutputOptions;
		
		/**
		 * The saved-images-log
		 */
		log: string[][];
		
		/**
		 * The parsed data
		 */
		data: unknown[];
		
		/**
		 * @returns The latest version of the object
		 */
		currentVersion(): number;
		
		/**
		 * Returns an image of the object in the version specified.
		 * @param versnum The number of the version you want to retrieve. Defaults to `1`. Illegal numbers: numbers under or equal to zero, floats, numbers above the current version of the object.
		 * @returns The version of the object with the version number passed. `undefined` if an illegal number is passed.
		 */
		retrieveVersion(versnum?: number): Cite | undefined;
		
		/**
		 * Returns the second to last saved image of the object.
		 * @param number number of versions to go back (defaults to `1`).
		 * @returns The second to last version of the object. `undefined` if used on first version.
		 */
		undo(number?: number): Cite | undefined;
		
		/**
		 * Returns the last saved image of the object.
		 * @returns The last version of the object. `undefined` if used on first version.
		 */
		retrieveLastVersion(): Cite | undefined;
		
		/**
		 * Save an image of the current version of the object.
		 * @returns The current version of the object.
		 */
		save(): Cite;
		
		/**
		 * default output options
		 */
		readonly defaultOptions: OutputOptions;

		/**
		 * Change the default options of a `Cite` object.
		 */
		options(options: OutputOptions, log: boolean): Cite;

		/**
		 * Add an object to the array of objects
		 * @param data The data to add to your object
		 * @param options Options
		 * @param log Show this call in the log (defaults to `false`)
		 * @returns The updated parent object
		 */
		add(data: InputData, options?: InputOptions, log?: boolean): Cite;
		
		/**
		 * Add an object to the array of objects
		 * @param data The data to add to your object
		 * @param options Options
		 * @param log Show this call in the log  (defaults to `false`)
		 * @returns The updated parent object
		 */
		addAsync(data: InputData, options?: InputOptions, log?: boolean): Promise<Cite>;
		
		/**
		 * Recreate a `Cite` object with almost any kind of data, and manipulate it with its default methods.
		 * @param data Replacement data
		 * @param options Options
		 * @param log Show this call in the log (defaults to `false`)
		 * @returns The updated parent object
		 */
		set(data: InputData, options?: InputOptions, log?: boolean): Cite;
		
		/**
		 * Recreate a `Cite` object with almost any kind of data, and manipulate it with its default methods.
		 * @param data Replacement data
		 * @param options Options
		 * @param log Show this call in the log (defaults to `false`)
		 * @returns The updated parent object
		 */
		setAsync(data: InputData, options?: InputOptions, log?: boolean): Promise<Cite>;
		/**
		 * Reset a `Cite` object.
		 * @param log Show this call in the log (defaults to `false`)
		 * @returns The updated, empty parent object (except the log, the log lives)
		 */
		reset(log?: boolean): Cite;
		/**
		 * Sort the dataset
		 * @param method How to sort.  Can either be a function, or an array of metadata values to compare by, in order.
		 * @param log Show this call in the log (defaults to `false`)
		 * @returns The updated parent object
		 */
		sort(method?: ((a: InputData, b: InputData) => number) | string[], log?: boolean): Cite;
		/**
		 * @param undefined - options
		 * @returns true (if valid)
		 */
		public static validateOutputOptions(): boolean;
		/**
		 * @param undefined - options
		 * @returns true (if valid)
		 */
		public static valdiateOptions(): boolean;
	}

	/////

	const plugins: {
		config: Config;
	}

	interface Config {
		constants: Constants
	}

	type FieldType = "field" | "list" | "separated";
	type ValueType = "literal" | "title" | "name" | "date" | "verbatim" | "uri";

	interface Constants {
		fieldTypes: { [fieldName: string]: [FieldType, ValueType] }
	}

	interface Parse {

	}
}