export type ProviderID = 'openai' | 'openrouter' | 'kilocode' | 'ollama' | 'ovhcloud' | 'groq' | 'openai-compatible';

export type Provider = {
  id: ProviderID;
  name: string;
  defaultBaseURL: string;
}