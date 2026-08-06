// Mock @mastra/rag BEFORE importing the service
jest.mock('@mastra/rag', () => ({
  MDocument: class MockMDocument {
    static fromMarkdown = jest.fn();
    static fromJSON = jest.fn();
    static fromText = jest.fn();
    static fromHTML = jest.fn();
    extractMetadata = jest.fn();
    chunkMarkdown = jest.fn();
    chunkRecursive = jest.fn();
    chunkJSON = jest.fn();
    chunkSentence = jest.fn();
    getDocs = jest.fn();
    _chunks: unknown[] = [];
    _metadata: Record<string, string> = {};
    _textContent = '';
    constructor(content: string, metadata?: Record<string, unknown>) {
      this._textContent = content;
      this._metadata = (metadata as Record<string, string>) ?? {};
    }
  },
}));

import { WatchSourceConfig } from '@/infrastructure/config/config-schemas';
import { SOURCE_STRATEGIES } from '@/infrastructure/config/source-strategies';
import { AgentSessionChunkingStrategy } from './agent-session-chunking.strategy';
import { MastraChunkingService } from './mastra-chunking.service';
import { ObsidianChunkingStrategy } from './obsidian-chunking.strategy';
import { StrategyRouter } from './strategy-router.service';

describe('StrategyRouter', () => {
  let router: StrategyRouter;
  let mockAgentSessionStrategy: jest.Mocked<AgentSessionChunkingStrategy>;
  let mockObsidianStrategy: jest.Mocked<ObsidianChunkingStrategy>;
  let mockMastraStrategy: jest.Mocked<MastraChunkingService>;

  beforeEach(() => {
    mockAgentSessionStrategy = {
      chunkFile: jest.fn(),
    } as unknown as jest.Mocked<AgentSessionChunkingStrategy>;

    mockObsidianStrategy = {
      chunkFile: jest.fn(),
    } as unknown as jest.Mocked<ObsidianChunkingStrategy>;

    mockMastraStrategy = {
      chunkFile: jest.fn(),
    } as unknown as jest.Mocked<MastraChunkingService>;

    router = new StrategyRouter(mockAgentSessionStrategy, mockObsidianStrategy, mockMastraStrategy);
  });

  describe('selectStrategy', () => {
    it('should return AgentSessionChunkingStrategy for agent-sessions strategy', () => {
      const sourceConfig: WatchSourceConfig = {
        id: 'test',
        path: '/test',
        memoryBank: 'test',
        exclude: [],
        debounceMs: 3000,
        strategy: SOURCE_STRATEGIES.AGENT_SESSIONS,
      };

      const result = router.selectStrategy(sourceConfig);

      expect(result).toBe(mockAgentSessionStrategy);
    });

    it('should return ObsidianChunkingStrategy for obsidian strategy', () => {
      const sourceConfig: WatchSourceConfig = {
        id: 'test',
        path: '/test',
        memoryBank: 'test',
        exclude: [],
        debounceMs: 3000,
        strategy: SOURCE_STRATEGIES.OBSIDIAN,
      };

      const result = router.selectStrategy(sourceConfig);

      expect(result).toBe(mockObsidianStrategy);
    });

    it('should return MastraChunkingService for content-aware strategy', () => {
      const sourceConfig: WatchSourceConfig = {
        id: 'test',
        path: '/test',
        memoryBank: 'test',
        exclude: [],
        debounceMs: 3000,
        strategy: SOURCE_STRATEGIES.CONTENT_AWARE,
      };

      const result = router.selectStrategy(sourceConfig);

      expect(result).toBe(mockMastraStrategy);
    });

    it('should return MastraChunkingService as default for unknown strategy', () => {
      // Simulate an unknown strategy value by casting
      const sourceConfig = {
        id: 'test',
        path: '/test',
        memoryBank: 'test',
        exclude: [],
        debounceMs: 3000,
        strategy: 'unknown-strategy' as unknown as WatchSourceConfig['strategy'],
      };

      const result = router.selectStrategy(sourceConfig);

      expect(result).toBe(mockMastraStrategy);
    });

    it('should return MastraChunkingService when strategy is content-aware (default)', () => {
      const sourceConfig: WatchSourceConfig = {
        id: 'test',
        path: '/test',
        memoryBank: 'test',
        exclude: [],
        debounceMs: 3000,
        strategy: 'content-aware',
      };

      const result = router.selectStrategy(sourceConfig);

      expect(result).toBe(mockMastraStrategy);
    });
  });
});
