export type PreviewRenderer = (dom: HTMLElement, code: string) => void;

export type PreviewRenderers = { [lang:string] : PreviewRenderer };