import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import { Chunk } from '../../domain/entities/chunk.entity';
import { Result } from '../../utils/result';
import { ConfigurationService } from '../config/configuration.service';
import { BasePinoLogger } from '../logging/base-pino-logger';

interface McpToolRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface McpToolResponse {
  jsonrpc?: string;
  id?: number;
  result?: {
    content?: { type?: string; text?: string }[];
  };
  error?: {
    code?: number;
    message?: string;
  };
}

@Injectable()
export class MnemosyneClient implements OnApplicationBootstrap {
  private readonly logger: BasePinoLogger;
  private readonly url: string;
  private readonly apiKey: string | undefined;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private connectionInitialized = false;

  constructor(
    private readonly configService: ConfigurationService,
    logger: BasePinoLogger,
  ) {
    this.logger = logger.child({ service: 'MnemosyneClient' });
    const mcpConfig = configService.getMcpConfig();
    this.url = mcpConfig.url;
    this.apiKey = mcpConfig.apiKey;
    this.timeoutMs = mcpConfig.timeoutMs;
    this.maxRetries = mcpConfig.maxRetries;
    this.retryDelayMs = mcpConfig.retryDelayMs;
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<Result<void>> {
    this.logger.info('Initializing Mnemosyne MCP client', { url: this.url });

    try {
      const healthResult = await this.healthCheck();
      if (healthResult.isOk() && healthResult.getValue()) {
        this.connectionInitialized = true;
        this.logger.info('Mnemosyne MCP client initialized successfully');
        return Result.ok(undefined as unknown as void);
      }
      this.logger.warn('Mnemosyne MCP health check failed, will retry on use');
      return Result.ok(undefined as unknown as void);
    } catch (error) {
      this.logger.error('Failed to initialize Mnemosyne MCP client', {
        error: error instanceof Error ? error.message : String(error),
      });
      return Result.ko(error instanceof Error ? error : new Error(String(error)));
    }
  }

  async remember(chunk: Chunk): Promise<Result<void>> {
    const request: McpToolRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'memory_remember',
        arguments: {
          text: chunk.text,
          metadata: {
            id: chunk.id,
            chunkIndex: chunk.chunkIndex,
            totalChunks: chunk.totalChunks,
            sectionHeader: chunk.sectionHeader,
            breadcrumb: chunk.breadcrumb,
            fileRole: chunk.fileRole,
            language: chunk.language,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            ...(chunk.metadata || {}),
          },
        },
      },
    };

    this.logger.debug('Remembering chunk', {
      chunkId: chunk.id,
      chunkIndex: chunk.chunkIndex,
      textLength: chunk.text.length,
    });

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.sendRequest(request);

        if (response.error) {
          this.logger.warn('MCP tool error', {
            chunkId: chunk.id,
            attempt,
            error: response.error.message,
          });
          lastError = new Error(`MCP error: ${response.error.message}`);
        } else if (response.result?.content) {
          this.logger.debug('Chunk remembered', {
            chunkId: chunk.id,
            attempt,
          });
          return Result.ok(undefined as unknown as void);
        } else {
          this.logger.warn('Unexpected MCP response', {
            chunkId: chunk.id,
            attempt,
            response,
          });
          lastError = new Error('Unexpected MCP response');
        }
      } catch (error) {
        this.logger.warn('Request failed, retrying', {
          chunkId: chunk.id,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        });
        lastError = error instanceof Error ? error : new Error(String(error));
      }

      if (attempt < this.maxRetries) {
        await this.delay(this.retryDelayMs * attempt);
      }
    }

    this.logger.error('Failed to remember chunk after all retries', {
      chunkId: chunk.id,
      retries: this.maxRetries,
      error: lastError?.message,
    });

    return Result.ko(lastError || new Error('Failed to remember chunk'));
  }

  async healthCheck(): Promise<Result<boolean>> {
    this.logger.debug('Health checking Mnemosyne MCP', { url: this.url });

    try {
      const response = await this.sendRequest({
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'ping',
        params: {},
      });

      const healthy = !response.error && response.result !== undefined;
      this.logger.debug('Health check result', { healthy });
      return Result.ok(healthy);
    } catch (error) {
      this.logger.debug('Health check failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return Result.ko(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private async sendRequest(request: McpToolRequest): Promise<McpToolResponse> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(this.url);
      const lib = parsedUrl.protocol === 'https:' ? https : http;

      const data = JSON.stringify(request);

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: parsedUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
      };

      const req = lib.request(options, res => {
        let responseData = '';

        res.on('data', (chunk: Buffer) => {
          responseData += chunk;
        });

        res.on('end', () => {
          try {
            const response = JSON.parse(responseData) as McpToolResponse;
            resolve(response);
          } catch (error) {
            reject(new Error(`Failed to parse MCP response: ${error}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.timeoutMs}ms`));
      });

      req.setTimeout(this.timeoutMs);
      req.write(data);
      req.end();
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
