import { z } from 'zod';
import { ErrorWithDetails } from '../utils/error-with-details';
import { Result } from '../utils/result';
import { ValuesType } from '../utils/values-type';

export const FILE_ROLES = {
  CONFIG: 'config' as const,
  CODE: 'code' as const,
  DOCS: 'docs' as const,
  AGENT_OUTPUT: 'agent-output' as const,
} as const;

export type FileRole = ValuesType<typeof FILE_ROLES>;

export const contentChunkSchema = z.object({
  id: z.bigint().positive(),
  text: z.string(),
  chunkIndex: z.number().nonnegative(),
  totalChunks: z.number().positive(),
  sectionHeader: z.string(),
  breadcrumb: z.string(),
  language: z.string().optional(),
  fileRole: z.enum(Object.values(FILE_ROLES)),
  oversized: z.boolean().default(false),
  startLine: z.number().optional(),
  endLine: z.number().optional(),
  metadata: z.record(z.string(), z.string()).optional(),
  importance: z.number().min(0).max(1).default(0.5),
  tags: z.array(z.string().min(1)).max(20).default([]),
  memoryBank: z.string().min(1).default('default'),
});

export type ContentChunkProps = z.infer<typeof contentChunkSchema>;

export class ContentChunk {
  private constructor(private readonly props: ContentChunkProps) {}

  static of(props: ContentChunkProps): Result<ContentChunk> {
    const parsed = contentChunkSchema.safeParse(props);
    if (!parsed.success) {
      return Result.ko(new ErrorWithDetails('Invalid chunk data: ' + parsed.error.message, 'InvalidChunk'));
    }
    return Result.ok(new ContentChunk(parsed.data));
  }

  get id(): bigint {
    return this.props.id;
  }
  get text(): string {
    return this.props.text;
  }
  get chunkIndex(): number {
    return this.props.chunkIndex;
  }
  get totalChunks(): number {
    return this.props.totalChunks;
  }
  get sectionHeader(): string {
    return this.props.sectionHeader;
  }
  get breadcrumb(): string {
    return this.props.breadcrumb;
  }
  get language(): string | undefined {
    return this.props.language;
  }
  get fileRole(): FileRole {
    return this.props.fileRole;
  }
  get oversized(): boolean {
    return this.props.oversized;
  }
  get startLine(): number | undefined {
    return this.props.startLine;
  }
  get endLine(): number | undefined {
    return this.props.endLine;
  }
  get metadata(): Record<string, string> | undefined {
    return this.props.metadata;
  }
  get importance(): number {
    return this.props.importance;
  }
  get tags(): string[] {
    return this.props.tags;
  }
  get memoryBank(): string {
    return this.props.memoryBank;
  }
}
