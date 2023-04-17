# `noteworthy-extensions`

I aim to make Noteworthy's core as small as possible, with an extension system flexible enough that community-made extensions can dramatically alter the behavior of the editor.  At the moment, I'm working on extracting as many features as possible out of the kernel and into standalone extensions.  The design of the Noteworthy extension system has been inspired by:

* Visual Studio Code [Extension API](https://code.visualstudio.com/api) and [Contribution Points](https://code.visualstudio.com/api/references/contribution-points)
* Remirror [Extensions](https://remirror.io/docs/concepts/extension)
* Obsidian [Plugins](https://marcus.se.net/obsidian-plugin-docs/)