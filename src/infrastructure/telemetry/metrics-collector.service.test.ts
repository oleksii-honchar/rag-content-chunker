import { Test, TestingModule } from '@nestjs/testing';
import { BasePinoLogger } from '../logging/base-pino-logger';
import { ConfigurationService } from '../config/configuration.service';
import { MetricsCollectorService } from './metrics-collector.service';

type LoggerMock = {
  setContext: jest.Mock;
  log: jest.Mock;
  info: jest.Mock;
  error: jest.Mock;
  warn: jest.Mock;
  debug: jest.Mock;
  child: jest.Mock;
};

type ConfigServiceMock = {
  getTelemetryConfig: jest.Mock;
};

const createLoggerMock = (): LoggerMock => ({
  setContext: jest.fn(),
  log: jest.fn(),
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  child: jest.fn(),
});

const createConfigServiceMock = (telemetryConfig: unknown): ConfigServiceMock => ({
  getTelemetryConfig: jest.fn(() => telemetryConfig),
});

describe('MetricsCollectorService', () => {
  let service: MetricsCollectorService;
  let logger: LoggerMock;
  let childLogger: LoggerMock;
  let configService: ConfigServiceMock;

  beforeEach(async () => {
    logger = createLoggerMock();
    childLogger = createLoggerMock();
    logger.child.mockReturnValue(childLogger);

    configService = createConfigServiceMock({
      enabled: true,
      endpoint: 'clickstack-otel-collector:4317',
      service: 'rag-content-chunker',
      metrics: { chunking: true, ingestion: true, errors: true },
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsCollectorService,
        { provide: BasePinoLogger, useValue: logger },
        { provide: ConfigurationService, useValue: configService },
      ],
    }).compile();

    service = module.get(MetricsCollectorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initialize', () => {
    it('when disabled returns early', async () => {
      configService.getTelemetryConfig.mockReturnValue({
        enabled: false,
        endpoint: '',
        service: '',
        metrics: { chunking: false, ingestion: false, errors: false },
      } as never);

      await service.initialize();

      expect(childLogger.info).toHaveBeenCalledWith('Telemetry disabled');
    });

    it('when enabled logs initialization', async () => {
      await service.initialize();

      expect(childLogger.info).toHaveBeenCalledWith(
        'Initializing OpenTelemetry',
        expect.objectContaining({
          endpoint: 'clickstack-otel-collector:4317',
          service: 'rag-content-chunker',
        }),
      );
      expect(childLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('OpenTelemetry initialized'),
      );
    });
  });

  describe('recordChunkingDuration', () => {
    it('logs metric', () => {
      service.recordChunkingDuration(150, '/path/to/file.md');

      expect(childLogger.debug).toHaveBeenCalledWith(
        'Metric: chunking.duration',
        expect.objectContaining({
          durationMs: 150,
          filePath: '/path/to/file.md',
        }),
      );
    });
  });

  describe('recordChunksCreated', () => {
    it('logs metric', () => {
      service.recordChunksCreated(5, '/path/to/file.md');

      expect(childLogger.debug).toHaveBeenCalledWith(
        'Metric: chunks.created',
        expect.objectContaining({
          count: 5,
          filePath: '/path/to/file.md',
        }),
      );
    });
  });

  describe('recordIngestionSuccess', () => {
    it('logs metric', () => {
      service.recordIngestionSuccess('chunk-123');

      expect(childLogger.debug).toHaveBeenCalledWith(
        'Metric: ingestion.success',
        expect.objectContaining({
          chunkId: 'chunk-123',
        }),
      );
    });
  });

  describe('recordIngestionFailure', () => {
    it('logs metric', () => {
      service.recordIngestionFailure('chunk-456', 'timeout');

      expect(childLogger.debug).toHaveBeenCalledWith(
        'Metric: ingestion.failure',
        expect.objectContaining({
          chunkId: 'chunk-456',
          error: 'timeout',
        }),
      );
    });
  });

  describe('recordError', () => {
    it('logs metric', () => {
      service.recordError('some error');

      expect(childLogger.debug).toHaveBeenCalledWith(
        'Metric: errors.total',
        expect.objectContaining({
          error: 'some error',
        }),
      );
    });
  });
});
