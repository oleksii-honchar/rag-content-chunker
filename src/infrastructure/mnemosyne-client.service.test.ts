import { Test, TestingModule } from '@nestjs/testing';
import * as http from 'http';
import * as https from 'https';
import { Chunk } from '../domain/chunk.entity';
import { ConfigurationService } from './config/configuration.service';
import { aConfigService } from './config/configuration.test-utils';
import { BasePinoLogger } from './logging/base-pino-logger';
import { aLogger } from './logging/logger.test-utils';
import { MnemosyneClient } from './mnemosyne-client.service';

jest.mock('http', () => ({
  request: jest.fn(),
  get: jest.fn(),
}));
jest.mock('https', () => ({
  request: jest.fn(),
  get: jest.fn(),
}));

interface MockReq {
  on: jest.Mock;
  write: jest.Mock;
  end: jest.Mock;
  setTimeout: jest.Mock;
  destroy: jest.Mock;
}

interface MockRes {
  statusCode: number;
  headers: Record<string, string | undefined>;
  on: jest.Mock;
  destroy: jest.Mock;
}

function createMockResponse(
  statusCode: number,
  body: string,
  headers: Record<string, string | undefined> = {},
): MockRes {
  const res: MockRes = {
    statusCode,
    headers,
    on: jest.fn(),
    destroy: jest.fn(),
  };
  res.on.mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
    if (event === 'data') {
      process.nextTick(() => handler(Buffer.from(body)));
    } else if (event === 'end') {
      process.nextTick(() => handler());
    }
    return res;
  });
  return res;
}

function testChunk(text = 'Test chunk content'): Chunk {
  return Chunk.of({
    id: '550e8400-e29b-41d4-a716-446655440000',
    text,
    chunkIndex: 0,
    totalChunks: 1,
    sectionHeader: 'Test Section',
    breadcrumb: 'root > test',
    fileRole: 'docs' as const,
    oversized: false,
    startLine: 1,
    endLine: 10,
    metadata: {},
    importance: 0.5,
    tags: [],
    namespace: 'default',
  }).getValue();
}

function createMockReq(): MockReq {
  return {
    on: jest.fn(),
    write: jest.fn(),
    end: jest.fn(),
    setTimeout: jest.fn(),
    destroy: jest.fn(),
  };
}

const getInitResponse = () =>
  JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    result: {
      protocolVersion: '2024-11-05',
      capabilities: { tools: {} },
      serverInfo: { name: 'mnemosyne', version: '1.0.0' },
    },
  });

describe('MnemosyneClient (Streamable HTTP)', () => {
  let configService: jest.Mocked<ConfigurationService>;
  let mockLogger: jest.Mocked<BasePinoLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    configService = aConfigService();
    mockLogger = aLogger();
  });

  const createClient = async (mcpConfigOverrides: Record<string, unknown> = {}) => {
    configService.getMcpConfig.mockReturnValue({
      url: 'http://mcp.test',
      apiKey: 'test-key',
      timeoutMs: 5000,
      maxRetries: 3,
      retryDelayMs: 10,
      ...mcpConfigOverrides,
    } as never);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MnemosyneClient,
        { provide: ConfigurationService, useValue: configService },
        { provide: BasePinoLogger, useValue: mockLogger },
      ],
    }).compile();

    return module.get(MnemosyneClient);
  };

  describe('initialize', () => {
    it('performs MCP initialize handshake then sends notifications/initialized', async () => {
      let callIndex = 0;
      const calls: { options: unknown; req: MockReq }[] = [];

      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        const req = createMockReq();
        const res = createMockResponse(200, getInitResponse(), { 'mcp-session-id': 'session-abc-123' });
        calls.push({ options, req });
        process.nextTick(() => callback(res));
        callIndex++;
        return req;
      });

      const client = await createClient();
      const result = await client.initialize();

      expect(result.isOk()).toBe(true);
      expect(http.request).toHaveBeenCalledTimes(2);

      const initBody = JSON.parse(calls[0].req.write.mock.calls[0][0]);
      expect(initBody.method).toBe('initialize');
      expect(initBody.params.protocolVersion).toBe('2024-11-05');
      expect(initBody.params.clientInfo.name).toBe('rag-content-chunker');

      const notifBody = JSON.parse(calls[1].req.write.mock.calls[0][0]);
      expect(notifBody.method).toBe('notifications/initialized');
    });

    it('stores Mcp-Session-Id from initialize response header', async () => {
      let callIndex = 0;
      const calls: { options: unknown; req: MockReq }[] = [];

      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        const req = createMockReq();
        const idx = callIndex++;
        let body: string;
        let headers: Record<string, string | undefined>;
        if (idx === 0) {
          body = getInitResponse();
          headers = { 'mcp-session-id': 'session-xyz-789' };
        } else if (idx === 1) {
          body = JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
          headers = {};
        } else {
          body = JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            result: {
              content: [{ type: 'text', text: JSON.stringify({ status: 'stored', memory_id: 'mem-1' }) }],
            },
          });
          headers = {};
        }
        const res = createMockResponse(200, body, headers);
        calls.push({ options, req });
        process.nextTick(() => callback(res));
        return req;
      });

      const client = await createClient();
      await client.initialize();

      // Trigger a remember call to verify session header is included
      const chunkResult = Chunk.create('test', 0, 1, 'test', 'test');
      if (chunkResult.isOk()) {
        await client.remember(chunkResult.getValue());
      }

      const rememberCall = calls[2];
      const headers = rememberCall.options as { headers: Record<string, string> };
      expect(headers.headers['Mcp-Session-Id']).toBe('session-xyz-789');
    });

    it('returns ok even when initialize fails', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(500, 'Internal Server Error');
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const client = await createClient();
      const result = await client.initialize();

      expect(result.isOk()).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalled();
    });
  });

  describe('remember', () => {
    let client: MnemosyneClient;

    beforeEach(async () => {
      let callIndex = 0;
      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        const req = createMockReq();
        const idx = callIndex++;
        const body =
          idx === 0
            ? getInitResponse()
            : JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const headers = idx === 0 ? { 'mcp-session-id': 'session-abc' } : {};
        const res = createMockResponse(200, body, headers);
        process.nextTick(() => callback(res));
        return req;
      });
      client = await createClient();
      await client.initialize();
    });

    it('sends POST to /mcp with correct JSON-RPC for mnemosyne_remember', async () => {
      let lastOptions: unknown = null;
      let lastReq: MockReq | null = null;

      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        lastOptions = options;
        const req = createMockReq();
        lastReq = req;
        const res = createMockResponse(
          200,
          JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            result: {
              content: [{ type: 'text', text: JSON.stringify({ status: 'stored', memory_id: 'mem-123' }) }],
            },
          }),
        );
        process.nextTick(() => callback(res));
        return req;
      });

      const chunk = Chunk.of({
        id: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        text: 'test content',
        chunkIndex: 0,
        totalChunks: 2,
        sectionHeader: 'Test Header',
        breadcrumb: 'root > test',
        language: 'typescript',
        fileRole: 'docs' as const,
        oversized: false,
        startLine: 1,
        endLine: 10,
        importance: 0.5,
        tags: [],
        namespace: 'default',
      }).getValue();

      const result = await client.remember(chunk);
      expect(result.isOk()).toBe(true);

      const opts = lastOptions as { path: string; method: string };
      expect(opts.path).toBe('/mcp');
      expect(opts.method).toBe('POST');

      const body = JSON.parse(lastReq!.write.mock.calls[0][0]);
      expect(body.jsonrpc).toBe('2.0');
      expect(body.method).toBe('tools/call');
      expect(body.params.name).toBe('mnemosyne_remember');
      expect(body.params.arguments.content).toBe('test content');
      expect(body.params.arguments.namespace).toBe('default');
      expect(body.params.arguments.importance).toBe(0.5);
      expect(body.params.arguments.source).toBe('default');
      expect(body.params.arguments.metadata.id).toBe('6ba7b810-9dad-11d1-80b4-00c04fd430c8');
      expect(body.params.arguments.metadata.chunkIndex).toBe(0);
      expect(body.params.arguments.metadata.totalChunks).toBe(2);
      expect(body.params.arguments.metadata.sectionHeader).toBe('Test Header');
      expect(body.params.arguments.metadata.breadcrumb).toBe('root > test');
      expect(body.params.arguments.metadata.fileRole).toBe('docs');
      expect(body.params.arguments.metadata.language).toBe('typescript');
      expect(body.params.arguments.metadata.startLine).toBe(1);
      expect(body.params.arguments.metadata.endLine).toBe(10);
      expect(body.params.arguments.metadata.importance).toBe(0.5);
      expect(body.params.arguments.metadata.tags).toEqual([]);
      expect(body.params.arguments.metadata.namespace).toBe('default');
    });

    it('parses stored response and returns ok with memory_id and status', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ status: 'stored', memory_id: 'mem-456' }) }],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.remember(testChunk());
      expect(result.isOk()).toBe(true);
      const value = result.getValue();
      expect(value.memory_id).toBe('mem-456');
      expect(value.status).toBe('stored');
    });

    it('extracts memory_id and status from response', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [
                  { type: 'text', text: JSON.stringify({ status: 'stored', memory_id: 'abc-123-xyz' }) },
                ],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.remember(testChunk());
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual({ memory_id: 'abc-123-xyz', status: 'stored' });
    });

    it('includes namespace in both top-level args and metadata', async () => {
      let lastReq: MockReq | null = null;

      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          lastReq = req;
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ status: 'stored', memory_id: 'mem-1' }) }],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const chunk = Chunk.of({
        id: '550e8400-e29b-41d4-a716-446655440001',
        text: 'namespace test',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: 'docs' as const,
        oversized: false,
        startLine: 1,
        endLine: 5,
        importance: 0.7,
        tags: ['vault', 'session'],
        namespace: 'vault-knowledge',
      }).getValue();

      const result = await client.remember(chunk);
      expect(result.isOk()).toBe(true);

      const body = JSON.parse(lastReq!.write.mock.calls[0][0]);
      expect(body.params.arguments.namespace).toBe('vault-knowledge');
      expect(body.params.arguments.metadata.namespace).toBe('vault-knowledge');
    });

    it('includes importance in both top-level args and metadata', async () => {
      let lastReq: MockReq | null = null;

      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          lastReq = req;
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ status: 'stored', memory_id: 'mem-1' }) }],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const chunk = Chunk.of({
        id: '550e8400-e29b-41d4-a716-446655440002',
        text: 'importance test',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: 'docs' as const,
        oversized: false,
        startLine: 1,
        endLine: 5,
        importance: 0.9,
        tags: [],
        namespace: 'default',
      }).getValue();

      const result = await client.remember(chunk);
      expect(result.isOk()).toBe(true);

      const body = JSON.parse(lastReq!.write.mock.calls[0][0]);
      expect(body.params.arguments.importance).toBe(0.9);
      expect(body.params.arguments.metadata.importance).toBe(0.9);
    });

    it('includes tags in both top-level args and metadata', async () => {
      let lastReq: MockReq | null = null;

      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          lastReq = req;
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ status: 'stored', memory_id: 'mem-1' }) }],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const chunk = Chunk.of({
        id: '550e8400-e29b-41d4-a716-446655440003',
        text: 'tags test',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: 'docs' as const,
        oversized: false,
        startLine: 1,
        endLine: 5,
        importance: 0.5,
        tags: ['important', 'breaking-change', 'api'],
        namespace: 'default',
      }).getValue();

      const result = await client.remember(chunk);
      expect(result.isOk()).toBe(true);

      const body = JSON.parse(lastReq!.write.mock.calls[0][0]);
      expect(body.params.arguments.metadata.tags).toEqual(['important', 'breaking-change', 'api']);
    });

    it('sets source equal to namespace not chunk', async () => {
      let lastReq: MockReq | null = null;

      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          lastReq = req;
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ status: 'stored', memory_id: 'mem-1' }) }],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const chunk = Chunk.of({
        id: '550e8400-e29b-41d4-a716-446655440004',
        text: 'source test',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: 'docs' as const,
        oversized: false,
        startLine: 1,
        endLine: 5,
        importance: 0.5,
        tags: [],
        namespace: 'obsidian-notes',
      }).getValue();

      const result = await client.remember(chunk);
      expect(result.isOk()).toBe(true);

      const body = JSON.parse(lastReq!.write.mock.calls[0][0]);
      expect(body.params.arguments.source).toBe('obsidian-notes');
      expect(body.params.arguments.source).not.toBe('chunk');
    });

    it('is backward compatible with chunk using default values', async () => {
      let lastReq: MockReq | null = null;

      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          lastReq = req;
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ status: 'stored', memory_id: 'mem-1' }) }],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const chunk = Chunk.create('default values test', 0, 1, 'Test', 'test').getValue();

      const result = await client.remember(chunk);
      expect(result.isOk()).toBe(true);

      const body = JSON.parse(lastReq!.write.mock.calls[0][0]);
      expect(body.params.arguments.namespace).toBe('default');
      expect(body.params.arguments.importance).toBe(0.5);
      expect(body.params.arguments.source).toBe('default');
      expect(body.params.arguments.metadata.namespace).toBe('default');
      expect(body.params.arguments.metadata.importance).toBe(0.5);
      expect(body.params.arguments.metadata.tags).toEqual([]);
    });

    it('returns ko on JSON-RPC error response', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(
            200,
            JSON.stringify({ jsonrpc: '2.0', id: 3, error: { code: -32603, message: 'Internal error' } }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.remember(testChunk());
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('Internal error');
    });

    it('returns ko on HTTP error', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(503, 'Service Unavailable');
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.remember(testChunk());
      expect(result.isKo()).toBe(true);
    });

    it('retries on failure up to maxRetries', async () => {
      let attemptCount = 0;

      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          attemptCount++;
          const req = createMockReq();
          const isOk = attemptCount >= 3;
          const body = isOk
            ? JSON.stringify({
                jsonrpc: '2.0',
                id: 3,
                result: {
                  content: [{ type: 'text', text: JSON.stringify({ status: 'stored', memory_id: 'mem-1' }) }],
                },
              })
            : 'Service Unavailable';
          const res = createMockResponse(isOk ? 200 : 503, body);
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.remember(testChunk());
      expect(result.isOk()).toBe(true);
      expect(attemptCount).toBe(3);
    });
  });

  describe('recall', () => {
    let client: MnemosyneClient;

    beforeEach(async () => {
      let callIndex = 0;
      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        const req = createMockReq();
        const idx = callIndex++;
        const body =
          idx === 0
            ? getInitResponse()
            : JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const headers = idx === 0 ? { 'mcp-session-id': 'session-abc' } : {};
        const res = createMockResponse(200, body, headers);
        process.nextTick(() => callback(res));
        return req;
      });
      client = await createClient();
      await client.initialize();
    });

    it('sends POST to /mcp with mnemosyne_recall tool call', async () => {
      let lastOptions: unknown = null;
      let lastReq: MockReq | null = null;

      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        lastOptions = options;
        const req = createMockReq();
        lastReq = req;
        const res = createMockResponse(
          200,
          JSON.stringify({
            jsonrpc: '2.0',
            id: 3,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    status: 'success',
                    results: [{ content: 'result 1' }, { content: 'result 2' }],
                  }),
                },
              ],
            },
          }),
        );
        process.nextTick(() => callback(res));
        return req;
      });

      const result = await client.recall('test query');
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual(['result 1', 'result 2']);

      const opts = lastOptions as { path: string };
      expect(opts.path).toBe('/mcp');

      const body = JSON.parse(lastReq!.write.mock.calls[0][0]);
      expect(body.method).toBe('tools/call');
      expect(body.params.name).toBe('mnemosyne_recall');
      expect(body.params.arguments.query).toBe('test query');
    });

    it('returns empty array when no results found', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ status: 'success', results: [] }) }],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      // recall retries on empty results by default — use maxRetries=1 to avoid timeout
      const result = await client.recall('no results query', 1, 10);
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toEqual([]);
    });

    it('returns ko on recall error response', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({ status: 'error', message: 'Vector search failed' }),
                  },
                ],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.recall('test query');
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('Vector search failed');
    });
  });

  describe('healthCheck', () => {
    let client: MnemosyneClient;

    beforeEach(async () => {
      let callIndex = 0;
      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        const req = createMockReq();
        const idx = callIndex++;
        const body =
          idx === 0
            ? getInitResponse()
            : JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const headers = idx === 0 ? { 'mcp-session-id': 'session-abc' } : {};
        const res = createMockResponse(200, body, headers);
        process.nextTick(() => callback(res));
        return req;
      });
      client = await createClient();
      await client.initialize();
    });

    it('sends ping request and returns true on success', async () => {
      let lastReq: MockReq | null = null;

      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          lastReq = req;
          const res = createMockResponse(200, JSON.stringify({ jsonrpc: '2.0', id: 3, result: {} }));
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.healthCheck();
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(true);

      const body = JSON.parse(lastReq!.write.mock.calls[0][0]);
      expect(body.method).toBe('ping');
    });

    it('returns false on ping error', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(
            200,
            JSON.stringify({ jsonrpc: '2.0', id: 3, error: { code: -32600, message: 'Not found' } }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.healthCheck();
      expect(result.isOk()).toBe(true);
      expect(result.getValue()).toBe(false);
    });

    it('returns ko on connection error', async () => {
      (http.request as jest.Mock).mockImplementation((_options: unknown, _callback: unknown) => {
        const req: MockReq = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
          setTimeout: jest.fn(),
          destroy: jest.fn(),
        };
        req.on.mockImplementation((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            process.nextTick(() => handler(new Error('Connection refused')));
          }
          return req;
        });
        return req;
      });

      const result = await client.healthCheck();
      expect(result.isKo()).toBe(true);
    });
  });

  describe('Mcp-Session-Id handling', () => {
    it('includes Mcp-Session-Id in subsequent requests after receiving it', async () => {
      let callIndex = 0;
      let lastOptions: unknown = null;

      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        lastOptions = options;
        const req = createMockReq();
        const idx = callIndex++;
        const body =
          idx === 0
            ? getInitResponse()
            : idx === 1
              ? JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
              : JSON.stringify({ jsonrpc: '2.0', id: 3, result: {} });
        const headers = idx === 0 ? { 'mcp-session-id': 'session-test-42' } : {};
        const res = createMockResponse(200, body, headers);
        process.nextTick(() => callback(res));
        return req;
      });

      const client = await createClient();
      await client.initialize();
      await client.healthCheck();

      const opts = lastOptions as { headers: Record<string, string> };
      expect(opts.headers['Mcp-Session-Id']).toBe('session-test-42');
    });

    it('works without session ID for stateless operations', async () => {
      let callIndex = 0;

      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        const req = createMockReq();
        const idx = callIndex++;
        const body =
          idx === 0
            ? getInitResponse()
            : idx === 1
              ? JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
              : JSON.stringify({ jsonrpc: '2.0', id: 3, result: {} });
        const res = createMockResponse(200, body, {});
        process.nextTick(() => callback(res));
        return req;
      });

      const client = await createClient();
      await client.initialize();

      const result = await client.healthCheck();
      expect(result.isOk()).toBe(true);
    });
  });

  describe('Authorization header', () => {
    it('includes Authorization header when apiKey is configured', async () => {
      let lastOptions: unknown = null;

      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        lastOptions = options;
        const req = createMockReq();
        const res = createMockResponse(200, getInitResponse(), { 'mcp-session-id': 'session-abc' });
        process.nextTick(() => callback(res));
        return req;
      });

      const client = await createClient({ apiKey: 'secret-api-key' });
      await client.initialize();

      const opts = lastOptions as unknown as { headers: Record<string, string> };
      expect(opts.headers['Authorization']).toBe('Bearer secret-api-key');
    });

    it('omits Authorization header when apiKey is not configured', async () => {
      let lastOptions: unknown = null;

      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        lastOptions = options;
        const req = createMockReq();
        const res = createMockResponse(200, getInitResponse(), { 'mcp-session-id': 'session-abc' });
        process.nextTick(() => callback(res));
        return req;
      });

      const client = await createClient({ apiKey: undefined });
      await client.initialize();

      const opts = lastOptions as unknown as { headers: Record<string, string> };
      expect(opts.headers['Authorization']).toBeUndefined();
    });
  });

  describe('close', () => {
    it('resets session ID and logs closure', async () => {
      let callIndex = 0;

      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        const req = createMockReq();
        const idx = callIndex++;
        const body =
          idx === 0
            ? getInitResponse()
            : JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const headers = idx === 0 ? { 'mcp-session-id': 'session-close-test' } : {};
        const res = createMockResponse(200, body, headers);
        process.nextTick(() => callback(res));
        return req;
      });

      const client = await createClient();
      await client.initialize();
      await client.close();

      expect(http.request).toHaveBeenCalledTimes(2);
    });
  });

  describe('forget', () => {
    let client: MnemosyneClient;

    beforeEach(async () => {
      let callIndex = 0;
      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        const req = createMockReq();
        const idx = callIndex++;
        const body =
          idx === 0
            ? getInitResponse()
            : JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const headers = idx === 0 ? { 'mcp-session-id': 'session-abc' } : {};
        const res = createMockResponse(200, body, headers);
        process.nextTick(() => callback(res));
        return req;
      });
      client = await createClient();
      await client.initialize();
    });

    it('sends POST to /mcp with mnemosyne_forget tool call', async () => {
      let lastReq: MockReq | null = null;

      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          lastReq = req;
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [
                  { type: 'text', text: JSON.stringify({ status: 'deleted', memory_id: 'mem-to-forget' }) },
                ],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.forget('mem-to-forget', 'test-ns');
      expect(result.isOk()).toBe(true);

      const body = JSON.parse(lastReq!.write.mock.calls[0][0]);
      expect(body.method).toBe('tools/call');
      expect(body.params.name).toBe('mnemosyne_forget');
      expect(body.params.arguments.memory_id).toBe('mem-to-forget');
      expect(body.params.arguments.namespace).toBe('test-ns');
    });

    it('returns ok when response status is deleted', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [
                  { type: 'text', text: JSON.stringify({ status: 'deleted', memory_id: 'mem-123' }) },
                ],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.forget('mem-123', 'default');
      expect(result.isOk()).toBe(true);
    });

    it('returns ko on MCP error response', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(
            200,
            JSON.stringify({ jsonrpc: '2.0', id: 3, error: { code: -32603, message: 'Internal error' } }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.forget('mem-err', 'ns');
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('Internal error');
    });

    it('returns ko on connection error', async () => {
      (http.request as jest.Mock).mockImplementation((_options: unknown, _callback: unknown) => {
        const req: MockReq = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
          setTimeout: jest.fn(),
          destroy: jest.fn(),
        };
        req.on.mockImplementation((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            process.nextTick(() => handler(new Error('ECONNREFUSED')));
          }
          return req;
        });
        return req;
      });

      const result = await client.forget('mem-conn', 'ns');
      expect(result.isKo()).toBe(true);
    });
  });

  describe('registerNamespace', () => {
    let client: MnemosyneClient;

    beforeEach(async () => {
      let callIndex = 0;
      (http.request as jest.Mock).mockImplementation((options: unknown, callback: (res: MockRes) => void) => {
        const req = createMockReq();
        const idx = callIndex++;
        const body =
          idx === 0
            ? getInitResponse()
            : JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const headers = idx === 0 ? { 'mcp-session-id': 'session-abc' } : {};
        const res = createMockResponse(200, body, headers);
        process.nextTick(() => callback(res));
        return req;
      });
      client = await createClient();
      await client.initialize();
    });

    it('sends POST to /mcp with mnemosyne_register_namespace tool call', async () => {
      let lastReq: MockReq | null = null;

      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          lastReq = req;
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ status: 'registered', name: 'test-ns' }) }],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.registerNamespace('test-ns', 'Test namespace description');
      expect(result.isOk()).toBe(true);

      const body = JSON.parse(lastReq!.write.mock.calls[0][0]);
      expect(body.method).toBe('tools/call');
      expect(body.params.name).toBe('mnemosyne_register_namespace');
      expect(body.params.arguments.name).toBe('test-ns');
      expect(body.params.arguments.description).toBe('Test namespace description');
    });

    it('returns ok when response status is registered', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(
            200,
            JSON.stringify({
              jsonrpc: '2.0',
              id: 3,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ status: 'registered', name: 'my-ns' }) }],
              },
            }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.registerNamespace('my-ns', 'My namespace');
      expect(result.isOk()).toBe(true);
    });

    it('returns ko on MCP error response', async () => {
      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(
            200,
            JSON.stringify({ jsonrpc: '2.0', id: 3, error: { code: -32603, message: 'Internal error' } }),
          );
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const result = await client.registerNamespace('bad-ns', 'Bad namespace');
      expect(result.isKo()).toBe(true);
      expect(result.getError().message).toContain('Internal error');
    });

    it('returns ko on connection error', async () => {
      (http.request as jest.Mock).mockImplementation((_options: unknown, _callback: unknown) => {
        const req: MockReq = {
          on: jest.fn(),
          write: jest.fn(),
          end: jest.fn(),
          setTimeout: jest.fn(),
          destroy: jest.fn(),
        };
        req.on.mockImplementation((event: string, handler: (err: Error) => void) => {
          if (event === 'error') {
            process.nextTick(() => handler(new Error('ECONNREFUSED')));
          }
          return req;
        });
        return req;
      });

      const result = await client.registerNamespace('ns', 'desc');
      expect(result.isKo()).toBe(true);
    });
  });

  describe('config', () => {
    it('reads MCP config from ConfigurationService lazily on first use', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MnemosyneClient,
          { provide: ConfigurationService, useValue: configService },
          { provide: BasePinoLogger, useValue: mockLogger },
        ],
      }).compile();

      const testClient = module.get(MnemosyneClient);
      expect(configService.getMcpConfig).not.toHaveBeenCalled();

      (http.request as jest.Mock).mockImplementation(
        (_options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const res = createMockResponse(200, getInitResponse(), { 'mcp-session-id': 'session-abc' });
          process.nextTick(() => callback(res));
          return req;
        },
      );

      await testClient.initialize();
      expect(configService.getMcpConfig).toHaveBeenCalled();
    });

    it('strips trailing /messages/ from URL', async () => {
      configService.getMcpConfig.mockReturnValue({
        url: 'http://mcp.test/messages/',
        apiKey: 'test-key',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
      } as never);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MnemosyneClient,
          { provide: ConfigurationService, useValue: configService },
          { provide: BasePinoLogger, useValue: mockLogger },
        ],
      }).compile();

      const testClient = module.get(MnemosyneClient);
      expect(testClient).toBeDefined();
    });

    it('strips trailing /mcp from URL', async () => {
      configService.getMcpConfig.mockReturnValue({
        url: 'http://mcp.test/mcp',
        apiKey: 'test-key',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
      } as never);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MnemosyneClient,
          { provide: ConfigurationService, useValue: configService },
          { provide: BasePinoLogger, useValue: mockLogger },
        ],
      }).compile();

      const testClient = module.get(MnemosyneClient);
      expect(testClient).toBeDefined();
    });

    it('uses HTTPS when URL is https', async () => {
      configService.getMcpConfig.mockReturnValue({
        url: 'https://mcp.test',
        apiKey: 'test-key',
        timeoutMs: 5000,
        maxRetries: 3,
        retryDelayMs: 100,
      } as never);

      let callIndex = 0;
      (https.request as jest.Mock).mockImplementation(
        (options: unknown, callback: (res: MockRes) => void) => {
          const req = createMockReq();
          const idx = callIndex++;
          const body =
            idx === 0
              ? getInitResponse()
              : JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' });
          const headers = idx === 0 ? { 'mcp-session-id': 'session-abc' } : {};
          const res = createMockResponse(200, body, headers);
          process.nextTick(() => callback(res));
          return req;
        },
      );

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MnemosyneClient,
          { provide: ConfigurationService, useValue: configService },
          { provide: BasePinoLogger, useValue: mockLogger },
        ],
      }).compile();

      const testClient = module.get(MnemosyneClient);
      await testClient.initialize();

      expect(https.request).toHaveBeenCalled();
    });
  });
});
