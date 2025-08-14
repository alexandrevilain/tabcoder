import { ProfileWithAPIKey, ProviderConnection, Model } from "../types";
import { type LanguageModelV2 } from "@ai-sdk/provider";
import { LanguageModelProvider } from "./providers";
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { logger } from "../utils/logger";

interface OpenAIModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: Record<string, unknown>;
}

interface OpenAIModelList {
  data: OpenAIModel[];
}

export class OpenAICompatibleProvider implements LanguageModelProvider {
    languageModel(profile: ProfileWithAPIKey): LanguageModelV2 {
        return createOpenAICompatible({
            name: "",
            baseURL: profile.baseURL,
            apiKey: profile.apiKey,
        })(profile.modelId);
    }

    async listModels(conn: ProviderConnection): Promise<Model[]> {
        try {
            const response = await fetch(`${conn.baseURL}/models`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${conn.apiKey}`,
                    'Content-Type': 'application/json',
                },
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json() as OpenAIModelList;
            
            if (data.data && Array.isArray(data.data)) {
                return data.data.map((model: any) => ({
                    id: model.id,
                    name: model.id,
                }));
            }
            
            return [];
        } catch (error) {
            logger.error('Failed to fetch models:', error);
            return [];
        }
    }
}