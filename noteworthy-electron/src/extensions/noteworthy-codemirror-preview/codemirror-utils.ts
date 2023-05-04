// codemirror
import * as CL  from "@codemirror/language"
import * as CJS from "@codemirror/lang-javascript"
import { cppLanguage } from "@codemirror/lang-cpp"
import { pythonLanguage } from "@codemirror/lang-python"
import { javaLanguage } from "@codemirror/lang-java"
import { jsonLanguage } from "@codemirror/lang-json"

// codemirror legacy languages
import {haskell} from "@codemirror/legacy-modes/mode/haskell"
import {c, scala} from "@codemirror/legacy-modes/mode/clike"
import {lua} from "@codemirror/legacy-modes/mode/lua"
import {julia} from "@codemirror/legacy-modes/mode/julia"
import {yaml} from "@codemirror/legacy-modes/mode/yaml"

////////////////////////////////////////////////////////////////////////////////

export function getCodeMirrorLanguage(lang: string|null): CL.Language|null {
	// javascript / typescript
	if(lang === "javascript") { return CJS.javascriptLanguage;            }
	if(lang === "js")         { return CJS.javascriptLanguage;            }
	if(lang === "jsx")        { return CJS.jsxLanguage;                   }
	if(lang === "typescript") { return CJS.typescriptLanguage;            }
	if(lang === "js")         { return CJS.typescriptLanguage;            }
	if(lang === "tsx")        { return CJS.tsxLanguage;                   }
	// clike
	if(lang === "c")          { return CL.StreamLanguage.define(c);       }
	if(lang === "cpp")        { return cppLanguage;                       }
	if(lang === "c++")        { return cppLanguage;                       }
	if(lang === "java")       { return javaLanguage;                      }
	if(lang === "scala")      { return CL.StreamLanguage.define(scala);   }
	// scientific
	if(lang === "julia")      { return CL.StreamLanguage.define(julia);   }
	if(lang === "lua")        { return CL.StreamLanguage.define(lua);     }
	if(lang === "python")     { return pythonLanguage;                    }
	// functional
	if(lang === "haskell")    { return CL.StreamLanguage.define(haskell); }
	// config
	if(lang === "json")       { jsonLanguage;                             }
	if(lang === "yaml")       { return CL.StreamLanguage.define(yaml);    }
	// other
	if(lang === "yaml")       { return CL.StreamLanguage.define(yaml);    }

	// default
	return null;
}