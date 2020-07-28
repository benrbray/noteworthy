// noteworthy imports
import { IFileMeta, readFile } from "@common/fileio";

////////////////////////////////////////////////////////////

/**
 * @todo (7/26/20) These typings would benefit from support
 * for polymorphic `this` in static methods for TypeScript,
 *
 * https://stackoverflow.com/questions/59774804/how-to-define-a-generic-constructor-in-typescript-under-inheritance
 * https://github.com/microsoft/TypeScript/issues/5863
 * 
 */

export interface DocMeta {
	title?:string;
	author?:string;
	url?:string;
	date?:string;
	tags_defined?:string[];
	tags?:string[];
}

export interface IDoc {
	getMeta():DocMeta;
}

export interface IDocParser {
	parse(serialized:string):IDoc|null;
}

interface IBuilder<T extends IDoc> {
	new (...args:any[]): T;
	parse(serialized:string): T|null;
}

export class ParserFor<T extends IDoc> implements IDocParser {
	private classToCreate: IBuilder<T>;

	constructor(classToCreate: IBuilder<T>) {
		this.classToCreate = classToCreate;
	}

	parse(serialized:string): T|null {
		return this.classToCreate.parse(serialized);
	}
}