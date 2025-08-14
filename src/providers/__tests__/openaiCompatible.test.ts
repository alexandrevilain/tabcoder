import { expect } from 'chai';
import { ProfileWithAPIKey, ProviderConnection } from '../../types/profile';
import { OpenAICompatibleProvider } from '../openaiCompatible';
import * as sinon from 'sinon';

suite('OpenAICompatibleProvider', () => {
    let sandbox: sinon.SinonSandbox;
    let provider: OpenAICompatibleProvider;

    setup(() => {
        sandbox = sinon.createSandbox();
        provider = new OpenAICompatibleProvider();
    });
    
    teardown(() => {
        sandbox.restore();
    });

    test('languageModel() should return a language model with correct configuration', () => {
        const mockProfile: ProfileWithAPIKey = {
            id: 'test-profile',
            name: 'Test Profile',
            provider: 'openai-compatible',
            baseURL: 'https://api.openai.com/v1',
            modelId: 'gpt-4',
            apiKey: 'test-api-key'
        };

        const languageModel = provider.languageModel(mockProfile);
        
        expect(languageModel).to.be.an('object');
        expect(languageModel).to.have.property('modelId');
        expect(languageModel.modelId).to.equal('gpt-4');
    });

    test('languageModel() should handle different baseURL formats', () => {
        const profileWithTrailingSlash: ProfileWithAPIKey = {
            id: 'test-profile',
            name: 'Test Profile',
            provider: 'openai-compatible',
            baseURL: 'https://api.custom.com/v1/',
            modelId: 'gpt-4',
            apiKey: 'test-api-key'
        };

        const languageModel = provider.languageModel(profileWithTrailingSlash);
        expect(languageModel.modelId).to.equal('gpt-4');
    });

    test('languageModel() should handle empty strings gracefully', () => {
        const profileWithEmptyValues: ProfileWithAPIKey = {
            id: 'test-profile',
            name: 'Test Profile',
            provider: 'openai-compatible',
            baseURL: '',
            modelId: '',
            apiKey: ''
        };

        const languageModel = provider.languageModel(profileWithEmptyValues);
        expect(languageModel.modelId).to.equal('');
    });

    test('languageModel() should create different instances for different profiles', () => {
        const profile1: ProfileWithAPIKey = {
            id: 'test-profile-1',
            name: 'Test Profile 1',
            provider: 'openai-compatible',
            baseURL: 'https://api.openai.com/v1',
            modelId: 'gpt-4',
            apiKey: 'test-api-key-1'
        };

        const profile2: ProfileWithAPIKey = {
            id: 'test-profile-2',
            name: 'Test Profile 2',
            provider: 'openai-compatible',
            baseURL: 'https://api.openai.com/v1',
            modelId: 'gpt-3.5-turbo',
            apiKey: 'test-api-key-2'
        };
        
        const model1 = provider.languageModel(profile1);
        const model2 = provider.languageModel(profile2);
        
        expect(model1.modelId).to.equal('gpt-4');
        expect(model2.modelId).to.equal('gpt-3.5-turbo');
        expect(model1).to.not.equal(model2);
    });

    test('languageModel() should handle special characters in modelId', () => {
        const profileWithSpecialChars: ProfileWithAPIKey = {
            id: 'test-profile',
            name: 'Test Profile',
            provider: 'openai-compatible',
            baseURL: 'https://api.openai.com/v1',
            modelId: 'model-with-special_chars.v1',
            apiKey: 'test-api-key'
        };
        
        const languageModel = provider.languageModel(profileWithSpecialChars);
        expect(languageModel.modelId).to.equal('model-with-special_chars.v1');
    });

    suite('listModels', () => {
        let fetchStub: sinon.SinonStub;

        setup(() => {
            fetchStub = sandbox.stub(global, 'fetch');
        });

        test('listModels should return models on successful API response', async () => {
            const mockConnection: ProviderConnection = {
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
            };

            const mockResponse = {
                data: [
                    { id: 'gpt-3.5-turbo', object: 'model' },
                    { id: 'gpt-4', object: 'model' },
                    { id: 'text-davinci-003', object: 'model' }
                ]
            };

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const result = await provider.listModels(mockConnection);

            expect(fetchStub.calledOnce).to.be.true;
            expect(fetchStub.firstCall.args[0]).to.equal('https://api.example.com/v1/models');
            expect(fetchStub.firstCall.args[1]).to.deep.include({
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer test-api-key',
                    'Content-Type': 'application/json'
                }
            });

            expect(result).to.have.length(3);
            expect(result[0]).to.deep.equal({ id: 'gpt-3.5-turbo', name: 'gpt-3.5-turbo' });
            expect(result[1]).to.deep.equal({ id: 'gpt-4', name: 'gpt-4' });
            expect(result[2]).to.deep.equal({ id: 'text-davinci-003', name: 'text-davinci-003' });
        });

        test('listModels should return empty array when API response has no data field', async () => {
            const mockConnection: ProviderConnection = {
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
            };

            const mockResponse = {
                models: [
                    { id: 'gpt-3.5-turbo', object: 'model' }
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

        test('listModels should return empty array when data field is not an array', async () => {
            const mockConnection: ProviderConnection = {
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
            };

            const mockResponse = {
                data: 'not-an-array'
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

        test('listModels should return empty array when data field is null', async () => {
            const mockConnection: ProviderConnection = {
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
            };

            const mockResponse = {
                data: null
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

        test('listModels should handle HTTP 401 error', async () => {
            const mockConnection: ProviderConnection = {
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
            };

            fetchStub.resolves({
                ok: false,
                status: 401,
                json: async () => ({ error: 'Unauthorized' })
            });

            const result = await provider.listModels(mockConnection);

            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        test('listModels should handle HTTP 404 error', async () => {
            const mockConnection: ProviderConnection = {
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
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
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
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
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
            };

            fetchStub.rejects(new Error('Network error'));

            const result = await provider.listModels(mockConnection);

            expect(result).to.be.an('array');
            expect(result).to.have.length(0);
        });

        test('listModels should handle JSON parsing errors', async () => {
            const mockConnection: ProviderConnection = {
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
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

        test('listModels should handle empty response data array', async () => {
            const mockConnection: ProviderConnection = {
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
            };

            const mockResponse = {
                data: []
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

        test('listModels should handle models with missing id field', async () => {
            const mockConnection: ProviderConnection = {
                id: 'openai-compatible',
                baseURL: 'https://api.example.com/v1',
                apiKey: 'test-api-key'
            };

            const mockResponse = {
                data: [
                    { id: 'gpt-3.5-turbo', object: 'model' },
                    { object: 'model' }, // Missing id field
                    { id: 'gpt-4', object: 'model' }
                ]
            };

            fetchStub.resolves({
                ok: true,
                status: 200,
                json: async () => mockResponse
            });

            const result = await provider.listModels(mockConnection);

            expect(result).to.have.length(3);
            expect(result[0]).to.deep.equal({ id: 'gpt-3.5-turbo', name: 'gpt-3.5-turbo' });
            expect(result[1]).to.deep.equal({ id: undefined, name: undefined });
            expect(result[2]).to.deep.equal({ id: 'gpt-4', name: 'gpt-4' });
        });
    });
});