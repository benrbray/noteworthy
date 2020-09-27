export class DefaultMap<K,V> extends Map<K,V>{

	defaultFn: (key: K) => V;

	constructor(defaultFn: (key: K) => V, iterable?: Iterable<readonly [K, V]>) {
		// map constructor
		if(iterable) { super(iterable); } else { super(); }
		// default
		this.defaultFn = defaultFn;
	}

	get(key:K):V {
		let val:V|undefined = super.get(key);
		if(val === undefined){
			val = this.defaultFn(key);
			super.set(key, val);
		}
		return val;
	}

}