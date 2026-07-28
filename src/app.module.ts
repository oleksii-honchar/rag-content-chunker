import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { LoggerModule } from 'nestjs-pino';
import { AppBootstrapService } from './app-bootstrap.service';
import { DomainModule } from './domain/domain.module';
import { AppEventEmitter } from './infrastructure/app-event-emitter';
import { ConfigurationModule } from './infrastructure/config/configuration.module';
import { FileWatcherService } from './infrastructure/file-watcher.service';
import { GracefulShutdownService } from './infrastructure/graceful-shutdown.service';
import { LoggingModule } from './infrastructure/logging/logger.module';
import { pinoLoggerConfigFactory } from './infrastructure/logging/pino-logger-config.factory';
import { TelemetryModule } from './infrastructure/telemetry.module';

const configLoader = (): Record<string, unknown> => {
  const configPath = process.env.RAG_CONTENT_CHUNKER_CONFIG || '~/.config/rag-content-chunker.yaml';
  const resolvedPath = configPath.startsWith('~')
    ? require('path').join(require('os').homedir(), configPath.slice(1))
    : configPath;

  try {
    const yaml = require('js-yaml');
    const fs = require('fs');
    if (fs.existsSync(resolvedPath)) {
      const content = fs.readFileSync(resolvedPath, 'utf-8');
      return yaml.load(content) as Record<string, unknown>;
    }
  } catch (error) {
    // Config will be created by ConfigurationService
  }
  return {};
};

@Module({
  imports: [
    ConfigModule.forRoot({
      load: [configLoader],
      isGlobal: true,
      envFilePath: process.env.ENV_FILE || '.env',
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: pinoLoggerConfigFactory,
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    LoggingModule,
    ConfigurationModule,
    TelemetryModule,
    DomainModule,
  ],
  controllers: [],
  providers: [AppEventEmitter, AppBootstrapService, FileWatcherService, GracefulShutdownService],
})
export class AppModule {}
