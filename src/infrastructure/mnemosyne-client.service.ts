import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import * as http from 'http';
import * as https from 'https';
import { Chunk } from '../domain/chunk.entity';
import { ErrorWithDetails } from '../utils/error-with-details';
import { Result } from '../utils/result';
import { ConfigurationService } from './config/configuration.service';
import { BasePinoLogger } from './logging/base-pino-logger';

interface McpToolRequest {
  jsonrpc: '2.0';
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface MnemosyneRecallResult {
  id?: string;
  content?: string;
  source?: string;
  score?: number;
}

interface McpToolResponse {
  jsonrpc?: string;
  id?: number;
  result?: {
    // Legacy/text content format
    content?: { type?: string; text?: string }[];
    // Mnemosyne recall response format
    results?: MnemosyneRecallResult[];
    // Fallback: allow any shape
    [key: string]: unknown;
  };
  error?: {
    code?: number;
    message?: string;
  };
}

@Injectable()
export class MnemosyneClient implements OnApplicationBootstrap {
  private logger!: BasePinoLogger;
  private baseUrl = '';
  private apiKey: string | undefined;
  private timeoutMs = 30000;
  private maxRetries = 3;
  private retryDelayMs = 1000;
  private sessionId: string | null = null;
  private sseRequest: http.ClientRequest | null = null;

  constructor(
    private readonly configService: ConfigurationService,
    logger: BasePinoLogger,
  ) {
    // Logger will be initialized with mcpEndpoint after config loads in ensureConfigLoaded()
    this.logger = logger;
    // Reading here would get DEFAULT_CONFIG because ConfigurationService.load() hasn't run yet.
    this.baseUrl = '';
    this.apiKey = undefined;
    this.timeoutMs = 30000;
    this.maxRetries = 3;
    this.retryDelayMs = 1000;
  }

  private ensureConfigLoaded(): void {
    if (!this.baseUrl) {
      const mcpConfig = this.configService.getMcpConfig();
      // Strip trailing /messages/ or /mcp if present — config should be base URL
      this.baseUrl = mcpConfig.url.replace(/(\/messages\/?|\/mcp\/?)$/, '');
      this.apiKey = mcpConfig.apiKey;
      this.timeoutMs = mcpConfig.timeoutMs;
      this.maxRetries = mcpConfig.maxRetries;
      this.retryDelayMs = mcpConfig.retryDelayMs;

      // Re-bind logger with component + mcpEndpoint for searchable context on all Mnemosyne logs
      this.logger = this.logger.child({ component: 'MnemosyneClient', mcpEndpoint: this.baseUrl });
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<Result<void>> {
    this.ensureConfigLoaded();
    this.logger.info(
      `Initializing Mnemosyne MCP client: baseUrl="${this.baseUrl}", timeoutMs=${this.timeoutMs}, maxRetries=${this.maxRetries}`,
    );

    try {
      const sessionResult = await this.establishSession();
      if (sessionResult.isOk()) {
        this.logger.info(
          `Mnemosyne MCP client initialized: baseUrl="${this.baseUrl}", sessionId="${this.sessionId}"`,
        );
        return Result.ok(undefined as unknown as void);
      }
      this.logger.warn(
        `Mnemosyne MCP SSE connection failed, will retry on use: ${sessionResult.getError().message}`,
      );
      // Non-fatal — retry on first use
      return Result.ok(undefined as unknown as void);
    } catch (error) {
      this.logger.error(
        `Failed to initialize Mnemosyne MCP client: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Result.ok(undefined as unknown as void);
    }
  }

  async remember(chunk: Chunk): Promise<Result<void>> {
    const request: McpToolRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'mnemosyne_remember',
        arguments: {
          content: chunk.text,
          source: 'chunk',
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

    this.logger.debug(
      `Remembering chunk: id="${chunk.id}", index=${chunk.chunkIndex}, textLength=${chunk.text.length}`,
    );

    let lastError: Error | null = null;

    this.ensureConfigLoaded();
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Ensure we have a session
        if (!this.sessionId) {
          const sessionResult = await this.establishSession();
          if (!sessionResult.isOk()) {
            lastError = sessionResult.getError();
            this.logger.warn(
              `Failed to establish session for remember: chunkId="${chunk.id}", attempt=${attempt}/${this.maxRetries}, error="${lastError.message}"`,
            );
            if (attempt < this.maxRetries) {
              await this.delay(this.retryDelayMs * attempt);
            }
            continue;
          }
        }

        const response = await this.sendRequest(request);

        if (response.error) {
          this.logger.warn(
            `MCP tool error: chunkId="${chunk.id}", attempt=${attempt}/${this.maxRetries}, error="${response.error.message}"`,
          );
          lastError = new ErrorWithDetails(`MCP error: ${response.error.message}`, 'McpToolError');
        } else if (response.result?.content) {
          this.logger.debug(`Chunk remembered; id="${chunk.id}", attempt=${attempt}`);
          return Result.ok(undefined as unknown as void);
        } else {
          this.logger.warn(`Unexpected MCP response; chunkId="${chunk.id}", attempt=${attempt}`);
          lastError = new ErrorWithDetails('Unexpected MCP response', 'UnexpectedMcpResponse');
        }
      } catch (error) {
        this.logger.warn(
          `Request failed, retrying: chunkId="${chunk.id}", attempt=${attempt}/${this.maxRetries}, error="${error instanceof Error ? error.message : String(error)}"`,
        );
        lastError = new ErrorWithDetails(
          error instanceof Error ? error.message : String(error),
          'McpRequestError',
        );
      }

      if (attempt < this.maxRetries) {
        await this.delay(this.retryDelayMs * attempt);
      }
    }

    this.logger.error(
      `Failed to remember chunk after ${this.maxRetries} retries: id="${chunk.id}", lastError="${lastError?.message}"`,
    );

    return Result.ko(lastError || new ErrorWithDetails('Failed to remember chunk', 'RememberChunkFailed'));
  }

  async healthCheck(): Promise<Result<boolean>> {
    this.ensureConfigLoaded();
    this.logger.debug(`Health checking Mnemosyne MCP; baseUrl="${this.baseUrl}"`);

    try {
      // Need a session to send any request
      const sessionResult = await this.establishSession();
      if (!sessionResult.isOk()) {
        return sessionResult.map(() => false);
      }

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
      this.logger.debug(`Health check failed: ${error instanceof Error ? error.message : String(error)}`);
      return Result.ko(
        new ErrorWithDetails(error instanceof Error ? error.message : String(error), 'HealthCheckError'),
      );
    }
  }

  /**
   * Recalls/searches stored memories — used for e2e verification that chunks were actually stored.
   * Retries if Mnemosyne returns async "accepted" response (queued retrieval).
   */
  async recall(query: string, maxRetries = 5, retryDelayMs = 1000): Promise<Result<string[]>> {
    this.ensureConfigLoaded();
    this.logger.debug(`Recalling memories; query="${query}"`);

    const request: McpToolRequest = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'mnemosyne_recall',
        arguments: { query, limit: 20 },
      },
    };

    try {
      // Ensure we have a session
      if (!this.sessionId) {
        const sessionResult = await this.establishSession();
        if (!sessionResult.isOk()) {
          return Result.ko(sessionResult.getError());
        }
      }

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const response = await this.sendRequest(request);

        if (response.error) {
          return Result.ko(new ErrorWithDetails(`MCP error: ${response.error.message}`, 'McpToolError'));
        }

        // Mnemosyne returns: { status: 'ok', count: N, results: [{ id, content, source, ... }] }
        const rawResults = response.result?.results;
        const results = Array.isArray(rawResults)
          ? rawResults.map(r => r?.content ?? '').filter(t => typeof t === 'string' && t.length > 0)
          : [];

        // Filter out async "accepted" placeholders — retry if all results are just "accepted"
        const actualResults = results.filter(r => r.toLowerCase() !== 'accepted');

        if (actualResults.length > 0) {
          this.logger.debug(`Recall returned ${actualResults.length} results for query="${query}"`);
          return Result.ok(actualResults);
        }

        if (attempt === maxRetries) {
          this.logger.debug(`Recall returned 0 results after ${maxRetries} attempts for query="${query}"`);
          return Result.ok([]);
        }

        this.logger.debug(`Recall returned empty, retrying: attempt=${attempt}/${maxRetries}`);
        await this.delay(retryDelayMs * attempt);
      }

      return Result.ok([]);
    } catch (error) {
      return Result.ko(
        new ErrorWithDetails(error instanceof Error ? error.message : String(error), 'RecallError'),
      );
    }
  }

  /**
   * Establishes an SSE session with Mnemosyne MCP.
   * GET /sse → receive event: endpoint\ndata: /messages/?session_id=xxx
   */
  private async establishSession(): Promise<Result<string>> {
    return new Promise(resolve => {
      const parsedUrl = new URL(this.baseUrl);
      const lib = parsedUrl.protocol === 'https:' ? https : http;

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: '/sse',
        method: 'GET',
        headers: {
          Accept: 'text/event-stream',
          ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
        },
      };

      let request: http.ClientRequest | null = null;
      request = lib.get(options, res => {
        let buffer = '';
        let sessionResolved = false;

        res.on('data', (chunk: Buffer) => {
          buffer += chunk.toString();

          // Parse SSE events
          const lines = buffer.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: /messages/?session_id=')) {
              const endpoint = line.slice(5).trim();
              const sessionId = this.extractSessionId(endpoint);
              if (sessionId && !sessionResolved) {
                sessionResolved = true;
                this.sessionId = sessionId;
                // Keep SSE connection alive — session may be invalidated if closed
                this.sseRequest = request;
                resolve(Result.ok(sessionId));
                return;
              }
            }
          }
        });

        res.on('end', () => {
          this.sseRequest = null;
          if (!this.sessionId && !sessionResolved) {
            resolve(
              Result.ko(new ErrorWithDetails('No session_id received from SSE endpoint', 'SseSessionError')),
            );
          }
        });

        res.on('error', error => {
          this.sseRequest = null;
          if (!this.sessionId && !sessionResolved) {
            resolve(
              Result.ko(
                new ErrorWithDetails(
                  error instanceof Error ? error.message : String(error),
                  'SseStreamError',
                ),
              ),
            );
          }
        });
      });

      request.on('error', error => {
        // sessionResolved check moved inside callback to be in scope
        if (!this.sessionId) {
          resolve(
            Result.ko(
              new ErrorWithDetails(
                error instanceof Error ? error.message : String(error),
                'SseConnectionError',
              ),
            ),
          );
        }
      });

      request?.setTimeout(this.timeoutMs, () => {
        request?.destroy();
        resolve(
          Result.ko(new ErrorWithDetails(`SSE connection timeout after ${this.timeoutMs}ms`, 'SseTimeout')),
        );
      });
    });
  }

  private extractSessionId(endpoint: string): string | null {
    try {
      const url = new URL(endpoint, this.baseUrl);
      return url.searchParams.get('session_id');
    } catch {
      // Fallback: try to extract from query string directly
      const match = endpoint.match(/[?&]session_id=([^&]+)/);
      return match ? match[1] : null;
    }
  }

  private async sendRequest(request: McpToolRequest): Promise<McpToolResponse> {
    if (!this.sessionId) {
      throw new ErrorWithDetails('No session established', 'NoSessionError');
    }

    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(this.baseUrl);
      const lib = parsedUrl.protocol === 'https:' ? https : http;

      const data = JSON.stringify(request);

      const options: http.RequestOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port,
        path: `/messages/?session_id=${this.sessionId}`,
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
          // Non-2xx: reject with status + body snippet
          if (res.statusCode === undefined || res.statusCode < 200 || res.statusCode >= 300) {
            const snippet = responseData.slice(0, 200).replace(/\n/g, ' ');
            reject(new ErrorWithDetails(`HTTP ${res.statusCode}: ${snippet}`, 'McpHttpError'));
            return;
          }
          // Handle async Accepted response — Mnemosyne may return plain text "Accepted" instead of JSON-RPC
          if (responseData.trim().toLowerCase() === 'accepted') {
            this.logger.debug(`Received Accepted response (HTTP ${res.statusCode}) for async operation`);
            resolve({ result: { content: [{ type: 'text', text: 'accepted' }] } });
            return;
          }
          try {
            const response = JSON.parse(responseData) as McpToolResponse;
            resolve(response);
          } catch (error) {
            const snippet = responseData.slice(0, 200).replace(/\n/g, ' ');
            reject(
              new ErrorWithDetails(
                `Failed to parse MCP response (HTTP ${res.statusCode}): ${error}. Body: "${snippet}"`,
                'McpParseError',
              ),
            );
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new ErrorWithDetails(`Request timeout after ${this.timeoutMs}ms`, 'McpTimeout'));
      });

      req.setTimeout(this.timeoutMs);
      req.write(data);
      req.end();
    });
  }

  /**
   * Closes the SSE connection and clears session state.
   */
  async close(): Promise<void> {
    this.logger.info('Closing Mnemosyne MCP client');
    if (this.sseRequest) {
      this.sseRequest.destroy();
      this.sseRequest = null;
    }
    this.sessionId = null;
    this.logger.info('Mnemosyne MCP client closed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
