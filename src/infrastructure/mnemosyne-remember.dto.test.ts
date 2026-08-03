import { ContentChunk } from '../domain/content-chunk.entity';
import { MnemosyneRememberDto } from './mnemosyne-remember.dto';

describe('MnemosyneRememberDto', () => {
  describe('fromChunk', () => {
    it('maps all required chunk properties to remember payload', () => {
      const chunk = ContentChunk.of({
        id: '550e8400-e29b-41d4-a716-446655440000',
        text: 'Test chunk content',
        chunkIndex: 2,
        totalChunks: 5,
        sectionHeader: '## Getting Started',
        breadcrumb: 'root > docs > getting-started',
        fileRole: 'docs' as const,
        oversized: false,
        startLine: 10,
        endLine: 45,
        importance: 0.8,
        tags: ['important', 'guide'],
        namespace: 'vault-knowledge',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.content).toBe('Test chunk content');
      expect(dto.namespace).toBe('vault-knowledge');
      expect(dto.importance).toBe(0.8);
      expect(dto.source).toBe('vault-knowledge');
      expect(dto.metadata.id).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(dto.metadata.chunkIndex).toBe(2);
      expect(dto.metadata.totalChunks).toBe(5);
      expect(dto.metadata.sectionHeader).toBe('## Getting Started');
      expect(dto.metadata.breadcrumb).toBe('root > docs > getting-started');
      expect(dto.metadata.fileRole).toBe('docs');
      expect(dto.metadata.startLine).toBe(10);
      expect(dto.metadata.endLine).toBe(45);
      expect(dto.metadata.importance).toBe(0.8);
      expect(dto.metadata.tags).toEqual(['important', 'guide']);
      expect(dto.metadata.namespace).toBe('vault-knowledge');
    });

    it('includes language in metadata when present', () => {
      const chunk = ContentChunk.of({
        id: '550e8400-e29b-41d4-a716-446655440001',
        text: 'function hello() {}',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Code',
        breadcrumb: 'src > index.ts',
        language: 'typescript',
        fileRole: 'code' as const,
        oversized: false,
        startLine: 1,
        endLine: 10,
        importance: 0.5,
        tags: [],
        namespace: 'default',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.metadata.language).toBe('typescript');
    });

    it('omits language from metadata when not present', () => {
      const chunk = ContentChunk.of({
        id: '550e8400-e29b-41d4-a716-446655440002',
        text: 'Some docs',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Docs',
        breadcrumb: 'docs',
        fileRole: 'docs' as const,
        oversized: false,
        importance: 0.5,
        tags: [],
        namespace: 'default',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.metadata.language).toBeUndefined();
    });

    it('omits startLine and endLine from metadata when not present', () => {
      const chunk = ContentChunk.of({
        id: '550e8400-e29b-41d4-a716-446655440003',
        text: 'No line numbers',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: 'docs' as const,
        oversized: false,
        importance: 0.5,
        tags: [],
        namespace: 'default',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.metadata.startLine).toBeUndefined();
      expect(dto.metadata.endLine).toBeUndefined();
    });

    it('merges chunk metadata into result metadata', () => {
      const chunk = ContentChunk.of({
        id: '550e8400-e29b-41d4-a716-446655440004',
        text: 'Custom metadata test',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: 'docs' as const,
        oversized: false,
        metadata: {
          customKey: 'customValue',
          anotherKey: 'anotherValue',
        },
        importance: 0.5,
        tags: [],
        namespace: 'default',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.metadata.customKey).toBe('customValue');
      expect(dto.metadata.anotherKey).toBe('anotherValue');
      // Standard fields still present
      expect(dto.metadata.id).toBe('550e8400-e29b-41d4-a716-446655440004');
      expect(dto.metadata.namespace).toBe('default');
    });

    it('uses default values for chunk with defaults', () => {
      const chunk = ContentChunk.create('default test', 0, 1, 'Header', 'breadcrumb').getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.namespace).toBe('default');
      expect(dto.importance).toBe(0.5);
      expect(dto.source).toBe('default');
      expect(dto.metadata.namespace).toBe('default');
      expect(dto.metadata.importance).toBe(0.5);
      expect(dto.metadata.tags).toEqual([]);
      expect(dto.metadata.fileRole).toBe('docs');
    });

    it('sets source equal to namespace (not literal "chunk")', () => {
      const chunk = ContentChunk.of({
        id: '550e8400-e29b-41d4-a716-446655440005',
        text: 'Source test',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: 'docs' as const,
        oversized: false,
        importance: 0.5,
        tags: [],
        namespace: 'obsidian-notes',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.source).toBe('obsidian-notes');
      expect(dto.source).not.toBe('chunk');
    });
  });
});
