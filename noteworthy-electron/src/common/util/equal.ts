// https://github.com/dashed/shallowequal/blob/master/index.js
export function shallowEqual<T extends { [key:string] : unknown }>(
	objA:T, objB:T,
	compareObjects?:(a:T, b:T) => boolean,
	compareValues?: (aVal:any, bVal:any, key:keyof T)=>boolean,
	compareContext?:unknown
) {
	// compare function
	var ret = compareObjects ? compareObjects.call(compareContext, objA, objB) : undefined;
	if (ret !== undefined) { return !!ret; }

	// check existence
	if (objA === objB) { return true; }
	if (!objA || typeof objA !== "object") { return false; }
	if (!objB || typeof objB !== "object") { return false; }

	// compare keys
	var keysA:string[] = Object.keys(objA);
	var keysB:string[] = Object.keys(objB);
	if (keysA.length !== keysB.length) { return false; }

	var bHasOwnProperty = Object.prototype.hasOwnProperty.bind(objB);

	// Test for A's keys different from B.
	for (var idx = 0; idx < keysA.length; idx++) {
		var key:string = keysA[idx];

		if (!bHasOwnProperty(key)) { return false; }

		var valueA:any = objA[key];
		var valueB:any = objB[key];

		ret = compareValues ? compareValues.call(compareContext, valueA, valueB, key) : undefined;
		if (ret === false || (ret === undefined && valueA !== valueB)) {
			return false;
		}
	}

	return true;
};