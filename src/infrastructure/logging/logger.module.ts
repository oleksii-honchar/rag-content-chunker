import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { LoggerModule as PinoLoggerModule } from 'nestjs-pino';

import { BasePinoLogger } from './base-pino-logger';
import { NestjsPinoLogger } from './nestjs-pino-logger';
import { pinoLoggerConfigFactory } from './pino-logger-config.factory';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: pinoLoggerConfigFactory,
    }),
  ],
  providers: [
    {
      provide: BasePinoLogger,
      useClass: NestjsPinoLogger,
    },
  ],
  exports: [BasePinoLogger, PinoLoggerModule],
})
export class LoggingModule {}
