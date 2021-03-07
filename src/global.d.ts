// type declarations

interface ProxyConstructor {
	new <TSource extends object, TTarget extends object>(target: TSource, handler: ProxyHandler<TSource>): TTarget;
}