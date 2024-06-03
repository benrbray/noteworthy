import * as vscode from "vscode";
import { HelloWorldPanel } from "./panels/HelloWorldPanel";
import { MarkdownEditorProvider } from "./editors/MarkdownEditor";
import { CatScratchEditorProvider } from "./editors/CatScratchEditor";

export function activate(context: vscode.ExtensionContext) {
  // Create the show hello world command
  const showHelloWorldCommand = vscode.commands.registerCommand("noteworthy.showHelloWorld", () => {
    HelloWorldPanel.render(context.extensionUri);
  });

  // Add command to the extension context
  context.subscriptions.push(showHelloWorldCommand);

  // register custom editor provider
  context.subscriptions.push(MarkdownEditorProvider.register(context));
  context.subscriptions.push(CatScratchEditorProvider.register(context));
}