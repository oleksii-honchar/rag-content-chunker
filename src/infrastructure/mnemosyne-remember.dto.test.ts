import { ContentChunk } from '../domain/content-chunk.entity';
import { MnemosyneRememberDto } from './mnemosyne-remember.dto';

describe('MnemosyneRememberDto', () => {
  describe('fromChunk', () => {
    it('maps all required chunk properties to remember payload', () => {
      const chunk = ContentChunk.of({
        id: 1111111111111111111n,
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
        memoryBank: 'vault-knowledge',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.content).toBe('Test chunk content');
      expect(dto.memory_bank).toBe('vault-knowledge');
      expect(dto.importance).toBe(0.8);
      expect(dto.source).toBe('vault-knowledge');
      expect(dto.metadata.id).toBe(1111111111111111111n);
      expect(dto.metadata.chunkIndex).toBe(2);
      expect(dto.metadata.totalChunks).toBe(5);
      expect(dto.metadata.sectionHeader).toBe('## Getting Started');
      expect(dto.metadata.breadcrumb).toBe('root > docs > getting-started');
      expect(dto.metadata.fileRole).toBe('docs');
      expect(dto.metadata.startLine).toBe(10);
      expect(dto.metadata.endLine).toBe(45);
      expect(dto.metadata.importance).toBe(0.8);
      expect(dto.metadata.tags).toEqual(['important', 'guide']);
      expect(dto.metadata.memoryBank).toBe('vault-knowledge');
    });

    it('includes language in metadata when present', () => {
      const chunk = ContentChunk.of({
        id: 2222222222222222222n,
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
        memoryBank: 'default',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.metadata.language).toBe('typescript');
    });

    it('omits language from metadata when not present', () => {
      const chunk = ContentChunk.of({
        id: 3333333333333333333n,
        text: 'Some docs',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Docs',
        breadcrumb: 'docs',
        fileRole: 'docs' as const,
        oversized: false,
        importance: 0.5,
        tags: [],
        memoryBank: 'default',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.metadata.language).toBeUndefined();
    });

    it('omits startLine and endLine from metadata when not present', () => {
      const chunk = ContentChunk.of({
        id: 4444444444444444444n,
        text: 'No line numbers',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: 'docs' as const,
        oversized: false,
        importance: 0.5,
        tags: [],
        memoryBank: 'default',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.metadata.startLine).toBeUndefined();
      expect(dto.metadata.endLine).toBeUndefined();
    });

    it('merges chunk metadata into result metadata', () => {
      const chunk = ContentChunk.of({
        id: 5555555555555555555n,
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
        memoryBank: 'default',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.metadata.customKey).toBe('customValue');
      expect(dto.metadata.anotherKey).toBe('anotherValue');
      // Standard fields still present
      expect(dto.metadata.id).toBe(5555555555555555555n);
      expect(dto.metadata.memoryBank).toBe('default');
    });

    it('uses default values for chunk with defaults', () => {
      const chunk = ContentChunk.of({
        id: 7777777777777777777n,
        text: 'default test',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Header',
        breadcrumb: 'breadcrumb',
        fileRole: 'docs' as const,
        oversized: false,
        importance: 0.5,
        tags: [],
        memoryBank: 'default',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.memory_bank).toBe('default');
      expect(dto.importance).toBe(0.5);
      expect(dto.source).toBe('default');
      expect(dto.metadata.memoryBank).toBe('default');
      expect(dto.metadata.importance).toBe(0.5);
      expect(dto.metadata.tags).toEqual([]);
      expect(dto.metadata.fileRole).toBe('docs');
    });

    it('sets source equal to memory bank (not literal "chunk")', () => {
      const chunk = ContentChunk.of({
        id: 6666666666666666666n,
        text: 'Source test',
        chunkIndex: 0,
        totalChunks: 1,
        sectionHeader: 'Test',
        breadcrumb: 'test',
        fileRole: 'docs' as const,
        oversized: false,
        importance: 0.5,
        tags: [],
        memoryBank: 'obsidian-notes',
      }).getValue();

      const dto = MnemosyneRememberDto.fromChunk(chunk);

      expect(dto.source).toBe('obsidian-notes');
      expect(dto.source).not.toBe('chunk');
    });
  });
});
