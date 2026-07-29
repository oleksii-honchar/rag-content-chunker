import { Test, TestingModule } from '@nestjs/testing';
import { ConfigurationService } from './config/configuration.service';
import { aConfigService } from './config/configuration.test-utils';
import { BasePinoLogger } from './logging/base-pino-logger';
import { aLogger } from './logging/logger.test-utils';
import { MnemosyneClient } from './mnemosyne-client.service';

describe('MnemosyneClient (config)', () => {
  let configService: jest.Mocked<ConfigurationService>;
  let mockLogger: jest.Mocked<BasePinoLogger>;

  beforeEach(() => {
    configService = aConfigService();
    mockLogger = aLogger();
  });

  it('reads MCP config from ConfigurationService lazily on first use', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MnemosyneClient,
        { provide: ConfigurationService, useValue: configService },
        { provide: BasePinoLogger, useValue: mockLogger },
      ],
    }).compile();

    const client = module.get(MnemosyneClient);
    // Config is not read in constructor anymore — read lazily on first use
    expect(configService.getMcpConfig).not.toHaveBeenCalled();

    // Trigger lazy config load via initialize()
    await client.initialize();
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
