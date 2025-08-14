import * as vscode from 'vscode';
import {v4 as uuidv4} from 'uuid';
import { Profile, ProfileWithAPIKey } from '../types';
import { ConfigurationProvider } from '../vscode/configProvider';
import { logger } from '../utils/logger';

export class ProfileService {
    private context: vscode.ExtensionContext;
    private configProvider: ConfigurationProvider;

    private _onDidActiveProfileChange = new vscode.EventEmitter<void>();
    public readonly onDidActiveProfileChange = this._onDidActiveProfileChange.event;

    constructor(context: vscode.ExtensionContext, configProvider: ConfigurationProvider) {
        this.context = context;
        this.configProvider = configProvider;
    }

    /**
     * Generate a unique profile ID
     */
    public generateProfileId(): string {
        return uuidv4();
    }

    /**
     * Get API key securely from storage
     */
    public async getApiKey(profileId: string): Promise<string | undefined> {
        const apiKey = await this.context.secrets.get(`tabcoder.apiKey.${profileId}`);
        return apiKey;
    }

    /**
     * Store API key securely
     */
    public async setApiKey(profileId: string, apiKey: string): Promise<void> {
        await this.context.secrets.store(`tabcoder.apiKey.${profileId}`, apiKey);
        logger.info(`API key securely stored for profile ${profileId}`);
    }

    /**
     * Delete API key from secure storage
     */
    public async deleteApiKey(profileId: string): Promise<void> {
        await this.context.secrets.delete(`tabcoder.apiKey.${profileId}`);
        logger.info(`API key deleted for profile ${profileId}`);
    }

    /**
     * Create a new profile with API key
     */
    public async createProfile(
        profileData: ProfileWithAPIKey
    ): Promise<Profile> {
        const currentConfig = this.configProvider.getConfiguration();
        const newProfile: Profile = {
            id: this.generateProfileId(),
            name: profileData.name,
            provider: profileData.provider,
            baseURL: profileData.baseURL,
            modelId: profileData.modelId
        };

        // Store API key securely
        if (profileData.apiKey) {
            await this.setApiKey(newProfile.id, profileData.apiKey);
        }

        const updatedProfiles = [...currentConfig.profiles, newProfile];

        // Update configuration
        await this.configProvider.saveConfiguration({
            ...currentConfig,
            profiles: updatedProfiles
        });

        return newProfile;
    }

    /**
     * Delete a profile and its API key
     */
    public async deleteProfile(profileId: string): Promise<void> {
        const currentConfig = this.configProvider.getConfiguration();
        
        await this.deleteApiKey(profileId);

        const updatedProfiles = currentConfig.profiles.filter(p => p.id !== profileId);

        // Update configuration
        await this.configProvider.saveConfiguration({
            ...currentConfig,
            profiles: updatedProfiles,
        });

        // If the deleted profile was the active one, clear the active profile
        const activeProfileStillExists = updatedProfiles.some(p => p.id === currentConfig.activeProfileId);
        if (!activeProfileStillExists) {
            this.setActiveProfileId(undefined);
        }
    }

    /**
     * Update an existing profile
     */
    public async updateProfile(
        profileId: string,
        profileData: ProfileWithAPIKey
    ): Promise<Profile> {
        const currentConfig = this.configProvider.getConfiguration();
        const profileIndex = currentConfig.profiles.findIndex(p => p.id === profileId);
        
        if (profileIndex === -1) {
            throw new Error('Profile not found');
        }

        const updatedProfiles = [...currentConfig.profiles];
        updatedProfiles[profileIndex] = {
            ...updatedProfiles[profileIndex],
            name: profileData.name,
            provider: profileData.provider,
            baseURL: profileData.baseURL,
            modelId: profileData.modelId
        };

        // Update API key if provided
        if (profileData.apiKey) {
            await this.setApiKey(profileId, profileData.apiKey);
        }

        // Update configuration
        await this.configProvider.saveConfiguration({
            ...currentConfig,
            profiles: updatedProfiles
        });

        return updatedProfiles[profileIndex];
    }

    /**
     * Get active profile with API key
     */
    public async getActiveProfile(): Promise<ProfileWithAPIKey | undefined> {
        const config = this.configProvider.getConfiguration();
        const { profiles, activeProfileId } = config;
        
        if (!activeProfileId) {
            return undefined;
        }

        const activeProfile = profiles.find(p => p.id === activeProfileId);
        if (!activeProfile) {
            return undefined;
        }

        // Get API key securely
        const apiKey = await this.getApiKey(activeProfile.id);
        if (!apiKey && activeProfile.provider !== 'ollama') {
            return undefined;
        }

        return {
            ...activeProfile,
            apiKey: apiKey ?? "",
        };
    }

    /**
     * Set the active profile ID
     */
    public async setActiveProfileId(profileId: string | undefined): Promise<void> {
        const currentConfig = this.configProvider.getConfiguration();
        await this.configProvider.saveConfiguration({
            ...currentConfig,
            activeProfileId: profileId
        });
        this._onDidActiveProfileChange.fire();
    }

    /**
     * List all profiles
     */
    public listProfiles(): Profile[] {
        return this.configProvider.getConfiguration().profiles;
    }
}