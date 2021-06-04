// project imports
import { IDirectory, IDirEntry, IDirectoryMeta, IDirEntryMeta, IFileMeta, IFileDesc } from "@common/files";

////////////////////////////////////////////////////////////////////////////////

/**
 * Represents anything capable of loading and saving files,
 * and emitting events when the corresponding files are changed.
 */
export interface FSAL {
	/** Perform any necessary initialization. */
	init(): Promise<void>;

	/** Perform any necessary cleanup. */
	close(): Promise<void>;

	/**
	 * Return the contents of the given file, if it exists.
	 * Otherwise, returns NULL.
	 */
	readFile(filePath: string): string | null;

	/**
	 * Save the given text to the given file path.
	 */
	saveFile(filePath: string, fileText: string, mkDirs: boolean): Promise<boolean>;

	/**
	 * Create a new file.
	 * TODO should this be merged with saveFile?
	 */
	createFile(path: string, contents?: string): Promise<boolean>

	/**
	 * Reads in a file tree recursively, returning the directory descriptor object.
	 * 
	 * @param currentPath The current path of the directory
	 * @param parent A parent (or null, if it's a root)
	 */
	parseDir(dirPath:string, parent?:IDirectory|null): Promise<IDirectory>

	parseFile(filePath:string, parent?:IDirectory|null): Promise<IFileDesc|null>

	addListener: (event: string | symbol, listener: (...args: any[]) => void) => FSAL;

	/**
	 * Watch the given path.  (should belong to the workspace!) 
	 * TODO: (2021-05-30) does watch belong on FSAL?
	 */
	watch(path: string): void;

	/**
	 * Watch the given global path.  (need not belong to the workspace)
	 * TODO: (2021-05-30) does watchGlobal belong on FSAL?
	 */
	watchGlobal(path: string): void;
}