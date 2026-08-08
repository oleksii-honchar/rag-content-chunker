import { EnrichmentConfigForLlm, LlmClientFactory } from './llm-client-factory';

const mockProvider = jest.fn((modelName: string) => ({ model: modelName, provider: 'mock-openai' }));

jest.mock('@ai-sdk/openai', () => ({
  createOpenAI: jest.fn(() => mockProvider),
}));

import { createOpenAI } from '@ai-sdk/openai';

const mockCreateOpenAI = createOpenAI as jest.Mock;

describe('LlmClientFactory', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCustomLlm', () => {
    const validConfig: EnrichmentConfigForLlm = {
      enabled: true,
      llmUrl: 'https://lite-llm.lan/v1',
      llmModel: 'puma-qwopus3.5-9b',
      apiKey: 'sk-test-key',
    };

    it('should return null when config.enabled is false', () => {
      const config: EnrichmentConfigForLlm = { ...validConfig, enabled: false };

      const result = LlmClientFactory.createCustomLlm(config);

      expect(result).toBeNull();
    });

    it('should return null when config.llmUrl is empty', () => {
      const config: EnrichmentConfigForLlm = { ...validConfig, llmUrl: '' };

      const result = LlmClientFactory.createCustomLlm(config);

      expect(result).toBeNull();
    });

    it('should return null when config.apiKey is empty', () => {
      const config: EnrichmentConfigForLlm = { ...validConfig, apiKey: '' };

      const result = LlmClientFactory.createCustomLlm(config);

      expect(result).toBeNull();
    });

    it('should return null when config.apiKey is missing', () => {
      const config: EnrichmentConfigForLlm = {
        ...validConfig,
        apiKey: '',
      };

      const result = LlmClientFactory.createCustomLlm(config);

      expect(result).toBeNull();
    });

    it('should return a MastraLanguageModel when config is valid', () => {
      const result = LlmClientFactory.createCustomLlm(validConfig);

      expect(result).not.toBeNull();
      expect(result).toEqual({ model: 'puma-qwopus3.5-9b', provider: 'mock-openai' });
    });

    it('should call createOpenAI with correct apiKey and baseURL', () => {
      LlmClientFactory.createCustomLlm(validConfig);

      expect(mockCreateOpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-test-key',
        baseURL: 'https://lite-llm.lan/v1',
      });
    });

    it('should pass config.llmModel to the OpenAI provider', () => {
      LlmClientFactory.createCustomLlm(validConfig);

      expect(mockProvider).toHaveBeenCalledWith('puma-qwopus3.5-9b');
    });
  });
});
