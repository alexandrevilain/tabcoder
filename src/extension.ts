import * as vscode from 'vscode';
import { TabCoderInlineCompletionProvider } from './vscode/completionProvider';
import { ConfigurationProvider } from './vscode/configProvider';
import { TabCoderStatusBarProvider } from './vscode/statusBarProvider';
import { ProfileCommandProvider } from './vscode/profileCommandProvider';
import { logger } from './utils/logger';
import { ProfileService } from './services/profileService';

export function activate(context: vscode.ExtensionContext) {
	// Initialize ConfigurationProvider with context for secure storage.
	const configurationProvider = new ConfigurationProvider();

	const profileService = new ProfileService(context, configurationProvider);

	// Create and register the status bar provider.
	const statusBarProvider = new TabCoderStatusBarProvider(profileService);
	context.subscriptions.push(statusBarProvider);

	logger.info("Registered status bar provider");

	// Register status bar click command
	context.subscriptions.push(
		vscode.commands.registerCommand('tabcoder.statusBarClicked', () => statusBarProvider.handleStatusBarClick())
	);

	// Register the inline completion provider for all languages.
	const inlineCompletionProvider = new TabCoderInlineCompletionProvider(profileService, statusBarProvider);
	context.subscriptions.push(
		vscode.languages.registerInlineCompletionItemProvider(
			'*', // Register for all languages
			inlineCompletionProvider
		)
	);

	// Register command to track when completions are accepted.
	context.subscriptions.push(
		vscode.commands.registerCommand('tabcoder.completionAccepted', (text: string, position: vscode.Position) => {
			inlineCompletionProvider.onCompletionAccepted(text, position);
		})
	);

	logger.info("Registered inline completion provider");

	// Register profile management commands.
	const profileCommandProvider = new ProfileCommandProvider(profileService);
	context.subscriptions.push(
		vscode.commands.registerCommand('tabcoder.createProfile', () => profileCommandProvider.createProfile()),
		vscode.commands.registerCommand('tabcoder.setActiveProfile', () => profileCommandProvider.setActiveProfile()),
		vscode.commands.registerCommand('tabcoder.removeProfile', () => profileCommandProvider.removeProfile())
	);

	logger.info("Registered commands");
}

export function deactivate() {}
