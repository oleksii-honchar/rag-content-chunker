import { ConfigService } from '@nestjs/config';
import type { Params } from 'nestjs-pino';

import pkg from '../../../package.json';

export function pinoLoggerConfigFactory(configService: ConfigService): Params {
  const serviceName = pkg.name;

  const environment = configService.get<string>('nodeEnv') ?? process.env.NODE_ENV ?? 'development';

  const isProduction = environment === 'production';

  const logLevel = configService.get<string>('logging.level') ?? process.env.LOG_LEVEL ?? 'info';

  const verboseFromConfig = configService.get<boolean | string>('logging.verbose');

  const isLocalLogVerbose =
    verboseFromConfig === true ||
    String(verboseFromConfig).toLowerCase() === 'true' ||
    process.env.VERBOSE?.toLowerCase() === 'true';

  const pinoHttpOptions: {
    level: string;
    messageKey: string;
    timestamp: () => string;
    base: Record<string, unknown>;
    transport?: { target: string; options: Record<string, unknown> };
  } = {
    level: isLocalLogVerbose ? 'debug' : logLevel,
    messageKey: 'message',
    timestamp: () => `,"timestamp":"${new Date(Date.now()).toISOString()}"`,
    base: {
      environment,
      service: serviceName,
    },
  };

  if (!isProduction) {
    const pinoPrettyOptions: Record<string, unknown> = {
      colorize: true,
      messageKey: 'message',
      translateTime: 'yyyy-mm-dd HH:MM:ss',
      singleLine: false,
      ignore: 'pid,hostname',
    };

    if (!isLocalLogVerbose) {
      pinoPrettyOptions.include = 'level,name,message,timestamp';
    }

    pinoHttpOptions.transport = {
      target: 'pino-pretty',
      options: pinoPrettyOptions,
    };
  }

  return {
    pinoHttp: pinoHttpOptions as Params['pinoHttp'],
  };
}
