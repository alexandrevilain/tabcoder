import * as vscode from 'vscode';
import { HoleFiller, DefaultHoleFiller } from '../autocomplete/holeFiller';
import { AutoCompleteContext } from '../autocomplete/context';
import { ProfileService } from '../services/profileService';
import { getLanguageModelFromProfile } from '../providers/providers';
import { generateText } from 'ai';
import { TabCoderStatusBarProvider } from './statusBarProvider';
import { logger } from '../utils/logger';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { ProfileWithAPIKey } from '../types';

export class TabCoderInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
    private holeFiller: HoleFiller = new DefaultHoleFiller();
    private profileService: ProfileService;
    private statusBarProvider: TabCoderStatusBarProvider;
    private debounceTimeout: NodeJS.Timeout | undefined;
    private currentAbortController: AbortController | undefined;

    private lastUsedProfileId: string | undefined;
    private cachedModel: LanguageModelV2 | undefined;

    private requestCounter: number = 0; // Unique ID for each request
    private readonly debounceDelayMs: number = 300; // 300ms debounce delay
    private lastAcceptedCompletion: { text: string; position: vscode.Position; timestamp: number } | undefined;
    private lastDocumentVersion: number = -1;
    private lastChangeTimestamp: number = 0;


    constructor(profileService: ProfileService, statusBarProvider: TabCoderStatusBarProvider) {
        this.profileService = profileService;
        this.profileService.onDidActiveProfileChange(this.handleProfileChange, this);

        this.statusBarProvider = statusBarProvider;
    }

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList> {
        const profile = await this.profileService.getActiveProfile();
        if (!profile) {
            logger.info(`No active profile found, skipping completion`);
            return [];
        }

        // Increment request counter to create unique request ID.
        // We ensure that this number is not going to overflow (should never append but it costs nothing to add).
        if (this.requestCounter >= Number.MAX_SAFE_INTEGER) {
            this.requestCounter = 0; 
        }
        const currentRequestId = ++this.requestCounter;

        // Early filtering to avoid unnecessary LLM requests.
        if (this.shouldSkipRequest(document, position, context)) {
            logger.info(`Request ${currentRequestId} skipped due to filtering rules`);
            return [];
        }

        // Cancel any existing timeout and abort controller
        if (this.debounceTimeout) {
            clearTimeout(this.debounceTimeout);
            this.debounceTimeout = undefined;
        }

        if (this.currentAbortController) {
            this.currentAbortController.abort();
            this.currentAbortController = undefined;
        }

        // Return empty result immediately if cancellation is already requested
        if (token.isCancellationRequested) {
            logger.info(`Request ${currentRequestId} already cancelled, returning empty result`);
            return [];
        }

        // Create a promise that resolves after the debounce delay
        return new Promise((resolve) => {
            this.debounceTimeout = setTimeout(async () => {
                try {
                    // Check if this request is still the latest
                    if (!this.isRequestStillValid(currentRequestId, token)) {
                        logger.info(`Request ${currentRequestId} cancelled or superseded before generation, aborting`);
                        resolve([]);
                        return;
                    }

                    // Notify status bar that completion generation is starting.
                    this.statusBarProvider.onCompletionStart(currentRequestId);
                    
                    const result = await this.generateCompletion(document, position, token, profile, currentRequestId);

                    this.statusBarProvider.onCompletionEnd(currentRequestId);

                    // Final check if this is still the latest request before resolving
                    if (currentRequestId === this.requestCounter) {
                        resolve(result);
                    } else {
                        logger.info(`Request ${currentRequestId} completed but superseded, discarding result`);
                        resolve([]);
                    }
                } catch (error) {
                    this.statusBarProvider.onCompletionEnd(currentRequestId);

                    if (error instanceof Error && error.name === 'AbortError') {
                        logger.info(`Request ${currentRequestId} aborted during generation`);
                        resolve([]);
                    } else {
                        logger.error(`Error generating completion for request ${currentRequestId}:`, error);
                        resolve([]);
                    }
                }
            }, this.debounceDelayMs);

            // Handle cancellation during debounce period
            token.onCancellationRequested(() => {
                if (this.debounceTimeout) {
                    clearTimeout(this.debounceTimeout);
                    this.debounceTimeout = undefined;
                }
                if (this.currentAbortController) {
                    this.currentAbortController.abort();
                    this.currentAbortController = undefined;
                }
                logger.info(`Request ${currentRequestId} cancelled, clearing debounce timeout`);
                this.statusBarProvider.onCompletionEnd(currentRequestId);
                resolve([]);
            });
        });
    }

    private shouldSkipRequest(
        document: vscode.TextDocument,
        position: vscode.Position,
        context: vscode.InlineCompletionContext
    ): boolean {
        const currentTime = Date.now();
        const currentLine = document.lineAt(position.line);
        
        // Skip if document hasn't changed (avoid duplicate requests)
        if (document.version === this.lastDocumentVersion) {
            return true;
        }
        
        // Skip if autocomplete widget is visible and has selected completion info
        // This means VSCode's built-in autocomplete is active
        if (context.selectedCompletionInfo) {
            return true;
        }
        
        // Skip if user just accepted a completion (within 1 second)
        if (this.lastAcceptedCompletion &&
            currentTime - this.lastAcceptedCompletion.timestamp < 1000) {
            
            // Calculate the expected cursor position after the completion (handle multi-line).
            const completionLines = this.lastAcceptedCompletion.text.split('\n');
            let expectedEndPosition: vscode.Position;
            
            if (completionLines.length === 1) {
                // Single line completion
                expectedEndPosition = new vscode.Position(
                    this.lastAcceptedCompletion.position.line,
                    this.lastAcceptedCompletion.position.character + this.lastAcceptedCompletion.text.length
                );
            } else {
                // Multi-line completion
                expectedEndPosition = new vscode.Position(
                    this.lastAcceptedCompletion.position.line + completionLines.length - 1,
                    completionLines[completionLines.length - 1].length
                );
            }
            
            // Skip if current position is at or near the end of the accepted completion
            if (position.line === expectedEndPosition.line &&
                Math.abs(position.character - expectedEndPosition.character) <= 1) {
                return true;
            }
        }
        
        // Skip if cursor is in the middle of a word (not at word boundary)
        const charAtCursor = currentLine.text.charAt(position.character);
        const charBeforeCursor = position.character > 0 ? currentLine.text.charAt(position.character - 1) : '';
        if (charAtCursor && /\w/.test(charAtCursor) && /\w/.test(charBeforeCursor)) {
            return true;
        }
        
        // Skip if recent rapid changes (likely copy-paste or rapid typing)
        if (currentTime - this.lastChangeTimestamp < 100) {
            return true;
        }
        
        // Skip if line is very long (likely pasted content)
        if (currentLine.text.length > 200) {
            return true;
        }
        
        this.lastDocumentVersion = document.version;
        this.lastChangeTimestamp = currentTime;
        
        return false;
    }

    private async generateCompletion(
        document: vscode.TextDocument,
        position: vscode.Position,
        token: vscode.CancellationToken,
        profile: ProfileWithAPIKey,
        requestId: number
    ): Promise<vscode.InlineCompletionItem[]> {
        // Check if this request is still the latest after generation
        if (!this.isRequestStillValid(requestId, token)) {
            logger.info(`Request ${requestId} cancelled or superseded before generation, aborting`);
            return [];
        }

        // Get all text before cursor in the file.
        const textBeforeCursor = document.getText(new vscode.Range(
            new vscode.Position(0, 0),
            position
        ));

        // Get all text after cursor in the file.
        const textAfterCursor = document.getText(new vscode.Range(
            position,
            new vscode.Position(document.lineCount - 1, document.lineAt(document.lineCount - 1).text.length)
        ));

        const params: AutoCompleteContext = {
            textBeforeCursor,
            textAfterCursor,
            filename: document.fileName,
            language: document.languageId,
            currentLineText: document.lineAt(position.line).text,
        };

        logger.info(`Request ${requestId}: Using profile: ${profile.name} (ID: ${profile.id})`);
        logger.info(`Request ${requestId}: Completion params:`, params);

        // Create a new AbortController for this request
        this.currentAbortController = new AbortController();

        // Handle VSCode cancellation token by aborting our controller
        const tokenListener = token.onCancellationRequested(() => {
            if (this.currentAbortController) {
                this.currentAbortController.abort();
            }
        });

        try {
            // Cache the model if the profile hasn't changed.
            if (this.lastUsedProfileId !== profile.id || !this.cachedModel) {
                logger.debug(`Request ${requestId}: Profile changed or model not cached, creating new model`);
                this.cachedModel = getLanguageModelFromProfile(profile);
                this.lastUsedProfileId = profile.id;
            } else {
                logger.debug(`Request ${requestId}: Using cached model for profile ${profile.id}`);
            }

            const { text, usage } = await generateText({
                model: this.cachedModel!,
                messages: [
                    { role: "system", content: this.holeFiller.systemPrompt() },
                    { role: "user", content: this.holeFiller.userPrompt(params) },
                ],
                abortSignal: this.currentAbortController.signal,
            });

            // Check if this request is still the latest after generation
            if (!this.isRequestStillValid(requestId, token)) {
                logger.debug(`Request ${requestId} cancelled or superseded after generation, discarding result`);
                return [];
            }

            if (!text) {
                return [];
            }

            let response = this.processModelResponse(text);
            if (response.startsWith(params.currentLineText)) {
                response = response.slice(params.currentLineText.length);
            }

            const inlineCompletionItem = new vscode.InlineCompletionItem(response);
            
            // Track this completion for future filtering.
            inlineCompletionItem.command = {
                command: 'tabcoder.completionAccepted',
                title: 'Track Completion',
                arguments: [response, position]
            };
            
            logger.debug(`Request ${requestId}: Providing inline suggestion: "${response}" (usage: ${usage.inputTokens} input / ${usage.outputTokens} output)`);
            return [inlineCompletionItem];
            
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') {
                logger.info(`Request ${requestId} aborted during generateText call`);
            } else {
                logger.error(`Request ${requestId} error during generateText call:`, error);
            }
            return [];
        } finally {
            // Clean up the token listener
            tokenListener.dispose();
        }
    }

    private isRequestStillValid(requestId: number, token: vscode.CancellationToken): boolean {
        return requestId === this.requestCounter && !token.isCancellationRequested;
    }

    /**
     * Call this method when a completion is accepted to track it for future filtering
     */
    public onCompletionAccepted(text: string, position: vscode.Position): void {
        this.lastAcceptedCompletion = {
            text,
            position,
            timestamp: Date.now()
        };
        logger.info(`Completion accepted at ${position.line}:${position.character}: "${text}"`);
    }

    private processModelResponse(responseText: string): string {
        const fullMatch = /(<COMPLETION>)?([\s\S]*?)(<\/COMPLETION>|$)/.exec(responseText);
        if (!fullMatch) {
            return responseText;
        }
        if (fullMatch[2].endsWith("</COMPLETION>")) {
            return fullMatch[2].slice(0, -"</COMPLETION>".length);
        }
        return fullMatch[2];
    }

    private handleProfileChange(): void {
        this.cachedModel = undefined;
        this.lastUsedProfileId = undefined;
        logger.info('Active profile changed, clearing cached model');
    }
}