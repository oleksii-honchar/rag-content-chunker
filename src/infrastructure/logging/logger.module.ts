import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';
import pino from 'pino';

import { BasePinoLogger } from './base-pino-logger';
import { NestjsPinoLogger } from './nestjs-pino-logger';
import { pinoLoggerConfigFactory } from './pino-logger-config.factory';

@Global()
@Module({})
export class LoggingModule {
  static forRootAsync(): DynamicModule {
    return {
      module: LoggingModule,
      imports: [
        PinoLoggerModule.forRootAsync({
          inject: [ConfigService],
          useFactory: pinoLoggerConfigFactory,
        }),
      ],
      providers: [
        {
          provide: BasePinoLogger,
          useFactory: (configService: ConfigService) => {
            // Get the same pinoHttp config that LoggerModule uses
            const params = pinoLoggerConfigFactory(configService);
            const pinoHttpConfig = params.pinoHttp as Record<string, unknown>;

            const isTest = process.env.NODE_ENV === 'test';
            const level = String(pinoHttpConfig?.level ?? 'info');
            const base = pinoHttpConfig?.base ?? { service: 'rag-content-chunker' };

            // In test env: simple logger, no transports (avoids worker thread issues)
            if (isTest) {
              const logger = pino({ level, base });
              return new NestjsPinoLogger(logger);
            }

            // Production: include transport config
            const logger = pino({
              level,
              base,
              transport: pinoHttpConfig?.transport as pino.TransportMultiOptions | undefined,
            });
            return new NestjsPinoLogger(logger);
          },
          inject: [ConfigService],
        },
      ],
      exports: [BasePinoLogger],
    };
  }
}
