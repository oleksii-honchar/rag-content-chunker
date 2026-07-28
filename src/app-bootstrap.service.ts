import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigurationService } from './infrastructure/config/configuration.service';
import { BasePinoLogger } from './infrastructure/logging/base-pino-logger';

@Injectable()
export class AppBootstrapService implements OnApplicationBootstrap {
  constructor(
    private readonly configService: ConfigurationService,
    private readonly logger: BasePinoLogger,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.printConfigSummary();
  }

  private async printConfigSummary(): Promise<void> {
    this.logger.info('📋 Configuration Summary:');
    const watchSources = this.configService.getWatchSources();
    this.logger.info(`  Watch sources: ${watchSources.length}`);
    for (const source of watchSources) {
      this.logger.info(`    - ${source.id}: ${source.path}`);
    }
    this.logger.info(`  Chunking strategy: ${this.configService.getChunkingConfig().strategy}`);
    this.logger.info(
      `  Enrichment: ${this.configService.getEnrichmentConfig().enabled ? 'enabled' : 'disabled'}`,
    );
    this.logger.info(`  MCP endpoint: ${this.configService.getMcpConfig().url}`);
    this.logger.info(
      `  Telemetry: ${this.configService.getTelemetryConfig().enabled ? 'enabled' : 'disabled'}`,
    );
  }
}
