import * as vscode from 'vscode';
import { Profile, Configuration } from '../types';
import { logger } from '../utils/logger';

export class ConfigurationProvider {
  constructor() {}

  public getConfiguration(): Configuration {
    const config = vscode.workspace.getConfiguration('tabcoder');

    return {
      profiles: config.get<Profile[]>('profiles', []),
      activeProfileId: config.get<string>('activeProfileId')
    };
  }

  public async saveConfiguration(partialConfig: Partial<Configuration>): Promise<void> {
    logger.info(`Attempting to save configuration:`, { partialConfig });
    
    const currentConfig = this.getConfiguration();
    const config = vscode.workspace.getConfiguration('tabcoder');
    
    // Merge the partial configuration with the current configuration
    const updatedConfig = { ...currentConfig, ...partialConfig };
    
    try {
      // Save each configuration item to GLOBAL settings
      logger.info(`Saving to global settings...`);
      
      if (partialConfig.hasOwnProperty('profiles')) {
        await config.update('profiles', updatedConfig.profiles, vscode.ConfigurationTarget.Global);
      }
      
      if (partialConfig.hasOwnProperty('activeProfileId')) {
        await config.update('activeProfileId', updatedConfig.activeProfileId, vscode.ConfigurationTarget.Global);
      }
      
      // Add other configuration items here as they're added.
      // if (partialConfig.configItem !== undefined) {
      //   await config.update('configItem', updatedConfig.configItem, vscode.ConfigurationTarget.Global);
      // }
      
      logger.info(`Successfully saved configuration`);
    } catch (error) {
      logger.error(`Error saving configuration:`, error);
      vscode.window.showErrorMessage(`Failed to save configuration: ${error}`);
      throw error;
    }
  }
}