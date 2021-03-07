// type declarations

declare module NodeJS {
	declare interface Global {
		isQuitting: boolean;
	}
}

interface ProxyConstructor {
	new <TSource extends object, TTarget extends object>(target: TSource, handler: ProxyHandler<TSource>): TTarget;
}