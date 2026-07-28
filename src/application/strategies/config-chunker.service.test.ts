import { Chunk, FILE_ROLES } from '../../domain/chunk.entity';
import { ChunkContentConfig } from './chunker.interface';

import { ConfigChunker } from './config-chunker.service';

describe('ConfigChunker', () => {
  let chunker: ConfigChunker;

  const baseConfig: ChunkContentConfig = {
    maxTokens: 500,
    overlapTokens: 50,
    hardCapTokens: 600,
    filePath: 'test.json',
    sourceId: 'test-source',
  };

  beforeEach(() => {
    chunker = new ConfigChunker();
  });

  it('should be defined', () => {
    expect(chunker).toBeDefined();
  });

  it('should have chunk method', () => {
    expect(chunker.chunk).toBeDefined();
    expect(typeof chunker.chunk).toBe('function');
  });

  describe('JSON config chunking', () => {
    it('creates one chunk per top-level key', async () => {
      const content = JSON.stringify({
        database: { host: 'localhost', port: 5432 },
        server: { port: 3000 },
        logging: { level: 'info' },
      });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(3);
    });

    it('sets correct sectionHeader for each JSON key', async () => {
      const content = JSON.stringify({
        database: 'value1',
        server: 'value2',
      });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      const headers = chunks.map((c: Chunk) => c.sectionHeader).sort();
      expect(headers).toEqual(['database', 'server']);
    });

    it('sets breadcrumb as filename > key', async () => {
      const content = JSON.stringify({ database: 'value' });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].breadcrumb).toBe('config.json > database');
    });

    it('sets fileRole to CONFIG', async () => {
      const content = JSON.stringify({ key: 'value' });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].fileRole).toBe(FILE_ROLES.CONFIG);
    });

    it('formats nested objects as pretty JSON in chunk text', async () => {
      const content = JSON.stringify({
        database: { host: 'localhost', port: 5432 },
      });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].text).toContain('"host": "localhost"');
      expect(chunks[0].text).toContain('"port": 5432');
    });

    it('includes type=json in metadata', async () => {
      const content = JSON.stringify({ key: 'value' });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].metadata?.type).toBe('json');
    });

    it('includes key in metadata', async () => {
      const content = JSON.stringify({ database: 'value' });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].metadata?.key).toBe('database');
    });

    it('falls back to single chunk on invalid JSON', async () => {
      const content = '{ invalid json';

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(content);
    });
  });

  describe('YAML config chunking', () => {
    it('creates one chunk per top-level key', async () => {
      const content = `database:
  host: localhost
  port: 5432
server:
  port: 3000
logging:
  level: info`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.yaml',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(3);
    });

    it('sets correct sectionHeader for each YAML key', async () => {
      const content = `database: value1
server: value2`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.yml',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      const headers = chunks.map((c: Chunk) => c.sectionHeader).sort();
      expect(headers).toEqual(['database', 'server']);
    });

    it('sets breadcrumb as filename > key', async () => {
      const content = `database: value`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.yaml',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].breadcrumb).toBe('config.yaml > database');
    });

    it('sets fileRole to CONFIG', async () => {
      const content = `key: value`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.yaml',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].fileRole).toBe(FILE_ROLES.CONFIG);
    });

    it('includes type=yaml in metadata', async () => {
      const content = `key: value`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.yaml',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].metadata?.type).toBe('yaml');
    });

    it('handles .yml extension', async () => {
      const content = `database: value`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.yml',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(1);
      expect(chunks[0].sectionHeader).toBe('database');
    });

    it('falls back to single chunk on invalid YAML', async () => {
      const content = 'invalid: yaml: content: [';

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.yaml',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(content);
    });
  });

  describe('TOML config chunking', () => {
    it('creates one chunk per section', async () => {
      const content = `[database]
host = "localhost"
port = 5432

[server]
port = 3000

[logging]
level = "info"`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.toml',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(3);
    });

    it('sets sectionHeader from TOML section name', async () => {
      const content = `[database]
host = "localhost"

[server]
port = 3000`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.toml',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      const headers = chunks.map((c: Chunk) => c.sectionHeader).sort();
      expect(headers).toEqual(['database', 'server']);
    });

    it('sets breadcrumb as filename > section', async () => {
      const content = `[database]
host = "localhost"`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.toml',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].breadcrumb).toBe('config.toml > database');
    });

    it('sets fileRole to CONFIG', async () => {
      const content = `[section]
key = "value"`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.toml',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].fileRole).toBe(FILE_ROLES.CONFIG);
    });

    it('includes type=toml in metadata', async () => {
      const content = `[section]
key = "value"`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.toml',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].metadata?.type).toBe('toml');
    });

    it('handles array sections [[section]]', async () => {
      const content = `[[products]]
name = "Hammer"

[[products]]
name = "Nail"`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.toml',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
    });

    it('falls back to single chunk when no sections', async () => {
      const content = `key = "value"
another = 123`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.toml',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(1);
    });
  });

  describe('.env file chunking', () => {
    it('creates single chunk for entire .env file', async () => {
      const content = `DATABASE_HOST=localhost
DATABASE_PORT=5432
API_KEY=secret123`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: '.env',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(1);
    });

    it('includes all non-comment lines in chunk text', async () => {
      const content = `# Database config
DATABASE_HOST=localhost
# API config
API_KEY=secret123`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: '.env',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].text).toContain('DATABASE_HOST=localhost');
      expect(chunks[0].text).toContain('API_KEY=secret123');
      expect(chunks[0].text).not.toContain('# Database config');
    });

    it('sets sectionHeader to filename', async () => {
      const content = `KEY=value`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: '.env',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].sectionHeader).toBe('.env');
    });

    it('sets breadcrumb to filename', async () => {
      const content = `KEY=value`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: '.env',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].breadcrumb).toBe('.env');
    });

    it('sets fileRole to CONFIG', async () => {
      const content = `KEY=value`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: '.env',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].fileRole).toBe(FILE_ROLES.CONFIG);
    });

    it('includes type=env in metadata', async () => {
      const content = `KEY=value`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: '.env',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].metadata?.type).toBe('env');
    });

    it('handles empty .env file', async () => {
      const content = '';

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: '.env',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(0);
    });

    it('handles .env file with only comments', async () => {
      const content = `# Only comments here
# Nothing else`;

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: '.env',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(0);
    });
  });

  describe('fallback chunking', () => {
    it('falls back to single chunk for unknown extensions', async () => {
      const content = 'some config content';

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.ini',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(content);
      expect(chunks[0].fileRole).toBe(FILE_ROLES.CONFIG);
    });
  });

  describe('chunk indexing', () => {
    it('sets chunkIndex starting from 0', async () => {
      const content = JSON.stringify({ a: 1, b: 2 });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[1].chunkIndex).toBe(1);
    });

    it('sets totalChunks correctly', async () => {
      const content = JSON.stringify({ a: 1, b: 2, c: 3 });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      chunks.forEach((c: Chunk) => {
        expect(c.totalChunks).toBe(3);
      });
    });
  });

  describe('metadata', () => {
    it('includes filePath in metadata', async () => {
      const content = JSON.stringify({ key: 'value' });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: '/path/to/config.json',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].metadata?.filePath).toBe('/path/to/config.json');
    });

    it('includes sourceId in metadata', async () => {
      const content = JSON.stringify({ key: 'value' });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
        sourceId: 'my-source',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].metadata?.sourceId).toBe('my-source');
    });

    it('includes estimatedTokens in metadata', async () => {
      const content = JSON.stringify({ key: 'value' });

      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      expect(chunks[0].metadata?.estimatedTokens).toBeDefined();
      expect(typeof chunks[0].metadata?.estimatedTokens).toBe('string');
    });
  });

  describe('error handling', () => {
    it('handles empty content gracefully', async () => {
      const content = '';
      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(0);
    });

    it('handles whitespace-only content', async () => {
      const content = '   \n\n  ';
      const config: ChunkContentConfig = {
        ...baseConfig,
        filePath: 'config.json',
      };

      const result = await chunker.chunk(content, config);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(0);
    });
  });
});
