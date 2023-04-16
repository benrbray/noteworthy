// prosemirror
import * as PS from "prosemirror-state";

// noteworthy-codemirror-preview
import { NoteworthyExtension, NoteworthyExtensionSpec } from "@main/extensions/noteworthy-extension";
import { codeMirrorPlugin as codeMirrorPreviewPlugin } from "./codemirror-preview-plugin";
import { PreviewRenderers } from "./codemirror-preview-types";

////////////////////////////////////////////////////////////////////////////////

export namespace CodeMirrorPreview {
  export type Name = "codeMirrorPreview";

  export interface Config {
    previewRenderers: PreviewRenderers
  } 
}


////////////////////////////////////////////////////////////////////////////////

// register the extension with Noteworthy
declare module "@main/extensions/noteworthy-extension" {
  export interface CommunityExtensions {
    codeMirrorPreview: {
      config: CodeMirrorPreview.Config
    }
  }
}

////////////////////////////////////////////////////////////////////////////////

export const codeMirrorPreviewSpec: NoteworthyExtensionSpec<CodeMirrorPreview.Name> = {
  name : "codeMirrorPreview",
}

export default class CodeMirrorPreviewExtension
extends NoteworthyExtension<CodeMirrorPreview.Name> {

  private _previewRenderers: PreviewRenderers = {};
  private _codeMirrorPreviewPlugin: PS.Plugin|null = null;

  constructor(){ 
    super();
  }

  override updateConfig(updated: CodeMirrorPreview.Config): void {
    // override language preview renderers with updated values
    Object.assign(this._previewRenderers, updated.previewRenderers);
  }

  override makeProseMirrorPlugins(): PS.Plugin[] {
    // initialize preview plugin
    this._codeMirrorPreviewPlugin = codeMirrorPreviewPlugin({
        mode: "preview",
        previewRenderers: this._previewRenderers
    });

    return [this._codeMirrorPreviewPlugin];
  }

}
