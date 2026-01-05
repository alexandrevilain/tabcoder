import { Prompt } from 'ai';
import { ProviderOptions } from '@ai-sdk/provider-utils';
import { LSPContext } from '../types/lsp';

export interface HoleFiller {
  prompt(params: AutoCompleteContext): PromptArgs
}

export type PromptArgs = Prompt & {
    providerOptions?: ProviderOptions;
};

export type AutoCompleteContext = {
  textBeforeCursor: string,
  textAfterCursor: string,
  currentLineText: string,
  filename?: string,
  language?: string,
  lspContext?: LSPContext,
}