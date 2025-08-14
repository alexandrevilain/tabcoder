import { ProfileWithAPIKey, ProviderConnection, Model } from "../types";
import { type LanguageModelV2 } from "@ai-sdk/provider";
import { LanguageModelProvider } from "./providers";
import { createOllama } from 'ai-sdk-ollama';
import { logger } from "../utils/logger";

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: Record<string, unknown>;
}

interface OllamaModelList {
  models: OllamaModel[];
}

export class OllamaProvider implements LanguageModelProvider {
    languageModel(profile: ProfileWithAPIKey): LanguageModelV2 {
        return createOllama({
            baseURL: profile.baseURL,
        })(profile.modelId);
    }

    async listModels(conn: ProviderConnection): Promise<Model[]> {
        try {
            const response = await fetch(`${conn.baseURL}/api/tags`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error, status: ${response.status}`);
            }

            const data = (await response.json()) as OllamaModelList;
            
            if (data.models && Array.isArray(data.models)) {
                return data.models.map((m) => ({
                    id: m.model,
                    name: m.name,
                }));
            }
            
            return [];
        } catch (error) {
            logger.error('Failed to fetch models:', error);
            return [];
        }
    }
}

