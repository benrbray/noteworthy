/**
 * Function which updates the DOM element with a preview of `code`.
 * 
 * @returns `true` if the preview rendered successfully, `false` otherwise.  Can
 * be used to report errors or disable the preview based on the contents of `code`.
 */
export type PreviewRenderer = (dom: HTMLElement, code: string) => boolean;

export type PreviewRenderers = { [lang:string] : PreviewRenderer };