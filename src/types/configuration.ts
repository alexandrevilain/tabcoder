import { Profile } from "./profile";

// Generic configuration interface that can hold any configuration data.
export interface Configuration {
  profiles: Profile[];
  activeProfileId?: string;
}