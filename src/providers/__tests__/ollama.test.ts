import { expect } from 'chai';
import { ProfileWithAPIKey, ProviderConnection } from '../../types/profile';
import { OllamaProvider } from '../ollama';
import * as sinon from 'sinon';

suite('OllamaProvider', () => {
    let sandbox: sinon.SinonSandbox;
    let provider: OllamaProvider;

    setup(() => {
        sandbox = sinon.createSandbox();
        provider = new OllamaProvider();
    });
    
    teardown(() => {
        sandbox.restore();
    });

    test('languageModel() should return a language model with correct configuration', () => {
        const mockProfile: ProfileWithAPIKey = {
            id: 'test-profile',
            name: 'Test Profile',
            provider: 'ollama',
            baseURL: 'http://localhost:11434',
            modelId: 'llama2',
            apiKey: 'not-used-for-ollama'
        };

        const languageModel = provider.languageModel(mockProfile);
        
        expect(languageModel).to.be.an('object');
        expect(languageModel).to.have.property('modelId');
        expect(languageModel.modelId).to.equal('llama2');
    });

    test('languageModel() should handle different baseURL formats', () => {
        const profileWithPort: ProfileWithAPIKey = {
            id: 'test-profile',
            name: 'Test Profile',
            provider: 'ollama',
            baseURL: 'http://192.168.1.100:11434',
            modelId: 'llama2',
            apiKey: 'not-used-for-ollama'
        };

        const languageModel = provider.languageModel(profileWithPort);
        expect(languageModel.modelId).to.equal('llama2');
    });

    test('languageModel() should handle empty strings gracefully', () => {
        const profileWithEmptyValues: ProfileWithAPIKey = {
            id: 'test-profile',
            name: 'Test Profile',
            provider: 'ollama',
            baseURL: '',
            modelId: '',
            apiKey: 'not-used-for-ollama'
        };

        const languageModel = provider.languageModel(profileWithEmptyValues);
        expect(languageModel.modelId).to.equal('');
    });

    test('languageModel() should create different instances for different profiles', () => {
        const profile1: ProfileWithAPIKey = {
            id: 'test-profile-1',
            name: 'Test Profile 1',
            provider: 'ollama',
            baseURL: 'http://localhost:11434',
            modelId: 'llama2',
            apiKey: 'not-used-for-ollama'
        };

        const profile2: ProfileWithAPIKey = {
            id: 'test-profile-2',
            name: 'Test Profile 2',
            provider: 'ollama',
            baseURL: 'http://localhost:11435',
            modelId: 'codellama',
            apiKey: 'not-used-for-ollama'
        };
        
        const model1 = provider.languageModel(profile1);
        const model2 = provider.languageModel(profile2);
        
        expect(model1.modelId).to.equal('llama2');
        expect(model2.modelId).to.equal('codellama');
        expect(model1).to.not.equal(model2);
    });

    test('languageModel() should handle special characters in modelId', () => {
        const profileWithSpecialChars: ProfileWithAPIKey = {
            id: 'test-profile',
            name: 'Test Profile',
            provider: 'ollama',
            baseURL: 'http://localhost:11434',
            modelId: 'model-with-special_chars:latest',
            apiKey: 'not-used-for-ollama'
        };
        
        const languageModel = provider.languageModel(profileWithSpecialChars);
        expect(languageModel.modelId).to.equal('model-with-special_chars:latest');
    });

    suite('listModels', () => {
        let fetchStub: sinon.SinonStub;

        setup(() => {
            fetchStub = sandbox.stub(global, 'fetch');
        });

        test('listModels should return models on successful API response', async () => {
            const mockConnection: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://localhost:11434',
                apiKey: 'not-used-for-ollama'
            };

            const mockResponse = {
                models: [
                    {
                        name: 'llama2:latest',
                        model: 'llama2:latest',
                        modified_at: '2023-12-07T09:32:18.757212583Z',
                        size: 3825819519,
                        digest: 'sha256:bc07c81de745696fdf5afca05e065818a8149fb0c77266fb584d9b2cba3711ab',
                        details: {}
                    },
                    {
                        name: 'codellama:7b',
                        model: 'codellama:7b',
                        modified_at: '2023-12-07T09:32:18.757212583Z',
                        size: 3825819519,
                        digest: 'sha256:8fdf8f752f6e56a5b44c96c4416baf8c59c4fa29f9f2f2e3c5b8a1c2d3e4f5g6',
                        details: {}
                    }
                ]
            };

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const result = await provider.listModels(mockConnection);

            expect(fetchStub.calledOnce).to.be.true;
            expect(fetchStub.firstCall.args[0]).to.equal('http://localhost:11434/api/tags');
            expect(fetchStub.firstCall.args[1]).to.deep.include({
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            expect(result).to.have.length(2);
            expect(result[0]).to.deep.equal({ id: 'llama2:latest', name: 'llama2:latest' });
            expect(result[1]).to.deep.equal({ id: 'codellama:7b', name: 'codellama:7b' });
        });

        test('listModels should return empty array when API response has no models field', async () => {
            const mockConnection: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://localhost:11434',
                apiKey: 'not-used-for-ollama'
            };

            const mockResponse = {
                data: [
                    { id: 'llama2:latest', name: 'llama2:latest' }
                ]
            };

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const result = await provider.listModels(mockConnection);

            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        test('listModels should return empty array when models field is not an array', async () => {
            const mockConnection: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://localhost:11434',
                apiKey: 'not-used-for-ollama'
            };

            const mockResponse = {
                models: 'not-an-array'
            };

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const result = await provider.listModels(mockConnection);

            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        test('listModels should return empty array when models field is null', async () => {
            const mockConnection: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://localhost:11434',
                apiKey: 'not-used-for-ollama'
            };

            const mockResponse = {
                models: null
            };

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const result = await provider.listModels(mockConnection);

            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        test('listModels should handle HTTP 404 error', async () => {
            const mockConnection: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://localhost:11434',
                apiKey: 'not-used-for-ollama'
            };

            fetchStub.resolves({
                ok: false,
                status: 404,
                json: async () => ({ error: 'Not Found' })
            });

            const result = await provider.listModels(mockConnection);

            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        test('listModels should handle HTTP 500 error', async () => {
            const mockConnection: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://localhost:11434',
                apiKey: 'not-used-for-ollama'
            };

            fetchStub.resolves({
                ok: false,
                status: 500,
                json: async () => ({ error: 'Internal Server Error' })
            });

            const result = await provider.listModels(mockConnection);

            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        test('listModels should handle network errors', async () => {
            const mockConnection: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://localhost:11434',
                apiKey: 'not-used-for-ollama'
            };

            fetchStub.rejects(new Error('Network error'));

            const result = await provider.listModels(mockConnection);

            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        test('listModels should handle JSON parsing errors', async () => {
            const mockConnection: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://localhost:11434',
                apiKey: 'not-used-for-ollama'
            };

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => {
                    throw new Error('Invalid JSON');
                }
            });

            const result = await provider.listModels(mockConnection);

            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        test('listModels should handle empty response models array', async () => {
            const mockConnection: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://localhost:11434',
                apiKey: 'not-used-for-ollama'
            };

            const mockResponse = {
                models: []
            };

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const result = await provider.listModels(mockConnection);

            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        test('listModels should handle models with missing fields', async () => {
            const mockConnection: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://localhost:11434',
                apiKey: 'not-used-for-ollama'
            };

            const mockResponse = {
                models: [
                    {
                        name: 'llama2:latest',
                        model: 'llama2:latest',
                        modified_at: '2023-12-07T09:32:18.757212583Z',
                        size: 3825819519,
                        digest: 'sha256:bc07c81de745696fdf5afca05e065818a8149fb0c77266fb584d9b2cba3711ab',
                        details: {}
                    },
                    {
                        // Missing name field
                        model: 'codellama:7b',
                        modified_at: '2023-12-07T09:32:18.757212583Z',
                        size: 3825819519,
                        digest: 'sha256:8fdf8f752f6e56a5b44c96c4416baf8c59c4fa29f9f2f2e3c5b8a1c2d3e4f5g6',
                        details: {}
                    },
                    {
                        name: 'mistral:latest',
                        // Missing model field
                        modified_at: '2023-12-07T09:32:18.757212583Z',
                        size: 3825819519,
                        digest: 'sha256:9fdf8f752f6e56a5b44c96c4416baf8c59c4fa29f9f2f2e3c5b8a1c2d3e4f5g7',
                        details: {}
                    }
                ]
            };

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const result = await provider.listModels(mockConnection);

            expect(result).to.have.length(3);
            expect(result[0]).to.deep.equal({ id: 'llama2:latest', name: 'llama2:latest' });
            expect(result[1]).to.deep.equal({ id: 'codellama:7b', name: undefined });
            expect(result[2]).to.deep.equal({ id: undefined, name: 'mistral:latest' });
        });

        test('listModels should handle different baseURL formats', async () => {
            const connectionWithPort: ProviderConnection = {
                id: 'ollama',
                baseURL: 'http://192.168.1.100:11434',
                apiKey: 'not-used-for-ollama'
            };
            
            const mockResponse = { models: [] };
            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            await provider.listModels(connectionWithPort);

            expect(fetchStub.firstCall.args[0]).to.equal('http://192.168.1.100:11434/api/tags');
        });
    });
});