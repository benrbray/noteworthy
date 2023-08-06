////////////////////////////////////////////////////////////

export interface IDoc { }

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
