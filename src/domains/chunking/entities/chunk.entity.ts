import { z } from 'zod';
import { Result } from '../../../utils/result';
import { ValuesType } from '../../../utils/values-type';

export const FILE_ROLES = {
  CONFIG: 'config' as const,
  CODE: 'code' as const,
  DOCS: 'docs' as const,
  AGENT_OUTPUT: 'agent-output' as const,
} as const;

export type FileRole = ValuesType<typeof FILE_ROLES>;

export const chunkEntitySchema = z.object({
  id: z.string().uuid(),
  text: z.string(),
  chunkIndex: z.number().nonnegative(),
  totalChunks: z.number().positive(),
  sectionHeader: z.string(),
  breadcrumb: z.string(),
  language: z.string().optional(),
  fileRole: z.nativeEnum(FILE_ROLES),
  oversized: z.boolean().optional().default(false),
  startLine: z.number().optional(),
  endLine: z.number().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
});

export type ChunkProps = z.infer<typeof chunkEntitySchema>;

export class Chunk {
  private constructor(private readonly props: ChunkProps) {}

  static of(props: ChunkProps): Result<Chunk> {
    const parsed = chunkEntitySchema.safeParse(props);
    if (!parsed.success) {
      return Result.ko(new Error('Invalid chunk data: ' + parsed.error.message));
    }
    return Result.ok(new Chunk(parsed.data));
  }

  static create(
    text: string,
    chunkIndex: number,
    totalChunks: number,
    sectionHeader: string,
    breadcrumb: string,
    language?: string,
    fileRole: FileRole = FILE_ROLES.DOCS,
    oversized: boolean = false,
    startLine?: number,
    endLine?: number,
    metadata?: Record<string, string>,
  ): Result<Chunk> {
    return Chunk.of({
      id: crypto.randomUUID(),
      text,
      chunkIndex,
      totalChunks,
      sectionHeader,
      breadcrumb,
      language,
      fileRole,
      oversized,
      startLine,
      endLine,
      metadata,
    });
  }

  get id(): string { return this.props.id; }
  get text(): string { return this.props.text; }
  get chunkIndex(): number { return this.props.chunkIndex; }
  get totalChunks(): number { return this.props.totalChunks; }
  get sectionHeader(): string { return this.props.sectionHeader; }
  get breadcrumb(): string { return this.props.breadcrumb; }
  get language(): string | undefined { return this.props.language; }
  get fileRole(): FileRole { return this.props.fileRole; }
  get oversized(): boolean { return this.props.oversized; }
  get startLine(): number | undefined { return this.props.startLine; }
  get endLine(): number | undefined { return this.props.endLine; }
  get metadata(): Record<string, string> | undefined { return this.props.metadata; }
}
