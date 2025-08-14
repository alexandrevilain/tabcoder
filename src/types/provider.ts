export type ProviderID = 'openai' | 'openrouter' | 'kilocode' | 'ollama' | 'ovhcloud' | 'groq' | 'mistral' | 'mistral-codestral' | 'openai-compatible';

export type Provider = {
  id: ProviderID;
  name: string;
  defaultBaseURL: string;
}