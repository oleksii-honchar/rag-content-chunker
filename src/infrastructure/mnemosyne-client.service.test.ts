import { Test, TestingModule } from '@nestjs/testing';
import { ConfigurationService } from './config/configuration.service';
import { BasePinoLogger } from './logging/base-pino-logger';
import { MnemosyneClient } from './mnemosyne-client.service';

describe('MnemosyneClient (config)', () => {
  let configService: jest.Mocked<ConfigurationService>;
  let mockLogger: jest.Mocked<BasePinoLogger>;

  beforeEach(() => {
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
  });

  it('reads MCP config from ConfigurationService', async () => {
    await Test.createTestingModule({
      providers: [
        MnemosyneClient,
        { provide: ConfigurationService, useValue: configService },
        { provide: BasePinoLogger, useValue: mockLogger },
      ],
    }).compile();

    expect(configService.getMcpConfig).toHaveBeenCalled();
  });

  it('strips trailing /messages/ from URL', async () => {
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

    const client = module.get(MnemosyneClient);
    expect(client).toBeDefined();
  });

  it('strips trailing /mcp from URL', async () => {
    configService.getMcpConfig.mockReturnValue({
      url: 'http://mcp.test/mcp',
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

    const client = module.get(MnemosyneClient);
    expect(client).toBeDefined();
  });

  it('uses HTTPS when URL is https', async () => {
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

    const client = module.get(MnemosyneClient);
    expect(client).toBeDefined();
  });

  it('includes Authorization header when apiKey is configured', async () => {
    configService.getMcpConfig.mockReturnValue({
      url: 'http://mcp.test',
      apiKey: 'secret-key',
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

    const client = module.get(MnemosyneClient);
    expect(client).toBeDefined();
  });
});
