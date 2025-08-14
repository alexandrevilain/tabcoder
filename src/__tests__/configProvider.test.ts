import { expect } from 'chai';
import * as sinon from 'sinon';
import * as vscode from 'vscode';
import { ConfigurationProvider } from '../vscode/configProvider';

suite('ConfigurationProvider', () => {
  let sandbox: sinon.SinonSandbox;
  let configProvider: ConfigurationProvider;
  let mockConfig: any;

  setup(() => {
    sandbox = sinon.createSandbox();
    
    mockConfig = {
      get: sandbox.stub(),
      update: sandbox.stub().resolves()
    };
    
    sandbox.stub(vscode.workspace, 'getConfiguration').returns(mockConfig);
    configProvider = new ConfigurationProvider();
  });

  teardown(() => {
    sandbox.restore();
  });

  suite('saveConfiguration', () => {
    test('should save activeProfileId when explicitly set to undefined', async () => {
      // Setup: Mock current configuration
      mockConfig.get.withArgs('profiles', []).returns([]);
      mockConfig.get.withArgs('activeProfileId').returns('some-profile-id');

      // Test: Save configuration with activeProfileId explicitly set to undefined
      await configProvider.saveConfiguration({
        activeProfileId: undefined
      });

      // Verify: activeProfileId update was called with undefined
      expect(mockConfig.update.calledWith(
        'activeProfileId',
        undefined,
        vscode.ConfigurationTarget.Global
      )).to.be.true;
    });

    test('should not save activeProfileId when not provided in partial config', async () => {
      // Setup: Mock current configuration
      mockConfig.get.withArgs('profiles', []).returns([]);
      mockConfig.get.withArgs('activeProfileId').returns('some-profile-id');

      // Test: Save configuration without activeProfileId field
      await configProvider.saveConfiguration({
        profiles: []
      });

      // Verify: activeProfileId update was NOT called
      expect(mockConfig.update.calledWith(
        'activeProfileId',
        sinon.match.any,
        sinon.match.any
      )).to.be.false;
      
      // But profiles update should have been called
      expect(mockConfig.update.calledWith(
        'profiles',
        [],
        vscode.ConfigurationTarget.Global
      )).to.be.true;
    });

    test('should save activeProfileId when set to a valid string', async () => {
      // Setup: Mock current configuration
      mockConfig.get.withArgs('profiles', []).returns([]);
      mockConfig.get.withArgs('activeProfileId').returns(undefined);

      // Test: Save configuration with activeProfileId set to a string
      await configProvider.saveConfiguration({
        activeProfileId: 'new-profile-id'
      });

      // Verify: activeProfileId update was called with the string
      expect(mockConfig.update.calledWith(
        'activeProfileId',
        'new-profile-id',
        vscode.ConfigurationTarget.Global
      )).to.be.true;
    });
  });
});