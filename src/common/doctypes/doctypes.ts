////////////////////////////////////////////////////////////

/**
 * @todo (7/26/20) These typings would benefit from support
 * for polymorphic `this` in static methods for TypeScript,
 *
 * https://stackoverflow.com/questions/59774804/how-to-define-a-generic-constructor-in-typescript-under-inheritance
 * https://github.com/microsoft/TypeScript/issues/5863
 * 
 */

/**
 * @todo (7/28/20) properly validate YAML metadata
 */
export interface DocMeta {
	title?:string;
	author?:string;
	url?:string;
	date?:string;
	tags_defined?:string|string[];
	tags?:string|string[];
}

export interface IDoc {
	getMeta(): DocMeta;
}

// -- DocParser ----------------------------------------- //

export interface IDocParser {
	parse(serialized:string):IDoc|null;
}

interface IDocClass<T extends IDoc> {
	new (...args:any[]): T;
	parse(serialized:string): T|null;
}

export class DocParser<T extends IDoc> implements IDocParser {
	
	constructor(private _classToCreate: IDocClass<T>) { }

	parse(serialized:string): T|null {
		return this._classToCreate.parse(serialized);
	}
}

// -- AstParser ----------------------------------------- //

export interface IAstParser {
	parseAST(serialized:string):IDoc|null;
}

interface IAstClass<T extends IDoc> {
	new (...args:any[]): T;
	parseAST(serialized:string): T|null;
}

export class AstParser<T extends IDoc> implements IDocParser {

	constructor(private _classToCreate: IAstClass<T>) { }

	parse(serialized:string): T|null {
		return this._classToCreate.parseAST(serialized);
	}
}