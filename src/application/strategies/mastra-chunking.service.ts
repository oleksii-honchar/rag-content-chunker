import { MDocument } from '@mastra/rag';
import { Injectable } from '@nestjs/common';
import { ContentChunk, FILE_ROLES, FileRole } from '../../domain/content-chunk.entity';
import { ConfigurationService } from '../../infrastructure/config/configuration.service';
import { BasePinoLogger } from '../../infrastructure/logging/base-pino-logger';
import { ErrorWithDetails } from '../../utils/error-with-details';
import { Result } from '../../utils/result';

type MastraChunkStrategy = 'markdown' | 'recursive' | 'json' | 'sentence';
type MastraDocumentType = 'markdown' | 'json' | 'html' | 'text';

@Injectable()
export class MastraChunkingService {
  constructor(
    private readonly configService: ConfigurationService,
    private readonly logger: BasePinoLogger,
  ) {}
  /**
   * Get max characters limit for a given file role from enhancement config.
   */
  private getMaxCharacters(fileRole: FileRole): number {
    const maxChars = this.configService.getEnhancementConfig().maxCharacters;

    switch (fileRole) {
      case FILE_ROLES.DOCS:
        return maxChars.prose;
      case FILE_ROLES.CODE:
        return maxChars.code;
      case FILE_ROLES.CONFIG:
        return maxChars.configuration;
      case FILE_ROLES.AGENT_OUTPUT:
        return maxChars.documentation;
      default:
        return maxChars.prose;
    }
  }

  /**
   * Chunk a file using Mastra MDocument with type-aware processing.
   */
  async chunkFile(content: string, filePath: string, sourceId: string): Promise<Result<ContentChunk[]>> {
    try {
      if (!content.trim()) {
        return Result.ok([]);
      }

      const strategy = this.determineStrategy(filePath);
      const docType = this.determineDocumentType(filePath);
      const fileRole = this.determineFileRole(filePath);

      // Create MDocument using type-aware factory
      const document = this.createDocument(content, docType, filePath, sourceId);

      // Apply chunking strategy with size config from enhancement.maxCharacters
      await this.applyChunking(document, strategy, fileRole);

      // Extract metadata (only if enrichment is enabled and LLM is configured)
      let enrichedDoc = document;
      const enrichmentConfig = this.configService.getEnrichmentConfig();
      if (enrichmentConfig.enabled && (enrichmentConfig.apiKey || enrichmentConfig.llmUrl)) {
        try {
          enrichedDoc = await document.extractMetadata({
            title: true,
            keywords: true,
          });
        } catch (metadataError) {
          // Graceful degradation: continue without LLM-enhanced metadata
          this.logger.debug(
            `Metadata extraction failed (chunks still generated): ${metadataError instanceof Error ? metadataError.message : String(metadataError)}`,
          );
        }
      }

      // Get chunks from MDocument using getDocs()
      const mastraChunks = enrichedDoc.getDocs();

      if (mastraChunks.length === 0) {
        return Result.ok([]);
      }

      // Map Mastra chunks to domain Chunk entities
      const chunks = this.mapToDomainChunks(mastraChunks, filePath, sourceId, fileRole, enrichedDoc);

      return Result.ok(chunks);
    } catch (error) {
      return Result.ko(
        new ErrorWithDetails(
          error instanceof Error ? error.message : 'Unknown error during Mastra chunking',
          'MastraChunkingError',
          { filePath, sourceId },
        ),
      );
    }
  }

  /**
   * Determine chunking strategy based on file extension.
   */
  private determineStrategy(filePath: string): MastraChunkStrategy {
    const ext = this.getExtension(filePath).toLowerCase();
    const basename = filePath.split('/').pop()?.toLowerCase() ?? '';

    // Markdown
    if (['.md', '.mdx', '.markdown'].includes(ext)) {
      return 'markdown';
    }

    // HTML — use markdown strategy (header-based splitting)
    if (['.html', '.htm'].includes(ext)) {
      return 'markdown';
    }

    // Code files — recursive chunking
    if (this.isCodeExtension(ext)) {
      return 'recursive';
    }

    // Config files — json strategy
    if (this.isConfigExtension(ext) || basename === '.env' || basename.startsWith('.env.')) {
      return 'json';
    }

    // Plain text — sentence-based
    if (['.txt', '.text', '.log'].includes(ext)) {
      return 'sentence';
    }

    // Fallback to sentence
    return 'sentence';
  }

  /**
   * Determine MDocument factory type based on file extension.
   */
  private determineDocumentType(filePath: string): MastraDocumentType {
    const ext = this.getExtension(filePath).toLowerCase();

    if (['.md', '.mdx', '.markdown'].includes(ext)) {
      return 'markdown';
    }

    if (['.json'].includes(ext)) {
      return 'json';
    }

    if (['.html', '.htm'].includes(ext)) {
      return 'html';
    }

    // Default to text for everything else (including yaml, code, etc.)
    return 'text';
  }

  /**
   * Determine file role based on file path and extension.
   */
  private determineFileRole(filePath: string): FileRole {
    const ext = this.getExtension(filePath).toLowerCase();
    const lowerPath = filePath.toLowerCase();

    // Agent output
    if (lowerPath.includes('.agent-sessions') || lowerPath.includes('agent-meta-tool')) {
      return FILE_ROLES.AGENT_OUTPUT;
    }

    // Config files
    if (this.isConfigExtension(ext)) {
      return FILE_ROLES.CONFIG;
    }

    // Code files
    if (this.isCodeExtension(ext)) {
      return FILE_ROLES.CODE;
    }

    // Default to docs
    return FILE_ROLES.DOCS;
  }

  /**
   * Create MDocument using type-aware factory.
   */
  private createDocument(
    content: string,
    docType: MastraDocumentType,
    filePath: string,
    sourceId: string,
  ): MDocument {
    const metadata = {
      filePath,
      sourceId,
    };

    switch (docType) {
      case 'markdown':
        return MDocument.fromMarkdown(content, metadata);
      case 'json':
        return MDocument.fromJSON(content, metadata);
      case 'html':
        return MDocument.fromHTML(content, metadata);
      case 'text':
      default:
        return MDocument.fromText(content, metadata);
    }
  }

  /**
   * Apply chunking strategy to MDocument with size limits from enhancement config.
   * No post-chunk truncation — Mastra handles splitting within limits natively.
   */
  private async applyChunking(
    document: MDocument,
    strategy: MastraChunkStrategy,
    fileRole: FileRole,
  ): Promise<void> {
    const maxChars = this.getMaxCharacters(fileRole);
    const minChars = Math.floor(maxChars * 0.5);
    const targetChars = Math.floor(maxChars * 0.75);
    // overlap must be < maxSize; use 25% of maxSize or 0 if too small
    const overlap = maxChars > 4 ? Math.floor(maxChars * 0.25) : 0;

    switch (strategy) {
      case 'markdown':
        // MarkdownTransformer: use maxSize per section
        await document.chunkMarkdown({ maxSize: maxChars, overlap });
        break;
      case 'recursive':
        // RecursiveCharacterTransformer: use maxSize
        await document.chunkRecursive({ maxSize: maxChars, overlap });
        break;
      case 'json':
        // RecursiveJsonTransformer: use maxSize + minSize
        await document.chunkJSON({ maxSize: maxChars, minSize: minChars });
        break;
      case 'sentence':
        // SentenceTransformer: use maxSize, minSize, targetSize
        await document.chunkSentence({
          maxSize: maxChars,
          minSize: minChars,
          targetSize: targetChars,
        });
        break;
    }
  }

  /**
   * Map Mastra chunks to domain Chunk entities.
   */
  private mapToDomainChunks(
    mastraChunks: { text: string; metadata?: Record<string, unknown> }[],
    filePath: string,
    sourceId: string,
    fileRole: FileRole,
    enrichedDoc: MDocument,
  ): ContentChunk[] {
    const totalChunks = mastraChunks.length;
    const chunks: ContentChunk[] = [];

    for (let i = 0; i < mastraChunks.length; i++) {
      const mastraChunk = mastraChunks[i];
      const chunkMetadata = mastraChunk.metadata ?? {};

      // Build metadata record
      const metadata: Record<string, string> = {
        filePath,
        sourceId,
      };

      // Include Mastra-extracted metadata if available
      const chunkTitle = typeof chunkMetadata.title === 'string' ? chunkMetadata.title : undefined;
      const chunkKeywords = typeof chunkMetadata.keywords === 'string' ? chunkMetadata.keywords : undefined;
      const enrichedDocInternal = enrichedDoc as unknown as { _metadata?: Record<string, unknown> };
      const docTitle =
        typeof enrichedDocInternal._metadata?.title === 'string'
          ? enrichedDocInternal._metadata.title
          : undefined;
      const docKeywords =
        typeof enrichedDocInternal._metadata?.keywords === 'string'
          ? enrichedDocInternal._metadata.keywords
          : undefined;

      if (chunkTitle) {
        metadata.mastraTitle = chunkTitle;
      }
      if (chunkKeywords) {
        metadata.mastraKeywords = chunkKeywords;
      }
      if (docTitle) {
        metadata.mastraDocTitle = docTitle;
      }
      if (docKeywords) {
        metadata.mastraDocKeywords = docKeywords;
      }

      const chunkResult = ContentChunk.create(
        mastraChunk.text,
        i + 1,
        totalChunks,
        chunkTitle || filePath,
        filePath,
        undefined,
        fileRole,
        false,
        undefined,
        undefined,
        metadata,
        0.5,
        [],
        'default',
      );

      if (chunkResult.isOk()) {
        chunks.push(chunkResult.getValue());
      }
    }

    return chunks;
  }

  /**
   * Get file extension (lowercase).
   */
  private getExtension(filePath: string): string {
    const parts = filePath.split('.');
    return parts.length > 1 ? `.${parts[parts.length - 1]}` : '';
  }

  /**
   * Check if extension is a code file.
   */
  private isCodeExtension(ext: string): boolean {
    return [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.go',
      '.java',
      '.rs',
      '.cs',
      '.php',
      '.rb',
      '.swift',
      '.kt',
      '.scala',
      '.cpp',
      '.c',
      '.h',
      '.hpp',
      '.m',
      '.mm',
      '.ex',
      '.exs',
      '.hs',
      '.pl',
      '.r',
      '.lua',
      '.dart',
      '.groovy',
    ].includes(ext);
  }

  /**
   * Check if extension is a config file.
   */
  private isConfigExtension(ext: string): boolean {
    return ['.json', '.yaml', '.yml', '.toml', '.xml', '.ini', '.cfg', '.conf'].includes(ext);
  }
}
