import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import type { Params } from 'nestjs-pino';
import * as os from 'os';
import * as path from 'path';

import pkg from '../../../package.json';

const LOG_DIR = path.join(os.homedir(), '.local', 'share', 'rag-content-chunker', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'rag-content-chunker.log');

function ensureLogDir(): void {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

export function pinoLoggerConfigFactory(configService: ConfigService): Params {
  const serviceName = pkg.name;

  const environment = configService.get<string>('nodeEnv') ?? process.env.NODE_ENV ?? 'development';
  const isTestEnv = environment === 'test';

  const logLevel = configService.get<string>('logging.level') ?? process.env.LOG_LEVEL ?? 'info';

  const verboseFromConfig = configService.get<boolean | string>('logging.verbose');

  const isLocalLogVerbose =
    verboseFromConfig === true ||
    String(verboseFromConfig).toLowerCase() === 'true' ||
    process.env.VERBOSE?.toLowerCase() === 'true';

  if (!isTestEnv) {
    ensureLogDir();
  }

  // Test env: simple JSON logger without transports (avoids worker thread issues)
  if (isTestEnv) {
    return {
      pinoHttp: {
        level: 'warn',
        messageKey: 'message',
        base: { service: serviceName, environment },
      },
    } as Params;
  }

  const pinoHttpOptions: {
    level: string;
    messageKey: string;
    timestamp: () => string;
    base: Record<string, unknown>;
    transport?: {
      targets: { target: string; options: Record<string, unknown>; level?: string }[];
    };
  } = {
    level: isLocalLogVerbose ? 'debug' : logLevel,
    messageKey: 'message',
    timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
    base: {
      environment,
      service: serviceName,
    },
  };

  const transports: { target: string; options: Record<string, unknown>; level?: string }[] = [];

  // Console transport: pretty-printed for terminal
  transports.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      messageKey: 'message',
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      singleLine: false,
      ignore: 'pid,hostname',
      ...(isLocalLogVerbose ? {} : { include: 'level,name,message,timestamp' }),
    },
  });

  // File transport: JSON, line-delimited, with rotation (1000 lines, 10 files)
  transports.push({
    target: 'pino-roll',
    options: {
      destination: LOG_FILE,
      size: '1000',
      maxFiles: 10,
      sync: false,
      mkdir: true,
    },
    level: logLevel,
  });

  pinoHttpOptions.transport = { targets: transports };

  return {
    pinoHttp: pinoHttpOptions as Params['pinoHttp'],
  };
}
