import { WatchSourceConfig } from '@/infrastructure/config/config-schemas';
import { SOURCE_STRATEGIES } from '@/infrastructure/config/source-strategies';
import { Injectable } from '@nestjs/common';
import { AgentSessionChunkingStrategy } from './agent-session-chunking.strategy';
import { BaseChunkingStrategy } from './base-chunking-strategy';
import { MastraChunkingService } from './mastra-chunking.service';
import { ObsidianChunkingStrategy } from './obsidian-chunking.strategy';

/**
 * Routes chunking requests to the appropriate ChunkingStrategy
 * based on the sourceConfig.strategy field.
 *
 * Routing:
 *   agent-sessions  → AgentSessionChunkingStrategy
 *   obsidian        → ObsidianChunkingStrategy
 *   content-aware   → MastraChunkingService (default)
 *   unknown / other → MastraChunkingService (fallback)
 */
@Injectable()
export class StrategyRouter {
  constructor(
    private readonly agentSessionStrategy: AgentSessionChunkingStrategy,
    private readonly obsidianStrategy: ObsidianChunkingStrategy,
    private readonly mastraStrategy: MastraChunkingService,
  ) {}

  selectStrategy(sourceConfig: WatchSourceConfig): BaseChunkingStrategy {
    const map: Record<string, BaseChunkingStrategy> = {
      [SOURCE_STRATEGIES.AGENT_SESSIONS]: this.agentSessionStrategy,
      [SOURCE_STRATEGIES.OBSIDIAN]: this.obsidianStrategy,
    };

    return map[sourceConfig.strategy] ?? this.mastraStrategy;
  }
}
