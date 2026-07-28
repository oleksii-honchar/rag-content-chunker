import { Chunk, FILE_ROLES } from './chunk.entity';
import { Result } from '../../../utils/result';

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
      });

      expect(result.isOk()).toBe(true);
      const chunk = result.getValue();
      expect(chunk.id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(chunk.text).toBe('Test content');
    });

    it('with invalid id returns ko', () => {
      const result = Chunk.of({
        id: 'not-a-uuid',
        text: 'Test',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: FILE_ROLES.DOCS,
        oversized: false,
      });

      expect(result.isKo()).toBe(true);
    });

    it('with negative chunkIndex returns ko', () => {
      const result = Chunk.of({
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Test',
        chunkIndex: -1,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: FILE_ROLES.DOCS,
        oversized: false,
      });

      expect(result.isKo()).toBe(true);
    });

    it('with zero totalChunks returns ko', () => {
      const result = Chunk.of({
        id: '123e4567-e89b-12d3-a456-426614174000',
        text: 'Test',
        chunkIndex: 0,
        totalChunks: 0,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: FILE_ROLES.DOCS,
        oversized: false,
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
      const result = Chunk.create(
        'Content',
        0,
        1,
        'Header',
        'breadcrumb',
      );

      const chunk = result.getValue();
      expect(chunk.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    it('defaults fileRole to DOCS', () => {
      const result = Chunk.create(
        'Content',
        0,
        1,
        'Header',
        'breadcrumb',
      );

      const chunk = result.getValue();
      expect(chunk.fileRole).toBe(FILE_ROLES.DOCS);
    });

    it('defaults oversized to false', () => {
      const result = Chunk.create(
        'Content',
        0,
        1,
        'Header',
        'breadcrumb',
      );

      const chunk = result.getValue();
      expect(chunk.oversized).toBe(false);
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
