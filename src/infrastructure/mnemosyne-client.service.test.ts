import { Test, TestingModule } from '@nestjs/testing';
import * as http from 'http';
import * as https from 'https';
import { Chunk, FILE_ROLES } from '../domain/chunk.entity';
import { ConfigurationService } from './config/configuration.service';
import { BasePinoLogger } from './logging/base-pino-logger';
import { MnemosyneClient } from './mnemosyne-client.service';

jest.mock('chokidar', () => ({
  watch: jest.fn(),
}));

jest.mock('http', () => ({
  request: jest.fn(),
  get: jest.fn(),
}));

jest.mock('https', () => ({
  request: jest.fn(),
  get: jest.fn(),
}));

describe('MnemosyneClient (SSE)', () => {
  let client: MnemosyneClient;
  let configService: jest.Mocked<ConfigurationService>;
  let mockLogger: jest.Mocked<BasePinoLogger>;
  const mockHttpReq = http.request as jest.Mock;
  const mockHttpGet = http.get as jest.Mock;
  const mockHttpsReq = https.request as jest.Mock;
  const mockHttpsGet = https.get as jest.Mock;

  const createMockRequest = (): jest.Mocked<http.ClientRequest> => {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    const mockReq = {} as jest.Mocked<http.ClientRequest>;
    mockReq.on = jest.fn((event: string | symbol, handler: (...args: unknown[]) => void) => {
      handlers[String(event)] = handler;
      return mockReq;
    });
    mockReq.setTimeout = jest.fn();
    mockReq.write = jest.fn();
    mockReq.end = jest.fn();
    mockReq.destroy = jest.fn();
    // Attach handlers for test invocation
    (mockReq as unknown as Record<string, unknown>).__handlers = handlers;
    return mockReq;
  };

  const createMockGetResponse = () => {
    const handlers: Record<string, (...args: unknown[]) => void> = {};
    // http.get returns ClientRequest; the callback receives IncomingMessage separately
    const mockObj = {} as Record<string, unknown>;
    mockObj.on = jest.fn((event: string | symbol, handler: (...args: unknown[]) => void) => {
      handlers[String(event)] = handler;
      return mockObj;
    });
    mockObj.setTimeout = jest.fn();
    mockObj.resume = jest.fn();
    mockObj.destroy = jest.fn();
    mockObj.__handlers = handlers;
    return mockObj;
  };

  const createMockPostResponse = (statusCode: number, body: unknown): jest.Mocked<http.IncomingMessage> => {
    const mockRes = {} as jest.Mocked<http.IncomingMessage>;
    mockRes.on = jest.fn((event: string | symbol, handler: (...args: unknown[]) => void) => {
      if (event === 'data') {
        handler(Buffer.from(JSON.stringify(body)));
      }
      if (event === 'end') {
        handler(Buffer.from(''));
      }
      return mockRes;
    });
    mockRes.statusCode = statusCode;
    return mockRes;
  };

  const invokeHandlers = (obj: unknown, event: string, ...args: unknown[]) => {
    const handlers = (obj as unknown as Record<string, unknown>)?.__handlers as Record<string, (...args: unknown[]) => void> | undefined;
    const handler = handlers?.[event];
    if (typeof handler === 'function') {
      handler(...args);
    }
  };

  const aChunk = (): Chunk => {
    const result = Chunk.create(
      'test chunk content',
      0,
      1,
      'Test Section',
      'root > Test Section',
      'en',
      FILE_ROLES.DOCS,
      false,
      1,
      10,
      { sourceId: 'test-source' },
    );
    return result.getValue();
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default: HTTP GET for SSE returns session endpoint
    mockHttpGet.mockImplementation((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
      const mockGetRes = createMockGetResponse();
      const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
      if (typeof callback === 'function') {
        callback(mockGetRes);
      }
      return mockGetRes;
    });
    mockHttpsGet.mockImplementation(mockHttpGet);

    // Default: HTTP POST for messages returns success
    mockHttpReq.mockImplementation((_options: unknown, callback?: (res: http.IncomingMessage) => void) => {
      const req = createMockRequest();
      if (typeof callback === 'function') {
        callback(createMockPostResponse(200, { jsonrpc: '2.0', id: 1, result: {} }));
      }
      return req;
    });
    mockHttpsReq.mockImplementation(mockHttpReq);

    configService = {
      getWatchSources: jest.fn(),
      getChunkingConfig: jest.fn(),
      getEnrichmentConfig: jest.fn(),
      getMcpConfig: jest.fn().mockReturnValue({
        url: 'http://mcp.test',
        apiKey: 'test-key',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
      }),
      getTelemetryConfig: jest.fn(),
      load: jest.fn(),
      initializeDefaultConfig: jest.fn(),
      stop: jest.fn(),
    } as unknown as jest.Mocked<ConfigurationService>;

    mockLogger = {
      setContext: jest.fn(),
      log: jest.fn(),
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as jest.Mocked<BasePinoLogger>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MnemosyneClient,
        { provide: ConfigurationService, useValue: configService },
        { provide: BasePinoLogger, useValue: mockLogger },
      ],
    }).compile();

    client = module.get(MnemosyneClient);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('reads MCP config from ConfigurationService', () => {
      expect(configService.getMcpConfig).toHaveBeenCalled();
    });

    it('strips trailing /messages/ from base URL', async () => {
      configService.getMcpConfig.mockReturnValue({
        url: 'http://mcp.test/messages/',
        apiKey: 'test-key',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MnemosyneClient,
          { provide: ConfigurationService, useValue: configService },
          { provide: BasePinoLogger, useValue: mockLogger },
        ],
      }).compile();
      const client2 = module.get(MnemosyneClient);

      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      await client2.initialize();

      const callArgs = mockHttpGet.mock.calls[0];
      const firstArg = callArgs[0] as string | http.RequestOptions;
      const path = typeof firstArg === 'string' ? new URL(firstArg).pathname : firstArg.path;
      expect(path).toBe('/sse');
    });
  });

  describe('initialize', () => {
    it('connects via SSE GET /sse to establish session', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test-session-123\n\n'));
        }
        return mockGetRes;
      });

      const result = await client.initialize();

      expect(result.isOk()).toBe(true);
      expect(mockHttpGet).toHaveBeenCalled();
      const callArgs = mockHttpGet.mock.calls[0];
      const firstArg = callArgs[0] as string | http.RequestOptions;
      const path = typeof firstArg === 'string' ? new URL(firstArg).pathname : firstArg.path;
      expect(path).toBe('/sse');
    });

    it('parses session_id from SSE endpoint event', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=parsed-session-id\n\n'));
        }
        return mockGetRes;
      });

      await client.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Mnemosyne MCP client initialized successfully', expect.any(Object));
    });

    it('includes Authorization header in SSE request when apiKey is set', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const options = typeof optionsOrCb === 'function' ? undefined : optionsOrCb;
        const callback = typeof optionsOrCb === 'function' ? optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      await client.initialize();

      const callArgs = mockHttpGet.mock.calls[0];
      const firstArg = callArgs[0] as string | http.RequestOptions;
      const options = typeof firstArg === 'string' ? callArgs[1] : firstArg;
      expect((options as http.RequestOptions).headers).toHaveProperty('Authorization', 'Bearer test-key');
    });

    it('returns ok even when SSE connection fails (will retry on use)', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'error', new Error('Connection refused'));
        }
        return mockGetRes;
      });

      const result = await client.initialize();

      expect(result.isOk()).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('establishes SSE session then sends ping via POST /messages/?session_id', async () => {
      // SSE for session
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=health-session\n\n'));
        }
        return mockGetRes;
      });

      // POST ping with session_id
      mockHttpReq.mockImplementationOnce((_options: unknown, callback?: (res: http.IncomingMessage) => void) => {
        const req = createMockRequest();
        if (typeof callback === 'function') {
          callback(createMockPostResponse(200, { jsonrpc: '2.0', id: 1, result: {} }));
        }
        return req;
      });

      const result = await client.healthCheck();

      expect(result.isOk()).toBe(true);
      expect(mockHttpGet).toHaveBeenCalled();
      expect(mockHttpReq).toHaveBeenCalled();

      const postCall = mockHttpReq.mock.calls[0];
      const options = postCall[0] as http.RequestOptions;
      expect(options.path).toContain('session_id=health-session');
    });

    it('returns ok(true) when response has no error', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      mockHttpReq.mockImplementationOnce((_options: unknown, callback?: (res: http.IncomingMessage) => void) => {
        const req = createMockRequest();
        if (typeof callback === 'function') {
          callback(createMockPostResponse(200, { jsonrpc: '2.0', id: 1, result: {} }));
        }
        return req;
      });

      const result = await client.healthCheck();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(true);
    });

    it('returns ko when SSE fails', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'error', new Error('SSE failed'));
        }
        return mockGetRes;
      });

      const result = await client.healthCheck();

      expect(result.isKo()).toBe(true);
    });
  });

  describe('remember', () => {
    it('establishes SSE session if not connected, then POSTs to /messages/?session_id', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=remember-session\n\n'));
        }
        return mockGetRes;
      });

      mockHttpReq.mockImplementationOnce((_options: unknown, callback?: (res: http.IncomingMessage) => void) => {
        const req = createMockRequest();
        if (typeof callback === 'function') {
          callback(createMockPostResponse(200, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'OK' }] } }));
        }
        return req;
      });

      const chunk = aChunk();
      const result = await client.remember(chunk);

      expect(result.isOk()).toBe(true);
      expect(mockHttpGet).toHaveBeenCalled();
      expect(mockHttpReq).toHaveBeenCalled();

      const postCall = mockHttpReq.mock.calls[0];
      const options = postCall[0] as http.RequestOptions;
      expect(options.path).toContain('session_id=remember-session');
    });

    it('sends tools/call request with memory_remember tool name', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      mockHttpReq.mockImplementationOnce((_options: unknown, callback?: (res: http.IncomingMessage) => void) => {
        const req = createMockRequest();
        if (typeof callback === 'function') {
          callback(createMockPostResponse(200, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'OK' }] } }));
        }
        return req;
      });

      const chunk = aChunk();
      await client.remember(chunk);

      const returnedReq = mockHttpReq.mock.results[0].value;
      const writeCall = returnedReq.write.mock.calls[0];
      const requestBody = JSON.parse(writeCall[0] as string);

      expect(requestBody.jsonrpc).toBe('2.0');
      expect(requestBody.method).toBe('tools/call');
      expect(requestBody.params.name).toBe('memory_remember');
    });

    it('includes chunk metadata in tool arguments', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      mockHttpReq.mockImplementationOnce((_options: unknown, callback?: (res: http.IncomingMessage) => void) => {
        const req = createMockRequest();
        if (typeof callback === 'function') {
          callback(createMockPostResponse(200, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'OK' }] } }));
        }
        return req;
      });

      const chunk = aChunk();
      await client.remember(chunk);

      const returnedReq = mockHttpReq.mock.results[0].value;
      const writeCall = returnedReq.write.mock.calls[0];
      const requestBody = JSON.parse(writeCall[0] as string);
      const args = requestBody.params.arguments;

      expect(args.text).toBe(chunk.text);
      expect(args.metadata.id).toBe(chunk.id);
      expect(args.metadata.chunkIndex).toBe(chunk.chunkIndex);
      expect(args.metadata.totalChunks).toBe(chunk.totalChunks);
      expect(args.metadata.sectionHeader).toBe(chunk.sectionHeader);
      expect(args.metadata.breadcrumb).toBe(chunk.breadcrumb);
      expect(args.metadata.fileRole).toBe(chunk.fileRole);
      expect(args.metadata.language).toBe(chunk.language);
      expect(args.metadata.startLine).toBe(chunk.startLine);
      expect(args.metadata.endLine).toBe(chunk.endLine);
      expect(args.metadata.sourceId).toBe('test-source');
    });

    it('returns ok when response has content', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      mockHttpReq.mockImplementationOnce((_options: unknown, callback?: (res: http.IncomingMessage) => void) => {
        const req = createMockRequest();
        if (typeof callback === 'function') {
          callback(createMockPostResponse(200, {
            jsonrpc: '2.0',
            id: 1,
            result: { content: [{ type: 'text', text: 'OK' }] },
          }));
        }
        return req;
      });

      const chunk = aChunk();
      const result = await client.remember(chunk);

      expect(result.isOk()).toBe(true);
    });

    it('retries on request failure up to maxRetries', async () => {
      jest.useRealTimers();

      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      let attempt = 0;
      mockHttpReq.mockImplementation((_options: unknown, _callback: unknown) => {
        attempt++;
        const req = createMockRequest();
        process.nextTick(() => {
          invokeHandlers(req, 'error', new Error('Connection error'));
        });
        return req;
      });

      const chunk = aChunk();
      const result = await client.remember(chunk);

      expect(result.isKo()).toBe(true);
      expect(attempt).toBe(3);
      jest.useFakeTimers();
    });

    it('applies retry delay between attempts', async () => {
      jest.useRealTimers();

      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      const attempts: number[] = [];
      mockHttpReq.mockImplementation((_options: unknown, _callback: unknown) => {
        const attempt = attempts.length + 1;
        attempts.push(attempt);
        const req = createMockRequest();
        process.nextTick(() => {
          invokeHandlers(req, 'error', new Error('Connection error'));
        });
        return req;
      });

      const chunk = aChunk();
      const startTime = Date.now();
      await client.remember(chunk);
      const elapsed = Date.now() - startTime;

      expect(attempts).toEqual([1, 2, 3]);
      expect(elapsed).toBeGreaterThanOrEqual(250);
      jest.useFakeTimers();
    });

    it('returns error after all retries exhausted', async () => {
      jest.useRealTimers();

      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      mockHttpReq.mockImplementation((_options: unknown, _callback: unknown) => {
        const req = createMockRequest();
        process.nextTick(() => {
          invokeHandlers(req, 'error', new Error('Connection refused'));
        });
        return req;
      });

      const chunk = aChunk();
      const result = await client.remember(chunk);

      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('Connection refused');
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to remember chunk after all retries',
        expect.objectContaining({ chunkId: chunk.id, retries: 3 }),
      );
      jest.useFakeTimers();
    });

    it('returns ko when MCP tool returns error response', async () => {
      jest.useRealTimers();

      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      mockHttpReq.mockImplementation((_options: unknown, callback?: (res: http.IncomingMessage) => void) => {
        const req = createMockRequest();
        if (typeof callback === 'function') {
          callback(createMockPostResponse(200, {
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32603, message: 'Internal error' },
          }));
        }
        return req;
      });

      const chunk = aChunk();
      const result = await client.remember(chunk);

      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('MCP error');
      jest.useFakeTimers();
    });
  });

  describe('sendRequest', () => {
    it('uses https for https URLs', async () => {
      configService.getMcpConfig.mockReturnValue({
        url: 'https://mcp.test',
        apiKey: 'test-key',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MnemosyneClient,
          { provide: ConfigurationService, useValue: configService },
          { provide: BasePinoLogger, useValue: mockLogger },
        ],
      }).compile();
      const httpsClient = module.get(MnemosyneClient);

      mockHttpsGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      await httpsClient.healthCheck();
      expect(mockHttpsGet).toHaveBeenCalled();
    });

    it('includes Authorization header when apiKey is set', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const options = typeof optionsOrCb === 'function' ? undefined : optionsOrCb;
        const callback = typeof optionsOrCb === 'function' ? optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      await client.healthCheck();

      const callArgs = mockHttpGet.mock.calls[0];
      const firstArg = callArgs[0] as string | http.RequestOptions;
      const options = typeof firstArg === 'string' ? callArgs[1] : firstArg;
      expect((options as http.RequestOptions).headers).toHaveProperty('Authorization', 'Bearer test-key');
    });

    it('omits Authorization header when apiKey is not set', async () => {
      configService.getMcpConfig.mockReturnValue({
        url: 'http://mcp.test',
        apiKey: undefined,
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MnemosyneClient,
          { provide: ConfigurationService, useValue: configService },
          { provide: BasePinoLogger, useValue: mockLogger },
        ],
      }).compile();
      const noKeyClient = module.get(MnemosyneClient);

      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const options = typeof optionsOrCb === 'function' ? undefined : optionsOrCb;
        const callback = typeof optionsOrCb === 'function' ? optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      await noKeyClient.healthCheck();

      const callArgs = mockHttpGet.mock.calls[0];
      const firstArg = callArgs[0] as string | http.RequestOptions;
      const options = typeof firstArg === 'string' ? callArgs[1] : firstArg;
      expect((options as http.RequestOptions).headers).not.toHaveProperty('Authorization');
    });

    it('sets request timeout from config', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      await client.healthCheck();

      const returnedReq = mockHttpReq.mock.results[0].value;
      expect(returnedReq.setTimeout).toHaveBeenCalledWith(5000);
    });

    it('returns ko on timeout', async () => {
      jest.useRealTimers();

      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      let savedReq: jest.Mocked<http.ClientRequest> | null = null;
      mockHttpReq.mockImplementation((_options: unknown, _callback: unknown) => {
        savedReq = createMockRequest();
        setImmediate(() => {
          if (savedReq) {
            invokeHandlers(savedReq, 'timeout');
          }
        });
        return savedReq;
      });

      const result = await client.healthCheck();
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('Request timeout');
      jest.useFakeTimers();
    });

    it('returns ko on invalid JSON response', async () => {
      mockHttpGet.mockImplementationOnce((_urlOrOptions: unknown, _optionsOrCb?: unknown, _cb?: unknown) => {
        const mockGetRes = createMockGetResponse();
        const callback = typeof _optionsOrCb === 'function' ? _optionsOrCb : _cb;
        if (typeof callback === 'function') {
          callback(mockGetRes);
          invokeHandlers(mockGetRes, 'data', Buffer.from('event: endpoint\ndata: /messages/?session_id=test\n\n'));
        }
        return mockGetRes;
      });

      mockHttpReq.mockImplementation((_options: unknown, callback?: (res: http.IncomingMessage) => void) => {
        const req = createMockRequest();
        const mockRes = {} as jest.Mocked<http.IncomingMessage>;
        mockRes.on = jest.fn((event: string | symbol, handler: (...args: unknown[]) => void) => {
          if (event === 'data') {
            handler(Buffer.from('not json'));
          }
          if (event === 'end') {
            handler(Buffer.from(''));
          }
          return mockRes;
        });
        if (typeof callback === 'function') {
          callback(mockRes);
        }
        return req;
      });

      const result = await client.healthCheck();
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('Failed to parse MCP response');
    });
  });
});
