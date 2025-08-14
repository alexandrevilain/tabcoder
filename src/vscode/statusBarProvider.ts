import * as vscode from 'vscode';
import { ProfileService } from '../services/profileService';

export class TabCoderStatusBarProvider {
    private statusBarItem: vscode.StatusBarItem;
    private activeRequests: Set<number> = new Set();
    private profileService: ProfileService;
    private disposables: vscode.Disposable[] = [];

    constructor(profileService: ProfileService) {
        this.profileService = profileService;
        
        // Create status bar item in the right side of the status bar
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100 // Priority - higher numbers appear more to the left
        );
        this.statusBarItem.command = 'tabcoder.statusBarClicked';
        
        // Subscribe to profile changes
        this.disposables.push(
            this.profileService.onDidActiveProfileChange(this.updateStatusBar, this),
        );
        
        // Set initial state
        this.updateStatusBar();
        this.statusBarItem.show();
    }

    /**
     * Called when a completion request starts
     */
    public onCompletionStart(requestId: number): void {
        this.activeRequests.add(requestId);
        this.updateStatusBar();
    }

    /**
     * Called when a completion request ends successfully
     */
    public onCompletionEnd(requestId: number): void {
        this.activeRequests.delete(requestId);
        this.updateStatusBar();
    }
    /**
     * Update the status bar display based on current state
     */
    private async updateStatusBar(): Promise<void> {
        if (this.activeRequests.size > 0) {
            await this.showLoading();
        } else {
            await this.showIdle();
        }
    }

    /**
     * Show loading state with spinning icon
     */
    private async showLoading(): Promise<void> {
        const activeProfile = await this.profileService.getActiveProfile();
        const profileName = activeProfile ? activeProfile.name : 'No Profile';
        
        this.statusBarItem.text = `$(sync~spin) TabCoder: ${profileName}`;
        this.statusBarItem.tooltip = `TabCoder is generating completion (${this.activeRequests.size} active request${this.activeRequests.size > 1 ? 's' : ''})`;
    }

    /**
     * Show idle state
     */
    private async showIdle(): Promise<void> {
        const profiles = this.profileService.listProfiles();
        const activeProfile = await this.profileService.getActiveProfile();
        
        if (profiles.length === 0) {
            // No profile exist.
            this.statusBarItem.text = '$(code) TabCoder: No Profile';
            this.statusBarItem.tooltip = 'TabCoder - Click to configure profiles';
        } else if (!activeProfile) {
            // Profiles exist but no active profile.
            this.statusBarItem.text = '$(code) TabCoder: Disabled';
            this.statusBarItem.tooltip = 'TabCoder - Disabled, no active profile. Click to select a profile.';
        } else {
            // Active profile exists.
            this.statusBarItem.text = `$(code) TabCoder: ${activeProfile.name}`;
            this.statusBarItem.tooltip = `TabCoder - Active profile: ${activeProfile.name}`;
        }
    }

    /**
     * Handle status bar click
     */
    public async handleStatusBarClick(): Promise<void> {
        const profiles = this.profileService.listProfiles();
        const activeProfile = await this.profileService.getActiveProfile();
        
        if (profiles.length === 0) {
            // No profiles exist - show command to create profile
            await vscode.commands.executeCommand('tabcoder.createProfile');
        } else if (!activeProfile) {
            // Profiles exist but no active profile - show command to select profile
            await vscode.commands.executeCommand('tabcoder.setActiveProfile');
        } else {
            // Active profile exists - show profile management options
            const action = await vscode.window.showQuickPick([
                { label: '$(gear) Change Active Profile', command: 'tabcoder.setActiveProfile' },
                { label: '$(add) Create New Profile', command: 'tabcoder.createProfile' },
                { label: '$(trash) Remove Profile', command: 'tabcoder.removeProfile' }
            ], {
                placeHolder: `Current profile: ${activeProfile.name}`
            });
            
            if (action) {
                await vscode.commands.executeCommand(action.command);
            }
        }
    }

    /**
     * Get the number of active completion requests
     */
    public getActiveRequestCount(): number {
        return this.activeRequests.size;
    }

    /**
     * Check if there are any active completion requests
     */
    public hasActiveRequests(): boolean {
        return this.activeRequests.size > 0;
    }

    /**
     * Dispose of the status bar provider and clean up resources
     */
    public dispose(): void {
        this.statusBarItem.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}