import * as vscode from 'vscode';
import { LSPDefinition, LSPContext, LSPProviderOptions } from '../types/lsp';
import { logger } from '../utils/logger';

export class LSPProvider {
    private cache = new Map<string, LSPContext>();
    private pendingRequests = new Map<string, Promise<LSPContext>>();
    private options: Required<LSPProviderOptions>;

    constructor(options: LSPProviderOptions = {}) {
        this.options = {
            maxDefinitions: options.maxDefinitions ?? 50,
            includeWorkspaceSymbols: options.includeWorkspaceSymbols ?? true,
            cacheTimeout: options.cacheTimeout ?? 30000, // 30 seconds
            relevanceThreshold: options.relevanceThreshold ?? 0.3
        };
    }

    /**
     * Get LSP context for a document. This method is optimized for performance:
     * - Returns cached data immediately if available and fresh
     * - Starts async update in background if cache is stale
     * - Returns empty context if no cache exists (async update will populate it)
     */
    public async getLSPContext(document: vscode.TextDocument, position: vscode.Position): Promise<LSPContext> {
        const cacheKey = this.getCacheKey(document.uri);
        const cached = this.cache.get(cacheKey);
        const now = Date.now();

        // Return cached data if fresh
        if (cached && (now - cached.lastUpdated) < this.options.cacheTimeout) {
            return cached;
        }

        // Check if we already have a pending request for this document
        const pendingRequest = this.pendingRequests.get(cacheKey);
        if (pendingRequest) {
            // Return cached data if available, otherwise wait for pending request
            return cached || await pendingRequest;
        }

        // Start async update
        const updatePromise = this.updateLSPContext(document, position);
        this.pendingRequests.set(cacheKey, updatePromise);

        try {
            const result = await updatePromise;
            this.cache.set(cacheKey, result);
            return result;
        } catch (error) {
            logger.error('Failed to update LSP context:', error);
            // Return cached data if available, otherwise empty context
            return cached || this.createEmptyContext();
        } finally {
            this.pendingRequests.delete(cacheKey);
        }
    }

    /**
     * Get LSP context synchronously from cache only (for performance-critical paths)
     */
    public getLSPContextSync(document: vscode.TextDocument): LSPContext | null {
        const cacheKey = this.getCacheKey(document.uri);
        const cached = this.cache.get(cacheKey);
        const now = Date.now();

        if (cached && (now - cached.lastUpdated) < this.options.cacheTimeout) {
            return cached;
        }

        return null;
    }

    /**
     * Preload LSP context for a document (fire and forget)
     */
    public preloadLSPContext(document: vscode.TextDocument, position: vscode.Position): void {
        const cacheKey = this.getCacheKey(document.uri);
        
        // Don't preload if we already have fresh data or a pending request
        if (this.cache.has(cacheKey) || this.pendingRequests.has(cacheKey)) {
            return;
        }

        // Start async update without waiting
        this.getLSPContext(document, position).catch(error => {
            logger.debug('Preload LSP context failed:', error);
        });
    }

    private async updateLSPContext(document: vscode.TextDocument, position: vscode.Position): Promise<LSPContext> {
        const definitions: LSPDefinition[] = [];
        
        try {
            // Get document symbols (functions, classes, etc. in current file)
            const documentSymbols = await this.getDocumentSymbols(document);
            definitions.push(...documentSymbols);

            // Get workspace symbols if enabled (symbols from other files)
            if (this.options.includeWorkspaceSymbols) {
                const workspaceSymbols = await this.getRelevantWorkspaceSymbols(document, position);
                definitions.push(...workspaceSymbols);
            }

            // Get definitions at current position (go-to-definition results)
            const positionDefinitions = await this.getDefinitionsAtPosition(document, position);
            definitions.push(...positionDefinitions);

            // Sort by relevance and limit results
            const sortedDefinitions = this.sortDefinitionsByRelevance(definitions, document, position);
            const limitedDefinitions = sortedDefinitions.slice(0, this.options.maxDefinitions);

            return {
                definitions: limitedDefinitions,
                lastUpdated: Date.now(),
                workspaceSymbols: definitions.filter(d => d.uri !== document.uri.toString())
            };
        } catch (error) {
            logger.error('Error updating LSP context:', error);
            return this.createEmptyContext();
        }
    }

    private async getDocumentSymbols(document: vscode.TextDocument): Promise<LSPDefinition[]> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols) {return [];}

            return this.flattenDocumentSymbols(symbols, document.uri.toString());
        } catch (error) {
            logger.debug('Failed to get document symbols:', error);
            return [];
        }
    }

    private async getRelevantWorkspaceSymbols(document: vscode.TextDocument, position: vscode.Position): Promise<LSPDefinition[]> {
        try {
            // Get text around cursor to find relevant symbols
            const line = document.lineAt(position.line);
            const wordRange = document.getWordRangeAtPosition(position);
            const currentWord = wordRange ? document.getText(wordRange) : '';
            
            // Search for symbols that might be relevant
            const query = currentWord || line.text.trim().split(/\s+/).pop() || '';
            
            if (!query || query.length < 2) {return [];}

            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeWorkspaceSymbolProvider',
                query
            );

            if (!symbols) {return [];}

            return symbols
                .filter(symbol => symbol.location.uri.toString() !== document.uri.toString())
                .slice(0, 20) // Limit workspace symbols
                .map(symbol => this.convertSymbolInformation(symbol));
        } catch (error) {
            logger.debug('Failed to get workspace symbols:', error);
            return [];
        }
    }

    private async getDefinitionsAtPosition(document: vscode.TextDocument, position: vscode.Position): Promise<LSPDefinition[]> {
        try {
            const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                document.uri,
                position
            );

            if (!definitions) {return [];}

            const results: LSPDefinition[] = [];
            for (const definition of definitions) {
                const defDocument = await vscode.workspace.openTextDocument(definition.uri);
                const symbol = await this.getSymbolAtPosition(defDocument, definition.range.start);
                if (symbol) {
                    results.push(symbol);
                }
            }

            return results;
        } catch (error) {
            logger.debug('Failed to get definitions at position:', error);
            return [];
        }
    }

    private async getSymbolAtPosition(document: vscode.TextDocument, position: vscode.Position): Promise<LSPDefinition | null> {
        try {
            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                document.uri
            );

            if (!symbols) {return null;}

            const symbol = this.findSymbolAtPosition(symbols, position);
            if (!symbol) {return null;}

            return this.convertDocumentSymbol(symbol, document.uri.toString());
        } catch (error) {
            logger.debug('Failed to get symbol at position:', error);
            return null;
        }
    }

    private flattenDocumentSymbols(symbols: vscode.DocumentSymbol[], uri: string): LSPDefinition[] {
        const result: LSPDefinition[] = [];
        
        for (const symbol of symbols) {
            result.push(this.convertDocumentSymbol(symbol, uri));
            
            // Recursively add children
            if (symbol.children && symbol.children.length > 0) {
                result.push(...this.flattenDocumentSymbols(symbol.children, uri));
            }
        }
        
        return result;
    }

    private convertDocumentSymbol(symbol: vscode.DocumentSymbol, uri: string): LSPDefinition {
        return {
            name: symbol.name,
            kind: symbol.kind,
            detail: symbol.detail,
            range: symbol.range,
            uri
        };
    }

    private convertSymbolInformation(symbol: vscode.SymbolInformation): LSPDefinition {
        return {
            name: symbol.name,
            kind: symbol.kind,
            containerName: symbol.containerName,
            range: symbol.location.range,
            uri: symbol.location.uri.toString()
        };
    }

    private findSymbolAtPosition(symbols: vscode.DocumentSymbol[], position: vscode.Position): vscode.DocumentSymbol | null {
        for (const symbol of symbols) {
            if (symbol.range.contains(position)) {
                // Check children first (more specific)
                if (symbol.children) {
                    const childSymbol = this.findSymbolAtPosition(symbol.children, position);
                    if (childSymbol) {return childSymbol;}
                }
                return symbol;
            }
        }
        return null;
    }

    private sortDefinitionsByRelevance(definitions: LSPDefinition[], document: vscode.TextDocument, position: vscode.Position): LSPDefinition[] {
        const currentUri = document.uri.toString();
        
        return definitions.sort((a, b) => {
            let scoreA = 0;
            let scoreB = 0;

            // Prefer symbols from the same file
            if (a.uri === currentUri) {scoreA += 10;}
            if (b.uri === currentUri) {scoreB += 10;}

            // Prefer functions and classes over variables
            if ([vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Class, vscode.SymbolKind.Interface].includes(a.kind)) {
                scoreA += 5;
            }
            if ([vscode.SymbolKind.Function, vscode.SymbolKind.Method, vscode.SymbolKind.Class, vscode.SymbolKind.Interface].includes(b.kind)) {
                scoreB += 5;
            }

            // Prefer symbols closer to current position (same file only)
            if (a.uri === currentUri && b.uri === currentUri) {
                const distanceA = Math.abs(a.range.start.line - position.line);
                const distanceB = Math.abs(b.range.start.line - position.line);
                scoreA += Math.max(0, 100 - distanceA);
                scoreB += Math.max(0, 100 - distanceB);
            }

            return scoreB - scoreA;
        });
    }

    private getCacheKey(uri: vscode.Uri): string {
        return uri.toString();
    }

    private createEmptyContext(): LSPContext {
        return {
            definitions: [],
            lastUpdated: Date.now(),
            workspaceSymbols: []
        };
    }

    /**
     * Clear cache for a specific document
     */
    public clearCache(uri: vscode.Uri): void {
        const cacheKey = this.getCacheKey(uri);
        this.cache.delete(cacheKey);
        this.pendingRequests.delete(cacheKey);
    }

    /**
     * Clear all cache
     */
    public clearAllCache(): void {
        this.cache.clear();
        this.pendingRequests.clear();
    }

    /**
     * Get cache statistics for debugging
     */
    public getCacheStats(): { size: number; pendingRequests: number } {
        return {
            size: this.cache.size,
            pendingRequests: this.pendingRequests.size
        };
    }
}