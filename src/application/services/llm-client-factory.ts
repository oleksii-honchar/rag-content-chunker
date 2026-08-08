import { createOpenAI } from '@ai-sdk/openai';
import type { MastraLanguageModel, MastraLegacyLanguageModel } from '@mastra/core/agent';

export interface EnrichmentConfigForLlm {
  enabled: boolean;
  llmUrl: string;
  llmModel: string;
  apiKey: string;
}

export class LlmClientFactory {
  static createCustomLlm(
    config: EnrichmentConfigForLlm,
  ): MastraLegacyLanguageModel | MastraLanguageModel | null {
    if (!config.enabled || !config.llmUrl || !config.apiKey) {
      return null;
    }
    const customOpenAI = createOpenAI({
      apiKey: config.apiKey,
      baseURL: config.llmUrl,
    });
    return customOpenAI(config.llmModel);
  }
}
