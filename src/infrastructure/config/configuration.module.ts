import { Module } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';
import { LoggingModule } from '../logging/logger.module';

@Module({
  imports: [LoggingModule],
  providers: [
    ConfigurationService,
    {
      provide: 'CONFIG_FILE_PATH',
      useValue:
        process.env.RAG_CHUNKER_CONFIG ||
        `${process.env.HOME || ''}/.config/rag-content-chunker.yaml`,
    },
  ],
  exports: [ConfigurationService, 'CONFIG_FILE_PATH'],
})
export class ConfigurationModule {}
