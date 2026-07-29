import { Module } from '@nestjs/common';
import { LoggerModule } from '../logging/logger.module';
import { ConfigurationService } from './configuration.service';

@Module({
  imports: [LoggerModule],
  providers: [
    ConfigurationService,
    {
      provide: 'CONFIG_FILE_PATH',
      useFactory: () => {
        const path =
          process.env.RAG_CONTENT_CHUNKER_CONFIG ||
          `${process.env.HOME || ''}/.config/rag-content-chunker.yaml`;
        console.error(
          '[CONFIG_MODULE] RAG_CONTENT_CHUNKER_CONFIG:',
          process.env.RAG_CONTENT_CHUNKER_CONFIG,
          '→ using:',
          path,
        );
        return path;
      },
    },
  ],
  exports: [ConfigurationService, 'CONFIG_FILE_PATH'],
})
export class ConfigurationModule { }
