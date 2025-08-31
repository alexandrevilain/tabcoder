import * as vscode from 'vscode';

export interface LSPDefinition {
  name: string;
  kind: vscode.SymbolKind;
  detail?: string;
  documentation?: string;
  range: vscode.Range;
  uri: string;
  containerName?: string;
}

export interface LSPContext {
  definitions: LSPDefinition[];
  lastUpdated: number;
  workspaceSymbols: LSPDefinition[];
}

export interface LSPProviderOptions {
  maxDefinitions?: number;
  includeWorkspaceSymbols?: boolean;
  cacheTimeout?: number;
  relevanceThreshold?: number;
}