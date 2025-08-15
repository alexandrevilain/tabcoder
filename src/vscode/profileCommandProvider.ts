import * as vscode from 'vscode';
import { ProfileService } from '../services/profileService';
import { ProfileWithAPIKey, ProviderConnection, ProviderID } from '../types';
import { logger } from '../utils/logger';
import { listModelsFromProviderConnection, providers } from '../providers/providers';

export class ProfileCommandProvider {
    private profileService: ProfileService;

    constructor(profileService: ProfileService) {
        this.profileService = profileService;
    }

    /**
     * Command: Create a new configuration profile
     */
    public async createProfile(): Promise<void> {
        try {
            // First, ask the user to select the provider.
            const availableProviders: { label: string; id: ProviderID }[] = providers.map(provider => ({ label: provider.name, id: provider.id }));

            const selectedProvider = await vscode.window.showQuickPick(availableProviders, {
                title: "Create New AI Profile - Step 1 of 5",
                placeHolder: 'Choose your AI provider (e.g., OpenAI, OpenRouter, Ollama, etc.)',
                ignoreFocusOut: true,
                matchOnDescription: true
            });

            if (!selectedProvider) {
                return; // User cancelled
            }

            // Then, provide the user a way to override default base URL.
            const providerInfo = providers.find(p => p.id === selectedProvider.id);
            const baseURL = await vscode.window.showInputBox({
                title: 'Create New AI Profile - Step 2 of 5',
                prompt: `Enter the API base URL for ${providerInfo?.name || 'your provider'}`,
                placeHolder: 'e.g., https://api.openai.com/v1 or http://localhost:11434',
                ignoreFocusOut: true,
                value: providerInfo?.defaultBaseURL,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Base URL cannot be empty';
                    }
                    try {
                        new URL(value.trim());
                        return null;
                    } catch {
                        return 'Please enter a valid URL (e.g., https://api.example.com)';
                    }
                }
            });

            if (!baseURL) {
                return; // User cancelled
            }

            // Get API key (optional for Ollama)
            let apiKey = '';
            if (selectedProvider.id !== 'ollama') {
                const inputApiKey = await vscode.window.showInputBox({
                    title: 'Create New AI Profile - Step 3 of 5',
                    prompt: `Enter your ${providerInfo?.name || 'API'} key`,
                    placeHolder: 'Your API key will be stored securely in VS Code settings',
                    password: true,
                    ignoreFocusOut: true,
                    validateInput: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'API key is required for this provider';
                        }

                        return null;
                    }
                });

                if (!inputApiKey) {
                    return; // User cancelled
                }
                apiKey = inputApiKey;
            }

            let selectedModelId = '';
            if (selectedProvider.id === 'mistral-codestral') {
                selectedModelId = 'codestral-latest';
            } else {
               selectedModelId = await this.askForModel({
                    id: selectedProvider.id,
                    baseURL,
                    apiKey
                });
            }

            if (!selectedModelId) {
                return;
            }

            // Ask the user to set profile name.
            const existingProfiles = this.profileService.listProfiles();
            const name = await vscode.window.showInputBox({
                title: 'Create New AI Profile - Step 5 of 5',
                prompt: 'Give your profile a memorable name',
                placeHolder: `e.g., "OpenAI GPT-4", "Local Ollama", "Work Account"`,
                ignoreFocusOut: true,
                validateInput: (value) => {
                    if (!value || value.trim().length === 0) {
                        return 'Profile name cannot be empty';
                    }
                    if (value.trim().length < 2) {
                        return 'Profile name must be at least 2 characters long';
                    }
                    if (existingProfiles.some(p => p.name.toLowerCase() === value.trim().toLowerCase())) {
                        return 'A profile with this name already exists. Please choose a different name.';
                    }
                    return null;
                }
            });

            if (!name) {
                logger.info('Profile creation cancelled: user did not provide profile name');
                return; // User cancelled
            }

            logger.info(`Profile name entered: ${name.trim()}`);

            // Ask if user wants to set this profile as default.
            const currentActiveProfile = await this.profileService.getActiveProfile();
            const setAsDefault = await vscode.window.showQuickPick(
                [
                    {
                        label: '$(check) Yes, activate now',
                        description: 'Set as active profile and start using it immediately',
                        detail: 'This will enable TabCoder completions with your new profile'
                    },
                    {
                        label: '$(x) No, just save',
                        description: 'Create profile but keep current settings',
                        detail: currentActiveProfile ? `Keep "${currentActiveProfile.name}" as active profile` : 'TabCoder will remain disabled'
                    }
                ],
                {
                    title: 'Activate New Profile?',
                    placeHolder: 'Choose whether to start using this profile immediately',
                    ignoreFocusOut: true
                }
            );

            if (!setAsDefault) {
                logger.info('Profile creation cancelled: user did not choose default option');
                return; // User cancelled
            }

            const shouldSetAsDefault = setAsDefault.label.includes('Yes, activate now');
            logger.info(`User chose to set as default: ${shouldSetAsDefault}`);

            // Create the profile
            const profileData: ProfileWithAPIKey = {
                id: '', // Will be generated by the service
                name: name.trim(),
                provider: selectedProvider.id,
                baseURL: baseURL.trim(),
                modelId: selectedModelId.trim(),
                apiKey: apiKey.trim()
            };

            const newProfile = await this.profileService.createProfile(profileData);
            logger.info(`Profile created via command: ${newProfile.name}`);

            // Set as default if requested
            if (shouldSetAsDefault) {
                try {
                    await this.profileService.setActiveProfileId(newProfile.id);
                    logger.info(`Profile set as default: ${newProfile.name}`);
                    vscode.window.showInformationMessage(`Profile "${newProfile.name}" created and activated! TabCoder is ready to use.`);
                } catch (error) {
                    logger.error('Error setting profile as default:', error);
                    vscode.window.showWarningMessage(`Profile "${newProfile.name}" created successfully, but failed to activate: ${error instanceof Error ? error.message : error}`);
                }
            } else {
                vscode.window.showInformationMessage(`Profile "${newProfile.name}" created successfully! Use "Switch Active Profile" to start using it.`);
            }
        } catch (error) {
            logger.error('Error creating profile via command:', error);
            const retry = await vscode.window.showErrorMessage(
                `Failed to create profile: ${error}`,
                'Try Again',
                'Cancel'
            );

            if (retry === 'Try Again') {
                await this.createProfile();
            }
        }
    }

    async askForModel(conn: ProviderConnection): Promise<string> {
        // Load models for the selected provider.
        const qp = vscode.window.createQuickPick();
        qp.title = 'Create New AI Profile - Step 4 of 5';
        qp.placeholder = 'Loading available models from your provider...';
        qp.items = [{
            label: '$(loading~spin) Loading models...',
            description: 'This may take a few seconds',
            detail: 'Connecting to your AI provider to fetch available models'
        }];
        qp.ignoreFocusOut = true;
        qp.busy = true;
        qp.show();

        let models: any[] = [];
        try {
            models = await listModelsFromProviderConnection(conn);
        } catch (error) {
            logger.error('Error loading models:', error);
            qp.items = [{
                label: '$(error) Connection Failed',
                description: 'Could not connect to your AI provider',
                detail: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
            }];
            qp.placeholder = 'Connection failed - please check your settings';
            qp.busy = false;

            // Wait for user acknowledgment before closing.
            await new Promise<void>((resolve) => {
                qp.onDidHide(() => {
                    qp.dispose();
                    resolve();
                });
            });

            return '';
        }

        // Replace items as models are now loaded.
        if (models.length === 0) {
            qp.items = [{
                label: '$(warning) No models found',
                description: 'Your provider connection works, but no models are available',
                detail: 'This might be normal for some providers. You can continue with a custom model ID.'
            }];
            qp.placeholder = 'No models found - you may need to specify a model manually';
        } else {
            qp.items = models.map(model => ({
                label: model.name,
                id: model.id,
                description: `Model ID: ${model.id}`,
                detail: 'Select this model for code completions'
            }));
            qp.placeholder = `Choose from ${models.length} available models`;
        }
        qp.busy = false;

        // Wait for user to select a model.
        return await new Promise<string>((resolve) => {
            qp.onDidAccept(() => {
                const selectedItems = qp.selectedItems;
                if (selectedItems.length > 0) {
                    const modelName = selectedItems[0].label;
                    const selectedModelId = models.find(m => m.name === modelName)?.id || '';
                    qp.hide();
                    resolve(selectedModelId);
                }
            });

            qp.onDidHide(() => {
                qp.dispose();
                resolve(''); // User cancelled or closed the picker
            });
        });
    }

    /**
     * Command: Set active configuration profile
     */
    public async setActiveProfile(): Promise<void> {
        try {
            const profiles = this.profileService.listProfiles();

            if (profiles.length === 0) {
                const createNew = await vscode.window.showInformationMessage(
                    'No AI profiles found. You need to create a profile first to use TabCoder.',
                    'Create Profile',
                    'Cancel'
                );
                if (createNew === 'Create Profile') {
                    await this.createProfile();
                }
                return;
            }

            const currentActiveProfile = await this.profileService.getActiveProfile();

            // Create quick pick items
            const profileItems = profiles.map(profile => ({
                label: `${profile.id === currentActiveProfile?.id ? '$(check) ' : ''}${profile.name}`,
                description: `${profile.provider} • ${profile.modelId}`,
                detail: profile.baseURL,
                profileId: profile.id
            }));

            // Add option to clear active profile
            profileItems.unshift({
                label: '$(circle-slash) Disable TabCoder',
                description: 'Turn off AI completions',
                detail: 'No active profile - TabCoder will be inactive',
                profileId: undefined as any
            });

            const selectedItem = await vscode.window.showQuickPick(profileItems, {
                title: 'Switch Active Profile',
                placeHolder: profiles.length > 0 ? 'Choose which profile to use for AI completions' : 'No profiles available',
                ignoreFocusOut: true,
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (!selectedItem) {
                return; // User cancelled
            }

            await this.profileService.setActiveProfileId(selectedItem.profileId);

            if (selectedItem.profileId) {
                const profileName = selectedItem.label.replace('$(check) ', '');
                vscode.window.showInformationMessage(`TabCoder is now using "${profileName}" for AI completions`);
            } else {
                vscode.window.showInformationMessage(`TabCoder has been disabled. No AI completions will be provided.`);
            }

        } catch (error) {
            logger.error('Error setting active profile via command:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to switch active profile: ${errorMessage}`);
        }
    }

    /**
     * Command: Remove a configuration profile
     */
    public async removeProfile(): Promise<void> {
        try {
            const profiles = this.profileService.listProfiles();

            if (profiles.length === 0) {
                vscode.window.showInformationMessage('No profiles found. There are no profiles to delete.');
                return;
            }

            const currentActiveProfile = await this.profileService.getActiveProfile();

            // Create quick pick items
            const profileItems = profiles.map(profile => ({
                label: `${profile.id === currentActiveProfile?.id ? '$(warning) ' : ''}${profile.name}`,
                description: `${profile.provider} • ${profile.modelId}`,
                detail: profile.id === currentActiveProfile?.id ?
                    `${profile.baseURL} • Currently active profile` :
                    profile.baseURL,
                profileId: profile.id
            }));

            const selectedItem = await vscode.window.showQuickPick(profileItems, {
                title: 'Delete Profile',
                placeHolder: 'Choose a profile to permanently delete',
                ignoreFocusOut: true,
                matchOnDescription: true
            });

            if (!selectedItem) {
                return; // User cancelled
            }

            // Confirm deletion
            const profileName = selectedItem.label.replace('$(warning) ', '');
            const isActiveProfile = selectedItem.profileId === currentActiveProfile?.id;
            const warningMessage = isActiveProfile
                ? `You are about to delete "${profileName}", which is currently your active profile.\n\nThis will:\n• Remove all configuration data\n• Disable TabCoder completions\n• Cannot be undone\n\nAre you sure?`
                : `Are you sure you want to delete the profile "${profileName}"?\n\nThis action cannot be undone.`;

            const result = await vscode.window.showWarningMessage(
                warningMessage,
                { modal: true },
                'Delete Profile',
                'Cancel'
            );

            if (result !== 'Delete Profile') {
                return; // User cancelled
            }

            await this.profileService.deleteProfile(selectedItem.profileId);

            if (isActiveProfile) {
                vscode.window.showInformationMessage(`Profile "${profileName}" deleted. TabCoder is now disabled.`);
            } else {
                vscode.window.showInformationMessage(`Profile "${profileName}" deleted successfully.`);
            }
            logger.info(`Profile removed via command: ${profileName}`);

        } catch (error) {
            logger.error('Error removing profile via command:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
            vscode.window.showErrorMessage(`Failed to delete profile: ${errorMessage}`);
        }
    }
}