> Noteworthy is currently in development!  I work on Noteworthy in my free time, so progress comes in bursts.  I hope to have a public beta available for release before January 2021.


# Noteworthy ([https://noteworthy.ink/](https://noteworthy.ink/))

A free, open-source, local-first Markdown editor built with [ProseMirror](https://prosemirror.net/).

* Works directly with your **local** files, entirely **offline**.
* Write your notes in **Markdown**, plus a few optional extensions.
* Build your own personal wiki with **bidirectional links**.
* Excellent **math** support — seamlessly transition between source and rendered math, thanks to [KaTeX](https://katex.org/) and [prosemirror-math](https://github.com/benrbray/prosemirror-math).

## Excellent Math Support

Inline Math:

![inline math](img/prosemirror-math_inline.gif)

Display Math:

![display math](img/prosemirror-math_display.gif)

## Screenshot

> (screenshot taken 16 September 2020)

![screenshot from 16 September 2020](img/noteworthy_16sept2020.png)

> (screenshot taken 17 September 2020)

![screenshot from 17 September 2020](img/noteworthy_17sept2020.png)

## Feature Comparison

The table below compares Noteworthy to other editors with similar features.  Of course, each editor has its own unique features not listed!  For an even more detailed comparison, check out the [exhaustive feature comparison](https://www.notion.so/db13644f08144495ad9877f217a161a1?v=ff6777802811416ba08dc114e0b11837) put together by the folks at [Athens Research](https://github.com/athensresearch/athens).

![feature comparison](img/noteworthy-comparison_16sept2020.png)

> If you notice an error in the feature comparison table, please [file an issue](https://github.com/benrbray/noteworthy/issues/new/choose) and I will correct it.

## Building Noteworthy

> Noteworthy is NOT quite ready for use.  However, you can follow these instructions if you really wish to run it.

```
git clone --recurse-submodules git@github.com:benrbray/noteworthy.git
cd noteworthy
npm install
npm run dev
```