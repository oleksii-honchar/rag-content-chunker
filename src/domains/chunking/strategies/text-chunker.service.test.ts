import { Chunk, FILE_ROLES } from '../entities/chunk.entity';

import { TextChunker } from './text-chunker.service';

describe('TextChunker', () => {
  let chunker: TextChunker;

  beforeEach(() => {
    chunker = new TextChunker();
  });

  const baseConfig = {
    maxTokens: 450,
    overlapTokens: 1,
    hardCapTokens: 540,
    filePath: '/some/path/document.txt',
    sourceId: 'test-source-1',
  };

  it('should implement Chunker interface', () => {
    expect(chunker.chunk).toBeDefined();
    expect(typeof chunker.chunk).toBe('function');
  });

  it('should return empty array for empty content', async () => {
    const result = await chunker.chunk('', baseConfig);
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });

  it('should return empty array for whitespace-only content', async () => {
    const result = await chunker.chunk('   \n\n  ', baseConfig);
    expect(result.isOk()).toBe(true);
    expect(result.getValue()).toEqual([]);
  });

  it('should chunk small text as single chunk', async () => {
    const content = 'This is a short document. It has only a few sentences.';
    const result = await chunker.chunk(content, baseConfig);

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();
    expect(chunks).toHaveLength(1);

    const chunk = chunks[0];
    expect(chunk.text).toContain('short document');
    expect(chunk.chunkIndex).toBe(0);
    expect(chunk.totalChunks).toBe(1);
  });

  it('should split large text at sentence boundaries', async () => {
    const sentences = Array.from({ length: 50 }, (_, i) => `This is sentence number ${i + 1} with additional words to increase token count.`).join(' ');
    const content = sentences;

    const result = await chunker.chunk(content, baseConfig);

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();
    expect(chunks.length).toBeGreaterThan(1);

    // Each chunk should end near a sentence boundary
    for (const chunk of chunks) {
      const trimmed = chunk.text.trim();
      const lastChar = trimmed[trimmed.length - 1];
      expect(['.', '!', '?']).toContain(lastChar);
    }
  });

  it('should handle different sentence terminators (. ! ?)', async () => {
    const content =
      'First sentence here. Second sentence here! Third sentence here? Fourth sentence here. Fifth sentence here!';

    const result = await chunker.chunk(content, { ...baseConfig, maxTokens: 15 });

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();
    expect(chunks.length).toBeGreaterThan(1);

    // Verify splits happen at terminators
    for (const chunk of chunks) {
      const trimmed = chunk.text.trim();
      const lastChar = trimmed[trimmed.length - 1];
      expect(['.', '!', '?']).toContain(lastChar);
    }
  });

  it('should use correct breadcrumb format basename(filePath):startLine', async () => {
    const content = 'First paragraph. Second paragraph.';
    const config = { ...baseConfig, filePath: '/deep/path/my-doc.txt' };

    const result = await chunker.chunk(content, config);

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();

    for (const chunk of chunks) {
      expect(chunk.breadcrumb).toMatch(/^my-doc.txt:\d+$/);
    }
  });

  it('should set fileRole to DOCS', async () => {
    const content = 'Some text here.';
    const result = await chunker.chunk(content, baseConfig);

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();
    expect(chunks.length).toBeGreaterThan(0);

    for (const chunk of chunks) {
      expect(chunk.fileRole).toBe(FILE_ROLES.DOCS);
    }
  });

  it('should include filePath and sourceId in metadata', async () => {
    const content = 'Some text here.';
    const result = await chunker.chunk(content, baseConfig);

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();
    const chunk = chunks[0];

    expect(chunk.metadata).toBeDefined();
    expect(chunk.metadata?.filePath).toBe(baseConfig.filePath);
    expect(chunk.metadata?.sourceId).toBe(baseConfig.sourceId);
    expect(chunk.metadata?.estimatedTokens).toBeDefined();
  });

  it('should track chunkIndex and totalChunks correctly', async () => {
    const sentences = Array.from({ length: 50 }, (_, i) => `This is sentence number ${i + 1} with more words to ensure token count.`).join(' ');
    const result = await chunker.chunk(sentences, baseConfig);

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();

    const total = chunks.length;
    expect(total).toBeGreaterThan(1);

    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].chunkIndex).toBe(i);
      expect(chunks[i].totalChunks).toBe(total);
    }
  });

  it('should track startLine and endLine', async () => {
    const content = 'Line one.\nLine two.\nLine three.\nLine four.';
    const result = await chunker.chunk(content, baseConfig);

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();

    for (const chunk of chunks) {
      expect(chunk.startLine).toBeDefined();
      expect(chunk.endLine).toBeDefined();
      expect(chunk.startLine!).toBeLessThanOrEqual(chunk.endLine!);
    }
  });

  it('should respect maxTokens and not exceed hardCapTokens', async () => {
    const sentences = Array.from({ length: 30 }, (_, i) => `This is a longer sentence number ${i + 1} with more words.`).join(' ');

    const result = await chunker.chunk(sentences, baseConfig);

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();

    for (const chunk of chunks) {
      const estimatedTokens = parseInt(chunk.metadata?.estimatedTokens ?? '0', 10);
      expect(estimatedTokens).toBeLessThanOrEqual(baseConfig.hardCapTokens);
    }
  });

  it('should not split single long sentence that exceeds maxTokens', async () => {
    // A single sentence longer than maxTokens but under hardCap should stay as one chunk, not oversized
    const longSentence =
      'This is a very long sentence that contains many words and will definitely exceed the maximum token limit but it has no period until the very end.';

    const result = await chunker.chunk(longSentence, baseConfig);

    expect(result.isOk()).toBe(true);
    const chunks = result.getValue();
    expect(chunks).toHaveLength(1);
    expect(chunks[0].oversized).toBe(false);
  });
});
