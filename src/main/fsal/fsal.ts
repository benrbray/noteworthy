// project imports
import { IDirectory, IDirEntry, IDirectoryMeta, IDirEntryMeta, IFileMeta, IFileDesc } from "@common/files";

////////////////////////////////////////////////////////////////////////////////

/**
 * Represents anything capable of loading and saving files,
 * and emitting events when the corresponding files are changed.
 */
export default interface FSAL {
	init(): Promise<void>;
	close(): Promise<void>;

	/**
	 * Reads in a file tree recursively, returning the directory descriptor object.
	 * 
	 * @param currentPath The current path of the directory
	 * @param parent A parent (or null, if it's a root)
	 */
	parseDir(dirPath:string, parent?:IDirectory|null): Promise<IDirectory>

	parseFile(filePath:string, parent?:IDirectory|null): Promise<IFileDesc|null>
}