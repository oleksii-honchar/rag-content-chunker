import { Test, TestingModule } from '@nestjs/testing';
import * as http from 'http';
import * as https from 'https';
import { Chunk, FILE_ROLES } from '../../domain/entities/chunk.entity';
import { ConfigurationService } from '../config/configuration.service';
import { BasePinoLogger } from '../logging/base-pino-logger';
import { MnemosyneClient } from './mnemosyne-client.service';

jest.mock('chokidar', () => ({
  watch: jest.fn(),
}));

jest.mock('http', () => ({
  request: jest.fn(),
}));

jest.mock('https', () => ({
  request: jest.fn(),
}));

describe('MnemosyneClient', () => {
  let client: MnemosyneClient;
  let configService: jest.Mocked<ConfigurationService>;
  let mockLogger: jest.Mocked<BasePinoLogger>;
  let mockRes: jest.Mocked<http.IncomingMessage>;
  const mockHttpReq = http.request as jest.Mock;
  const mockHttpsReq = https.request as jest.Mock;

  // Handler storage per mock request
  let lastReqHandlers: Record<string, (...args: unknown[]) => void>;
  let lastCallback: ((res: http.IncomingMessage) => void) | null;

  const createMockResponse = (statusCode: number, body: unknown) => {
    mockRes = {
      on: jest.fn((event: string | symbol, handler: (...args: unknown[]) => void) => {
        if (event === 'data') {
          handler(Buffer.from(JSON.stringify(body)));
        }
        if (event === 'end') {
          handler(Buffer.from(''));
        }
        return mockRes;
      }),
      statusCode,
    } as unknown as jest.Mocked<http.IncomingMessage>;
  };

  const createMockRequest = (): jest.Mocked<http.ClientRequest> => {
    lastReqHandlers = {};
    const mockReq = {} as jest.Mocked<http.ClientRequest>;
    mockReq.on = jest.fn((event: string | symbol, handler: (...args: unknown[]) => void) => {
      lastReqHandlers[String(event)] = handler;
      return mockReq;
    });
    mockReq.setTimeout = jest.fn();
    mockReq.write = jest.fn();
    mockReq.end = jest.fn();
    mockReq.destroy = jest.fn();
    return mockReq;
  };

  const invokeHandler = (event: string, ...args: unknown[]) => {
    const handler = lastReqHandlers?.[event];
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

    createMockRequest();
    createMockResponse(200, { jsonrpc: '2.0', id: 1, result: {} });

    // Default: return req, callback invoked when test calls lastCallback(mockRes)
    // Tests that expect success rely on response mock's on() handlers firing synchronously
    mockHttpReq.mockImplementation((_options: unknown, callback: (res: http.IncomingMessage) => void) => {
      const req = createMockRequest();
      // Immediately invoke callback with mock response
      callback(mockRes);
      return req;
    });
    mockHttpsReq.mockImplementation(mockHttpReq);

    configService = {
      getWatchSources: jest.fn(),
      getChunkingConfig: jest.fn(),
      getEnrichmentConfig: jest.fn(),
      getMcpConfig: jest.fn().mockReturnValue({
        url: 'http://mcp.test/mnemosyne',
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
  });

  describe('initialize', () => {
    it('attempts health check on bootstrap', async () => {
      const result = await client.initialize();

      expect(result.isOk()).toBe(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Initializing Mnemosyne MCP client',
        expect.objectContaining({ url: 'http://mcp.test/mnemosyne' }),
      );
    });

    it('sets connectionInitialized when health check succeeds', async () => {
      createMockResponse(200, { jsonrpc: '2.0', id: 1, result: {} });
      await client.initialize();

      expect(mockLogger.info).toHaveBeenCalledWith('Mnemosyne MCP client initialized successfully');
    });

    it('returns ok even when health check fails (will retry on use)', async () => {
      createMockResponse(500, { jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Server error' } });
      const result = await client.initialize();

      expect(result.isOk()).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith('Mnemosyne MCP health check failed, will retry on use');
    });

    it('returns ok even when health check request fails (non-fatal)', async () => {
      jest.useRealTimers();
      mockHttpReq.mockImplementation((_options: unknown, _callback: unknown) => {
        const req = createMockRequest();
        setTimeout(() => {
          invokeHandler('error', new Error('Connection refused'));
        }, 0);
        return req;
      });

      const result = await client.initialize();

      // Initialize is non-fatal — returns ok even when health check fails
      expect(result.isOk()).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith('Mnemosyne MCP health check failed, will retry on use');
      jest.useFakeTimers();
    });
  });

  describe('healthCheck', () => {
    it('sends ping request', async () => {
      await client.healthCheck();

      expect(mockHttpReq).toHaveBeenCalled();
    });

    it('returns ok(true) when response has no error', async () => {
      createMockResponse(200, { jsonrpc: '2.0', id: 1, result: {} });
      const result = await client.healthCheck();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(true);
    });

    it('returns ok(false) when response has error', async () => {
      createMockResponse(200, { jsonrpc: '2.0', id: 1, error: { code: -32600, message: 'Invalid request' } });
      const result = await client.healthCheck();

      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(false);
    });

    it('returns ko when request fails', async () => {
      jest.useRealTimers();
      mockHttpReq.mockImplementation((_options: unknown, _callback: unknown) => {
        const req = createMockRequest();
        process.nextTick(() => {
          invokeHandler('error', new Error('Network error'));
        });
        return req;
      });

      const result = await client.healthCheck();

      expect(result.isKo()).toBe(true);
      jest.useFakeTimers();
    });
  });

  describe('remember', () => {
    it('sends tools/call request with memory_remember tool name', async () => {
      createMockResponse(200, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'OK' }] } });
      const chunk = aChunk();
      await client.remember(chunk);

      expect(mockHttpReq).toHaveBeenCalled();
      // mockHttpReq called with (options, callback) and returns req
      // find the returned req from the mock call result
      const returnedReq = mockHttpReq.mock.results[0].value;
      const writeCall = returnedReq.write.mock.calls[0];
      const requestBody = JSON.parse(writeCall[0] as string);

      expect(requestBody.jsonrpc).toBe('2.0');
      expect(requestBody.method).toBe('tools/call');
      expect(requestBody.params.name).toBe('memory_remember');
    });

    it('includes chunk metadata in tool arguments', async () => {
      createMockResponse(200, { jsonrpc: '2.0', id: 1, result: { content: [{ type: 'text', text: 'OK' }] } });
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
      createMockResponse(200, {
        jsonrpc: '2.0',
        id: 1,
        result: { content: [{ type: 'text', text: 'OK' }] },
      });
      const chunk = aChunk();
      const result = await client.remember(chunk);

      expect(result.isOk()).toBe(true);
    });

    it('returns ko when result present but no content field', async () => {
      jest.useRealTimers();
      createMockResponse(200, { jsonrpc: '2.0', id: 1, result: {} });
      const chunk = aChunk();
      const result = await client.remember(chunk);

      // Service requires result.content to be present; retries then fails
      expect(result.isKo()).toBe(true);
      jest.useFakeTimers();
    });

    it('retries on request failure up to maxRetries', async () => {
      jest.useRealTimers();
      let attempt = 0;
      mockHttpReq.mockImplementation((_options: unknown, _callback: unknown) => {
        attempt++;
        const req = createMockRequest();
        process.nextTick(() => {
          invokeHandler('error', new Error('Connection error'));
        });
        return req;
      });

      const chunk = aChunk();
      const result = await client.remember(chunk);

      expect(result.isKo()).toBe(true);
      expect(attempt).toBe(3); // maxRetries = 3
      jest.useFakeTimers();
    });

    it('applies retry delay between attempts', async () => {
      jest.useRealTimers();
      const attempts: number[] = [];
      mockHttpReq.mockImplementation((_options: unknown, _callback: unknown) => {
        const attempt = attempts.length + 1;
        attempts.push(attempt);
        const req = createMockRequest();
        process.nextTick(() => {
          invokeHandler('error', new Error('Connection error'));
        });
        return req;
      });

      const chunk = aChunk();
      const startTime = Date.now();
      const promise = client.remember(chunk);

      // Wait for all retries to complete
      await promise;
      const elapsed = Date.now() - startTime;

      // 3 attempts with delays of 100ms and 200ms between them
      expect(attempts).toEqual([1, 2, 3]);
      // Total delay should be ~300ms (100 + 200)
      expect(elapsed).toBeGreaterThanOrEqual(250);
      jest.useFakeTimers();
    });

    it('returns error after all retries exhausted', async () => {
      jest.useRealTimers();
      mockHttpReq.mockImplementation((_options: unknown, _callback: unknown) => {
        const req = createMockRequest();
        process.nextTick(() => {
          invokeHandler('error', new Error('Connection refused'));
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
      createMockResponse(200, {
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32603, message: 'Internal error' },
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
        url: 'https://mcp.test/mnemosyne',
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

      await httpsClient.healthCheck();
      expect(mockHttpsReq).toHaveBeenCalled();
    });

    it('includes Authorization header when apiKey is set', async () => {
      await client.healthCheck();

      const callArgs = mockHttpReq.mock.calls[0];
      const options = callArgs[0] as http.RequestOptions;
      expect((options.headers as Record<string, string>)['Authorization']).toBe('Bearer test-key');
    });

    it('omits Authorization header when apiKey is not set', async () => {
      configService.getMcpConfig.mockReturnValue({
        url: 'http://mcp.test/mnemosyne',
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

      await noKeyClient.healthCheck();

      const callArgs = mockHttpReq.mock.calls[0];
      const options = callArgs[0] as http.RequestOptions;
      expect((options.headers as Record<string, string>)['Authorization']).toBeUndefined();
    });

    it('sets request timeout from config', async () => {
      await client.healthCheck();

      const returnedReq = mockHttpReq.mock.results[0].value;
      expect(returnedReq.setTimeout).toHaveBeenCalledWith(5000);
    });

    it('returns ko on timeout', async () => {
      jest.useRealTimers();
      mockHttpReq.mockImplementation((_options: unknown, _callback: unknown) => {
        const req = createMockRequest();
        process.nextTick(() => {
          invokeHandler('timeout');
        });
        return req;
      });

      const result = await client.healthCheck();
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('Request timeout');
      jest.useFakeTimers();
    });

    it('returns ko on invalid JSON response', async () => {
      mockRes = {
        on: jest.fn((event: string | symbol, handler: (...args: unknown[]) => void) => {
          if (event === 'data') {
            handler(Buffer.from('not json'));
          }
          if (event === 'end') {
            handler(Buffer.from(''));
          }
          return mockRes;
        }),
        statusCode: 200,
      } as unknown as jest.Mocked<http.IncomingMessage>;

      const result = await client.healthCheck();
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('Failed to parse MCP response');
    });
  });
});
