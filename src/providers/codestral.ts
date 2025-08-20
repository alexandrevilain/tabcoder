import { ProfileWithAPIKey, ProviderConnection, Model } from "../types";
import { type LanguageModelV2 } from "@ai-sdk/provider";
import { LanguageModelProvider } from "./providers";
import { createMistralFim } from 'ai-sdk-mistral-fim';

export class CodestralProvider implements LanguageModelProvider {
    languageModel(profile: ProfileWithAPIKey): LanguageModelV2 {
        return createMistralFim({
            baseURL: profile.baseURL,
            apiKey: profile.apiKey,
        })(profile.modelId);
    }

    async listModels(_conn: ProviderConnection): Promise<Model[]> {
        return new Promise((resolve) => {
            resolve([
                {
                    id: 'codestral-latest',
                    name: 'codestral-latest'
                },
            ]);
        });
    }
}
