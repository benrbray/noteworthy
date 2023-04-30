// TypeScript >=3.4 supports "const contexts" to force narrow type inference,
// used here in place of enums / reverse enums for maintainable dialog buttons.
// (https://github.com/Microsoft/TypeScript/pull/29510)
// (https://stackoverflow.com/questions/44497388/typescript-array-to-string-literal-type)

export const DialogSaveDiscardOptions = ["Cancel", "Discard Changes", "Save As", "Save"] as const;