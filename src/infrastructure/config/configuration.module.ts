import { Module } from '@nestjs/common';
import { LoggerModule } from '../logging/logger.module';
import { ConfigurationService } from './configuration.service';

@Module({
  imports: [LoggerModule],
  providers: [
    ConfigurationService,
    {
      provide: 'CONFIG_FILE_PATH',
      useValue:
        process.env.RAG_CONTENT_CHUNKER_CONFIG ||
        `${process.env.HOME || ''}/.config/rag-content-chunker.yaml`,
    },
  ],
  exports: [ConfigurationService, 'CONFIG_FILE_PATH'],
})
export class ConfigurationModule { }
