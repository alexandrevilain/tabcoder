import { HoleFiller, PromptArgs, AutoCompleteContext } from "./holeFiller";

export class MistralFimHoleFiller implements HoleFiller {
    prompt(params: AutoCompleteContext): PromptArgs {
        return {
            prompt: params.textBeforeCursor,
            providerOptions: {
                'mistral.fim': {
                    suffix: params.textAfterCursor,
                }
            }
        };
    }
}
