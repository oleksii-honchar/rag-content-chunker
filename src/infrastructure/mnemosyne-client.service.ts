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
    // Legacy/text content format (MCP SDK wraps JSON in TextContent)
    content?: { type?: string; text?: string }[];
    // Mnemosyne recall response format (when parsed from content text)
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

  // SSE connection state
  private sseRes: http.IncomingMessage | null = null;
  private sseBuffer = '';
  private nextRequestId = 1;

  // Pending request handlers — keyed by request id
  private pendingRequests = new Map<
    number,
    { resolve: (value: McpToolResponse) => void; reject: (reason: Error) => void; timeout: NodeJS.Timeout }
  >();

  constructor(
    private readonly configService: ConfigurationService,
    logger: BasePinoLogger,
  ) {
    this.logger = logger;
  }

  private ensureConfigLoaded(): void {
    if (!this.baseUrl) {
      const mcpConfig = this.configService.getMcpConfig();
      this.baseUrl = mcpConfig.url.replace(/(\/messages\/?|\/mcp\/?)$/, '');
      this.apiKey = mcpConfig.apiKey;
      this.timeoutMs = mcpConfig.timeoutMs;
      this.maxRetries = mcpConfig.maxRetries;
      this.retryDelayMs = mcpConfig.retryDelayMs;
      this.logger = this.logger.child({ component: 'MnemosyneClient', mcpEndpoint: this.baseUrl });
    }
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.initialize();
  }

  async initialize(): Promise<Result<void>> {
    this.ensureConfigLoaded();
    this.logger.info(
      `Initializing Mnemosyne MCP client: baseUrl="${this.baseUrl}", timeoutMs=${this.timeoutMs}`,
    );

    try {
      const sessionResult = await this.establishSession();
      if (!sessionResult.isOk()) {
        this.logger.warn(
          `Mnemosyne MCP SSE connection failed, will retry on use: ${sessionResult.getError().message}`,
        );
        return Result.ok(undefined as unknown as void);
      }

      // MCP protocol requires initialize handshake before tool calls
      const initResult = await this.initializeProtocol();
      if (!initResult.isOk()) {
        this.logger.warn(`MCP init failed, will retry on use: ${initResult.getError().message}`);
        return Result.ok(undefined as unknown as void);
      }

      this.logger.info(
        `Mnemosyne MCP client initialized: baseUrl="${this.baseUrl}", sessionId="${this.sessionId}"`,
      );
      return Result.ok(undefined as unknown as void);
    } catch (error) {
      this.logger.error(
        `Failed to initialize Mnemosyne MCP client: ${error instanceof Error ? error.message : String(error)}`,
      );
      return Result.ok(undefined as unknown as void);
    }
  }

  /**
   * MCP initialize handshake — must be called after establishing SSE session,
   * before any tool calls.
   */
  private async initializeProtocol(): Promise<Result<void>> {
    const request: McpToolRequest = {
      jsonrpc: '2.0',
      id: this.nextRequestId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: {
          name: 'rag-content-chunker',
          version: '1.0.0',
        },
      },
    };

    try {
      const response = await this.sendRequest(request);
      if (response.error) {
        return Result.ko(new ErrorWithDetails(`MCP init error: ${response.error.message}`, 'McpInitError'));
      }

      // Send initialized notification
      await this.sendNotification({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
        params: {},
      });

      return Result.ok(undefined as unknown as void);
    } catch (error) {
      return Result.ko(
        new ErrorWithDetails(error instanceof Error ? error.message : String(error), 'McpInitError'),
      );
    }
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  private async sendNotification(notification: {
    jsonrpc: '2.0';
    method: string;
    params?: Record<string, unknown>;
  }): Promise<void> {
    if (!this.sessionId) {
      throw new ErrorWithDetails('No session established', 'NoSessionError');
    }

    const parsedUrl = new URL(this.baseUrl);
    const lib = parsedUrl.protocol === 'https:' ? https : http;

    const data = JSON.stringify(notification);

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

    await new Promise<void>((resolve, reject) => {
      const req = lib.request(options, res => {
        // Consume response body (fire-and-forget)
        res.on('data', () => {});
        res.on('end', () => resolve());
      });

      req.on('error', reject);
      req.setTimeout(this.timeoutMs, () => {
        req.destroy();
        resolve(); // Notifications are fire-and-forget
      });

      req.write(data);
      req.end();
    });
  }

  async remember(chunk: Chunk): Promise<Result<void>> {
    const request: McpToolRequest = {
      jsonrpc: '2.0',
      id: this.nextRequestId++,
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
        if (!this.sessionId) {
          const sessionResult = await this.establishSession();
          if (!sessionResult.isOk()) {
            lastError = sessionResult.getError();
            this.logger.warn(
              `Failed to establish session for remember: chunkId="${chunk.id}", attempt=${attempt}/${this.maxRetries}`,
            );
            if (attempt < this.maxRetries) {
              await this.delay(this.retryDelayMs * attempt);
            }
            continue;
          }
        }

        const response = await this.sendRequest(request);

        // Parse MCP response — result.content[0].text contains JSON string from Mnemosyne
        const parsed = this.parseMcpResponse(response);
        if (parsed.error) {
          const errMsg = typeof parsed.error === 'string' ? parsed.error : JSON.stringify(parsed.error);
          this.logger.warn(`MCP tool error: chunkId="${chunk.id}", error="${errMsg}"`);
          lastError = new ErrorWithDetails(errMsg, 'McpToolError');
        } else if (parsed.status === 'stored') {
          this.logger.debug(
            `Chunk remembered; id="${chunk.id}", memoryId="${parsed.memory_id}", attempt=${attempt}`,
          );
          return Result.ok(undefined as unknown as void);
        } else {
          this.logger.warn(
            `Unexpected remember response: chunkId="${chunk.id}", response="${JSON.stringify(parsed)}"`,
          );
          lastError = new ErrorWithDetails('Unexpected remember response', 'UnexpectedMcpResponse');
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
      const sessionResult = await this.establishSession();
      if (!sessionResult.isOk()) {
        return sessionResult.map(() => false);
      }

      const response = await this.sendRequest({
        jsonrpc: '2.0',
        id: this.nextRequestId++,
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

  async recall(query: string, maxRetries = 5, retryDelayMs = 1000): Promise<Result<string[]>> {
    this.ensureConfigLoaded();
    this.logger.debug(`Recalling memories; query="${query}"`);

    const request: McpToolRequest = {
      jsonrpc: '2.0',
      id: this.nextRequestId++,
      method: 'tools/call',
      params: {
        name: 'mnemosyne_recall',
        arguments: { query, limit: 20 },
      },
    };

    try {
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

        // Parse MCP response — result.content[0].text contains JSON string from Mnemosyne
        const parsed = this.parseMcpResponse(response);
        if (parsed.status === 'error') {
          const errMsg =
            (typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed.message)) ||
            'Recall error';
          return Result.ko(new ErrorWithDetails(errMsg, 'RecallError'));
        }

        const rawResults = parsed.results;
        const results = Array.isArray(rawResults)
          ? rawResults.map(r => r?.content ?? '').filter(t => typeof t === 'string' && t.length > 0)
          : [];

        if (results.length > 0) {
          this.logger.debug(`Recall returned ${results.length} results for query="${query}"`);
          return Result.ok(results);
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
   * Parse MCP SDK TextContent response — the MCP SDK wraps Mnemosyne's JSON result
   * in TextContent[].text, so we need to parse that inner JSON.
   */
  private parseMcpResponse(response: McpToolResponse): Record<string, unknown> {
    // MCP SDK returns result.content[0].text containing JSON string from Mnemosyne
    const contentItems = response.result?.content;
    if (Array.isArray(contentItems) && contentItems.length > 0) {
      const textContent = contentItems.find(c => c?.type === 'text')?.text;
      if (textContent) {
        try {
          return JSON.parse(textContent);
        } catch {
          // If text is not JSON, return it as-is
          return { text: textContent };
        }
      }
    }

    // Fallback: return response.result directly
    return (response.result ?? {}) as Record<string, unknown>;
  }

  /**
   * Establishes an SSE session with Mnemosyne MCP.
   * GET /sse → receive event: endpoint\ndata: /messages/?session_id=xxx
   * Then continuously reads SSE stream for event: message\ndata: <response>
   */
  private async establishSession(): Promise<Result<string>> {
    // Close existing SSE connection if any
    this.closeSseConnection();

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

      const request = lib.get(options, res => {
        this.sseRes = res;
        this.sseBuffer = '';
        let sessionResolved = false;

        res.on('data', (chunk: Buffer) => {
          this.sseBuffer += chunk.toString();
          // Extract session_id
          const sessionMatch = this.sseBuffer.match(/data: \/messages\/\?session_id=([a-f0-9]+)/);
          if (sessionMatch && !this.sessionId && !sessionResolved) {
            this.sessionId = sessionMatch[1];
            sessionResolved = true;
            // Start listening for message events
            this.startSseMessageListener();
            resolve(Result.ok(this.sessionId));
            return;
          }

          // Process message events if session is established
          if (this.sessionId) {
            this.processSseMessages();
          }
        });

        res.on('end', () => {
          this.sseRes = null;
          this.sseBuffer = '';
          this.rejectPendingRequests(new ErrorWithDetails('SSE connection closed', 'SseConnectionClosed'));
          if (!this.sessionId && !sessionResolved) {
            resolve(
              Result.ko(new ErrorWithDetails('No session_id received from SSE endpoint', 'SseSessionError')),
            );
          }
        });

        res.on('error', error => {
          this.sseRes = null;
          this.sseBuffer = '';
          this.rejectPendingRequests(error instanceof Error ? error : new Error(String(error)));
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

      request.setTimeout(this.timeoutMs, () => {
        request.destroy();
        resolve(
          Result.ko(new ErrorWithDetails(`SSE connection timeout after ${this.timeoutMs}ms`, 'SseTimeout')),
        );
      });
    });
  }

  /**
   * Start listening for SSE message events.
   */
  private startSseMessageListener(): void {
    if (!this.sseRes) {
      return;
    }
    // Data handler already exists; it calls processSseMessages() once session is established
  }

  /**
   * Process SSE buffer for message events containing JSON-RPC responses.
   */
  private processSseMessages(): void {
    // SSE events are separated by blank lines
    const eventBlocks = this.sseBuffer.split('\n\n');
    // Keep the last (incomplete) block in the buffer
    this.sseBuffer = eventBlocks.pop() ?? '';

    for (const eventBlock of eventBlocks) {
      if (!eventBlock.includes('event: message')) {
        continue;
      }

      // Extract data lines
      const dataLines = eventBlock
        .split('\n')
        .filter(l => l.startsWith('data: '))
        .map(l => l.slice(6))
        .join('');

      if (!dataLines.trim()) {
        continue;
      }

      try {
        const response = JSON.parse(dataLines) as McpToolResponse;
        const id = response.id;

        if (id !== undefined && this.pendingRequests.has(id)) {
          const { resolve, timeout } = this.pendingRequests.get(id)!;
          this.pendingRequests.delete(id);
          clearTimeout(timeout);
          resolve(response);
        } else {
          this.logger.debug(`Received response without matching request id: ${dataLines.slice(0, 100)}`);
        }
      } catch (error) {
        this.logger.debug(
          `Failed to parse SSE message: ${error instanceof Error ? error.message : String(error)}. Data: "${dataLines.slice(0, 200)}"`,
        );
      }
    }
  }

  /**
   * Sends a JSON-RPC request via POST and waits for response via SSE stream.
   */
  private async sendRequest(request: McpToolRequest): Promise<McpToolResponse> {
    if (!this.sessionId) {
      throw new ErrorWithDetails('No session established', 'NoSessionError');
    }

    return new Promise((resolve, reject) => {
      const requestId = request.id;

      // Register pending request handler
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(
          new ErrorWithDetails(`Request timeout after ${this.timeoutMs}ms (id=${requestId})`, 'McpTimeout'),
        );
      }, this.timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

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
        let body = '';
        res.on('data', (chunk: Buffer) => {
          body += chunk;
        });
        res.on('end', () => {
          // MCP SSE transport returns 202 Accepted, actual response comes via SSE
          if (res.statusCode === 202 || res.statusCode === 200) {
            // Response will come via SSE stream — do nothing here
            return;
          }
          // Unexpected status
          this.pendingRequests.delete(requestId);
          clearTimeout(timeout);
          const snippet = body.slice(0, 200).replace(/\n/g, ' ');
          reject(new ErrorWithDetails(`HTTP ${res.statusCode}: ${snippet}`, 'McpHttpError'));
        });
      });

      req.on('error', error => {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      });

      req.setTimeout(this.timeoutMs);
      req.write(data);
      req.end();
    });
  }

  private closeSseConnection(): void {
    if (this.sseRes) {
      this.sseRes.destroy();
      this.sseRes = null;
    }
    this.sseBuffer = '';
    this.rejectPendingRequests(new ErrorWithDetails('SSE connection closed', 'SseConnectionClosed'));
  }

  private rejectPendingRequests(error: Error): void {
    for (const [id, { reject, timeout }] of this.pendingRequests.entries()) {
      clearTimeout(timeout);
      reject(error);
    }
    this.pendingRequests.clear();
  }

  private extractSessionId(endpoint: string): string | null {
    try {
      const url = new URL(endpoint, this.baseUrl);
      return url.searchParams.get('session_id');
    } catch {
      const match = endpoint.match(/[?&]session_id=([^&]+)/);
      return match ? match[1] : null;
    }
  }

  async close(): Promise<void> {
    this.logger.info('Closing Mnemosyne MCP client');
    this.closeSseConnection();
    this.sessionId = null;
    this.logger.info('Mnemosyne MCP client closed');
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
