import { IDoc } from "./doctypes";

// TODO (Ben @ 2023/05/03) refactor so plugin types are available here
// @ts-ignore
import type { ICrossRefProvider } from "@main/plugins/crossref-plugin";
// @ts-ignore
import type { IMetadataProvider, IMetadata } from "@main/plugins/metadata-plugin";
// @ts-ignore
import type { Citation, ICitationProvider } from "@main/plugins/citation-plugin";

////////////////////////////////////////////////////////////////////////////////

export class SeedDoc implements IDoc, IMetadataProvider, ICitationProvider, ICrossRefProvider {

	private readonly _properties: { [key:string] : string };

	constructor() {
		this._properties = {};
	}

	/* ---- IMetadataProvider ---- */
	public IS_METADATA_PROVIDER: true = true;

	getMetadata(): IMetadata {
		return this._properties;
	}

	/* ---- ICrossRefProvider ---- */
	public IS_XREF_PROVIDER:true = true;

	getTagsDefined(): string[] {
		return [];
	}

	getTagsMentioned(): string[] {
		return [];
	}

	/* ---- ICitationProvider ---- */
	public IS_CITATION_PROVIDER: true = true;

	getCitation(): Citation | null {
		return null;
	}

}
