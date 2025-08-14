import { ProviderID } from "./provider";

export type Profile = {
  id: string;
  name: string;
  provider: ProviderID;
  baseURL: string;
  modelId: string;
}

export type ProfileWithAPIKey = Profile & { apiKey: string };

// Represents the minimal connection info needed to fetch models.
export interface ProviderConnection {
  id: ProviderID;
  baseURL: string;
  apiKey: string;
}