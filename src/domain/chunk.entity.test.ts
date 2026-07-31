import { Chunk, FILE_ROLES } from './chunk.entity';

const VALID_CHUNK_PROPS = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  text: 'Test content',
  chunkIndex: 0,
  totalChunks: 1,
  sectionHeader: 'Test',
  breadcrumb: 'test',
  fileRole: FILE_ROLES.DOCS,
  oversized: false,
  importance: 0.5,
  tags: [] as string[],
  namespace: 'default',
};

describe('Chunk', () => {
  describe('Chunk.of', () => {
    it('with valid props returns ok', () => {
      const result = Chunk.of({
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Test content',
        chunkIndex: 0,
        totalChunks: 5,
        sectionHeader: 'Introduction',
        breadcrumb: 'root > section > intro',
        language: 'typescript',
        fileRole: FILE_ROLES.CODE,
        oversized: false,
        startLine: 1,
        endLine: 50,
        metadata: { key: 'value' },
        importance: 0.5,
        tags: [],
        namespace: 'default',
      });

      expect(result.isOk()).toBe(true);
      const chunk = result.getValue();
      expect(chunk.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(chunk.text).toBe('Test content');
    });

    it('with invalid id returns ko', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        id: 'not-a-uuid',
      });

      expect(result.isKo()).toBe(true);
    });

    it('with negative chunkIndex returns ko', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        chunkIndex: -1,
      });

      expect(result.isKo()).toBe(true);
    });

    it('with zero totalChunks returns ko', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        totalChunks: 0,
      });

      expect(result.isKo()).toBe(true);
    });

    it('with missing required fields returns ko', () => {
      const result = Chunk.of({
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Test',
        chunkIndex: 0,
        totalChunks: 1,
        // missing sectionHeader, breadcrumb, fileRole
      } as never);

      expect(result.isKo()).toBe(true);
    });

    it('with importance > 1 returns ko', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        importance: 1.5,
      } as never);

      expect(result.isKo()).toBe(true);
    });

    it('with importance < 0 returns ko', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        importance: -0.1,
      } as never);

      expect(result.isKo()).toBe(true);
    });

    it('with empty string tag returns ko', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        tags: ['valid-tag', ''],
      } as never);

      expect(result.isKo()).toBe(true);
    });

    it('with too many tags returns ko', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        tags: Array.from({ length: 21 }, (_, i) => `tag-${i}`),
      } as never);

      expect(result.isKo()).toBe(true);
    });

    it('with empty namespace returns ko', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        namespace: '',
      } as never);

      expect(result.isKo()).toBe(true);
    });
  });

  describe('Chunk.of — enhancement fields', () => {
    it('with valid importance returns ok', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        importance: 0.85,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().importance).toBe(0.85);
    });

    it('with valid tags returns ok', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        tags: ['typescript', 'config', 'important'],
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().tags).toEqual(['typescript', 'config', 'important']);
    });

    it('with valid namespace returns ok', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
        namespace: 'vault-knowledge',
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().namespace).toBe('vault-knowledge');
    });

    it('defaults importance to 0.5 when omitted', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().importance).toBe(0.5);
    });

    it('defaults tags to empty array when omitted', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().tags).toEqual([]);
    });

    it('defaults namespace to "default" when omitted', () => {
      const result = Chunk.of({
        ...VALID_CHUNK_PROPS,
      });

      expect(result.isOk()).toBe(true);
      expect(result.getValue().namespace).toBe('default');
    });
  });

  describe('Chunk.create', () => {
    it('returns ok with valid args', () => {
      const result = Chunk.create(
        'Test content',
        0,
        3,
        'Section Header',
        'root > section',
        'markdown',
        FILE_ROLES.DOCS,
        false,
        1,
        100,
        { source: 'test' },
      );

      expect(result.isOk()).toBe(true);
    });

    it('generates UUID for id', () => {
      const result = Chunk.create('Content', 0, 1, 'Header', 'breadcrumb');

      const chunk = result.getValue();
      expect(chunk.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('defaults fileRole to DOCS', () => {
      const result = Chunk.create('Content', 0, 1, 'Header', 'breadcrumb');

      const chunk = result.getValue();
      expect(chunk.fileRole).toBe(FILE_ROLES.DOCS);
    });

    it('defaults oversized to false', () => {
      const result = Chunk.create('Content', 0, 1, 'Header', 'breadcrumb');

      const chunk = result.getValue();
      expect(chunk.oversized).toBe(false);
    });

    it('accepts importance parameter', () => {
      const result = Chunk.create(
        'Content',
        0,
        1,
        'Header',
        'breadcrumb',
        undefined,
        FILE_ROLES.DOCS,
        false,
        undefined,
        undefined,
        undefined,
        0.9,
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().importance).toBe(0.9);
    });

    it('accepts tags parameter', () => {
      const result = Chunk.create(
        'Content',
        0,
        1,
        'Header',
        'breadcrumb',
        undefined,
        FILE_ROLES.DOCS,
        false,
        undefined,
        undefined,
        undefined,
        0.5,
        ['tag1', 'tag2'],
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().tags).toEqual(['tag1', 'tag2']);
    });

    it('accepts namespace parameter', () => {
      const result = Chunk.create(
        'Content',
        0,
        1,
        'Header',
        'breadcrumb',
        undefined,
        FILE_ROLES.DOCS,
        false,
        undefined,
        undefined,
        undefined,
        0.5,
        [],
        'my-namespace',
      );

      expect(result.isOk()).toBe(true);
      expect(result.getValue().namespace).toBe('my-namespace');
    });
  });

  describe('getters', () => {
    let chunk: Chunk;

    beforeEach(() => {
      const result = Chunk.of({
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Test content here',
        chunkIndex: 2,
        totalChunks: 5,
        sectionHeader: 'Main Section',
        breadcrumb: 'root > main',
        language: 'typescript',
        fileRole: FILE_ROLES.CODE,
        oversized: true,
        startLine: 10,
        endLine: 150,
        metadata: { key: 'value', another: 'data' },
        importance: 0.75,
        tags: ['important', 'config'],
        namespace: 'vault-knowledge',
      });
      chunk = result.getValue();
    });

    it('all getters return correct values', () => {
      expect(chunk.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(chunk.text).toBe('Test content here');
      expect(chunk.chunkIndex).toBe(2);
      expect(chunk.totalChunks).toBe(5);
      expect(chunk.sectionHeader).toBe('Main Section');
      expect(chunk.breadcrumb).toBe('root > main');
      expect(chunk.language).toBe('typescript');
      expect(chunk.fileRole).toBe(FILE_ROLES.CODE);
      expect(chunk.oversized).toBe(true);
      expect(chunk.startLine).toBe(10);
      expect(chunk.endLine).toBe(150);
      expect(chunk.metadata).toEqual({ key: 'value', another: 'data' });
      expect(chunk.importance).toBe(0.75);
      expect(chunk.tags).toEqual(['important', 'config']);
      expect(chunk.namespace).toBe('vault-knowledge');
    });
  });

  describe('FILE_ROLES', () => {
    it('contains expected values', () => {
      expect(FILE_ROLES.CONFIG).toBe('config');
      expect(FILE_ROLES.CODE).toBe('code');
      expect(FILE_ROLES.DOCS).toBe('docs');
      expect(FILE_ROLES.AGENT_OUTPUT).toBe('agent-output');
    });
  });
});
