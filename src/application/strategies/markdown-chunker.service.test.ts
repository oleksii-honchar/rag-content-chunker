import { Chunk, FILE_ROLES } from '../../domain/chunk.entity';
import { BasePinoLogger } from '../../infrastructure/logging/base-pino-logger';
import { ChunkContentConfig } from './chunker.interface';
import { MarkdownChunker } from './markdown-chunker.service';

describe('MarkdownChunker', () => {
  let chunker: MarkdownChunker;

  const createMockLogger = (): jest.Mocked<BasePinoLogger> => ({
    setContext: jest.fn(),
    log: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  });

  const baseConfig: ChunkContentConfig = {
    maxTokens: 500,
    overlapTokens: 50,
    hardCapTokens: 600,
    filePath: 'test.md',
    sourceId: 'test-source',
  };

  beforeEach(() => {
    chunker = new MarkdownChunker();
  });

  it('should implement Chunker interface', () => {
    expect(chunker.chunk).toBeDefined();
    expect(typeof chunker.chunk).toBe('function');
  });

  describe('chunk() with simple markdown', () => {
    it('returns chunks for simple markdown without headings', async () => {
      const content = 'Simple paragraph content without any headings.';
      const result = await chunker.chunk(content, baseConfig);

      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(content);
      expect(chunks[0].fileRole).toBe(FILE_ROLES.DOCS);
    });

    it('returns ok result with chunks', async () => {
      const content = '# Hello\n\nWorld';
      const result = await chunker.chunk(content, baseConfig);

      expect(result.isOk()).toBe(true);
    });

    it('returns ko result on error', async () => {
      const errorChunker = new MarkdownChunker();
      // Force error by overriding extractSections to throw
      (errorChunker as unknown as { extractSections: () => never }).extractSections = () => {
        throw new Error('simulated');
      };

      const result = await errorChunker.chunk('x', baseConfig);
      expect(result.isKo()).toBe(true);
    });
  });

  describe('heading-aware splitting', () => {
    it('splits on h1 boundaries', async () => {
      const content = `# Section One

Content of section one.

# Section Two

Content of section two.`;

      const result = await chunker.chunk(content, baseConfig);
      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();

      expect(chunks.length).toBe(2);
      expect(chunks[0].sectionHeader).toBe('Section One');
      expect(chunks[0].text).toContain('Content of section one');
      expect(chunks[1].sectionHeader).toBe('Section Two');
      expect(chunks[1].text).toContain('Content of section two');
    });

    it('splits on h2 boundaries within h1', async () => {
      const content = `# Main Topic

## Subsection A

Details A.

## Subsection B

Details B.`;

      const result = await chunker.chunk(content, baseConfig);
      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      const subA = chunks.find((c: Chunk) => c.sectionHeader === 'Subsection A');
      const subB = chunks.find((c: Chunk) => c.sectionHeader === 'Subsection B');
      expect(subA).toBeDefined();
      expect(subB).toBeDefined();
    });

    it('splits on h3 boundaries', async () => {
      const content = `# H1

## H2

### H3-A

Content A.

### H3-B

Content B.`;

      const result = await chunker.chunk(content, baseConfig);
      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();

      const h3A = chunks.find((c: Chunk) => c.sectionHeader === 'H3-A');
      const h3B = chunks.find((c: Chunk) => c.sectionHeader === 'H3-B');
      expect(h3A).toBeDefined();
      expect(h3B).toBeDefined();
    });
  });

  describe('breadcrumb construction', () => {
    it('builds breadcrumb from h1 > h2 > h3 hierarchy', async () => {
      const content = `# Top Level

## Middle Level

### Bottom Level

Content here.`;

      const result = await chunker.chunk(content, baseConfig);
      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();

      const bottomChunk = chunks.find((c: Chunk) => c.sectionHeader === 'Bottom Level');
      expect(bottomChunk).toBeDefined();
      expect(bottomChunk!.breadcrumb).toBe('Top Level > Middle Level > Bottom Level');
    });

    it('builds breadcrumb with h1 and h2 only', async () => {
      const content = `# Parent

## Child

Content.`;

      const result = await chunker.chunk(content, baseConfig);
      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();

      const childChunk = chunks.find((c: Chunk) => c.sectionHeader === 'Child');
      expect(childChunk).toBeDefined();
      expect(childChunk!.breadcrumb).toBe('Parent > Child');
    });

    it('resets breadcrumb on new h1', async () => {
      const content = `# First

## Under First

Content first.

# Second

## Under Second

Content second.`;

      const result = await chunker.chunk(content, baseConfig);
      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();

      const underFirst = chunks.find((c: Chunk) => c.sectionHeader === 'Under First');
      const underSecond = chunks.find((c: Chunk) => c.sectionHeader === 'Under Second');
      expect(underFirst!.breadcrumb).toBe('First > Under First');
      expect(underSecond!.breadcrumb).toBe('Second > Under Second');
    });
  });

  describe('large section splitting', () => {
    it('splits large sections into multiple chunks when exceeding maxTokens', async () => {
      const largeParagraph = 'Word '.repeat(600);
      const content = `# Big Section

${largeParagraph}

${largeParagraph}`;

      const result = await chunker.chunk(content, baseConfig);
      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();

      expect(chunks.length).toBeGreaterThanOrEqual(2);
      chunks.forEach((c: Chunk) => {
        const estimatedTokens = Math.ceil(c.text.length / 4);
        expect(estimatedTokens).toBeLessThanOrEqual(baseConfig.hardCapTokens);
      });
    });

    it('respects hard cap of 600 tokens', async () => {
      const hugeContent = 'Token '.repeat(10000);
      const content = `# Huge

${hugeContent}`;

      const result = await chunker.chunk(content, baseConfig);
      expect(result.isOk()).toBe(true);
      const chunks = result.getValue();

      chunks.forEach((c: Chunk) => {
        const estimatedTokens = Math.ceil(c.text.length / 4);
        expect(estimatedTokens).toBeLessThanOrEqual(baseConfig.hardCapTokens);
      });
    });
  });

  describe('chunk properties', () => {
    it('sets fileRole to DOCS', async () => {
      const content = '# Test\n\nContent';
      const result = await chunker.chunk(content, baseConfig);
      const chunks = result.getValue();

      chunks.forEach((c: Chunk) => {
        expect(c.fileRole).toBe(FILE_ROLES.DOCS);
      });
    });

    it('sets chunkIndex starting from 1', async () => {
      const content = '# Test\n\nContent';
      const result = await chunker.chunk(content, baseConfig);
      const chunks = result.getValue();

      expect(chunks[0].chunkIndex).toBe(1);
    });

    it('sets totalChunks correctly', async () => {
      const content = `# A\n\nOne.\n\n# B\n\nTwo.`;
      const result = await chunker.chunk(content, baseConfig);
      const chunks = result.getValue();

      chunks.forEach((c: Chunk) => {
        expect(c.totalChunks).toBe(chunks.length);
      });
    });

    it('sets metadata with filePath, sourceId, chunkNum, estimatedTokens', async () => {
      const content = '# Test\n\nContent';
      const result = await chunker.chunk(content, baseConfig);
      const chunks = result.getValue();

      expect(chunks[0].metadata).toBeDefined();
      expect(chunks[0].metadata!.filePath).toBe(baseConfig.filePath);
      expect(chunks[0].metadata!.sourceId).toBe(baseConfig.sourceId);
      expect(chunks[0].metadata!.chunkNum).toBeDefined();
      expect(chunks[0].metadata!.estimatedTokens).toBeDefined();
    });

    it('sets startLine and endLine', async () => {
      const content = '# Test\n\nLine 3\nLine 4';
      const result = await chunker.chunk(content, baseConfig);
      const chunks = result.getValue();

      expect(chunks[0].startLine).toBeDefined();
      expect(chunks[0].endLine).toBeDefined();
      expect(chunks[0].endLine!).toBeGreaterThanOrEqual(chunks[0].startLine!);
    });

    it('marks chunk as oversized if exceeding hardCap', async () => {
      const hugeContent = 'Token '.repeat(10000);
      const config: ChunkContentConfig = {
        ...baseConfig,
        maxTokens: 20000,
        hardCapTokens: 100,
      };
      const content = `# Big\n\n${hugeContent}`;
      const result = await chunker.chunk(content, config);
      const chunks = result.getValue();

      const hasOversized = chunks.some((c: Chunk) => c.oversized);
      expect(hasOversized).toBe(true);
    });
  });
});
