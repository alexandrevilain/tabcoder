export type AutoCompleteContext = {
  textBeforeCursor: string,
  textAfterCursor: string,
  currentLineText: string,
  filename?: string,
  language?: string,
}