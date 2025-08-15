import { ProfileWithAPIKey, Provider, ProviderConnection, ProviderID, Model } from "../types";
import { OpenAICompatibleProvider } from "./openaiCompatible";
import { OllamaProvider } from "./ollama";
import { type LanguageModelV2 } from "@ai-sdk/provider";

export interface LanguageModelProvider {
    languageModel(profile: ProfileWithAPIKey): LanguageModelV2
    listModels(conn: ProviderConnection): Promise<Model[]>
}

function languageModelProvider(providerId: ProviderID): LanguageModelProvider {
    switch (providerId) {
        case 'openai':
        case 'openrouter':
        case 'kilocode':
        case 'ovhcloud':
        case 'groq':
        case 'openai-compatible':
        case 'mistral':
        case 'mistral-codestral': // TODO: we should support FIM endpoint.
            return new OpenAICompatibleProvider();
        case 'ollama':
            return new OllamaProvider();
        default:
            throw new Error(`Unsupported provider: ${providerId}`);
    }
}

export function listModelsFromProviderConnection(conn: ProviderConnection): Promise<Model[]> {
    return languageModelProvider(conn.id).listModels(conn);
}

export function getLanguageModelFromProfile(profile: ProfileWithAPIKey): LanguageModelV2 {
    return languageModelProvider(profile.provider).languageModel(profile);
}


export const providers: Provider[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    defaultBaseURL: 'https://api.openai.com/v1',
  },
  {
    id: "ollama",
    name: 'Ollama',
    defaultBaseURL: 'http://localhost:11434',
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI compatible provider',
    defaultBaseURL: '',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    defaultBaseURL: 'https://openrouter.ai/api/v1'
  },
  {
    id: 'kilocode',
    name: 'KiloCode',
    defaultBaseURL: 'https://kilocode.ai/api/openrouter'
  },
  {
    id: 'ovhcloud',
    name: "OVHcloud",
    defaultBaseURL: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1"
  },
  {
    id: 'groq',
    name: "Groq",
    defaultBaseURL: "https://api.groq.com/openai/v1"
  },
  {
    id: 'mistral',
    name: "Mistral",
    defaultBaseURL: "https://api.mistral.ai/v1"
  },
  {
    id: 'mistral-codestral',
    name: 'Codestral (mistral)',
    defaultBaseURL: "https://codestral.mistral.ai/v1"
  }
];