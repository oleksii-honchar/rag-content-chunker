import { Injectable } from '@nestjs/common';
import * as os from 'os';
import * as path from 'path';
import { BasePinoLogger } from '../logging/base-pino-logger';

export interface ParsedCliArgs {
  config: string;
  verbose: boolean;
  help: boolean;
  version: boolean;
  dryRun: boolean;
  watch: boolean;
  forceReprocess: boolean;
  processOnly: boolean;
  source: string | null;
}

@Injectable()
export class CliArgsService {
  private static readonly HELP_TEXT = `
rag-content-chunker — RAG content chunker for semantic search

Usage:
  npx rag-content-chunker [options]

Options:
  -c, --config <path>       Path to configuration file (default: ~/.config/rag-content-chunker.yaml)
  -v, --verbose             Enable verbose logging
  --help, -h                Show this help message
  --version, -V             Show version information
  --dry-run                 Run without making changes (don't ingest to MCP)
  --watch                   Watch for file changes (default mode)
  --process-only            Process files once and exit (no watching)
  -f, --force-reprocess     Force re-process all sources
  -s, --source <id>         Specify source ID to process (use with --force-reprocess or --process-only)
`;

  private static readonly VERSION = '1.0.0';

  constructor(private readonly logger: BasePinoLogger) {}

  parse(args: string[]): ParsedCliArgs {
    const result: ParsedCliArgs = {
      config: path.join(os.homedir(), '.config', 'rag-content-chunker.yaml'),
      verbose: false,
      help: false,
      version: false,
      dryRun: false,
      watch: true,
      forceReprocess: false,
      processOnly: false,
      source: null,
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];

      switch (arg) {
        case '-c':
        case '--config':
          result.config = args[++i];
          break;
        case '-v':
        case '--verbose':
          result.verbose = true;
          break;
        case '-h':
        case '--help':
          result.help = true;
          break;
        case '-V':
        case '--version':
          result.version = true;
          break;
        case '--dry-run':
          result.dryRun = true;
          break;
        case '--watch':
          result.watch = true;
          break;
        case '--process-only':
          result.processOnly = true;
          result.watch = false;
          break;
        case '-f':
        case '--force-reprocess':
          result.forceReprocess = true;
          break;
        case '-s':
        case '--source':
          result.source = args[++i];
          break;
      }
    }

    return result;
  }

  showHelp(): void {
    process.stdout.write(CliArgsService.HELP_TEXT);
  }

  showVersion(): void {
    process.stdout.write(`rag-content-chunker v${CliArgsService.VERSION}\n`);
  }
}
