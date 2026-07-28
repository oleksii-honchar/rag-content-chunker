import { z } from 'zod';
import { Result } from '../../utils/result';

export const watchSourceEntitySchema = z.object({
  id: z.string(),
  path: z.string(),
  include: z.array(z.string()),
  exclude: z.array(z.string()),
  debounceMs: z.number().positive(),
  ignorePatterns: z.array(z.string()),
});

export type WatchSourceProps = z.infer<typeof watchSourceEntitySchema>;

export class WatchSource {
  private constructor(private readonly props: WatchSourceProps) {}

  static of(props: WatchSourceProps): Result<WatchSource> {
    const parsed = watchSourceEntitySchema.safeParse(props);
    if (!parsed.success) {
      return Result.ko(new Error('Invalid watch source data: ' + parsed.error.message));
    }
    return Result.ok(new WatchSource(parsed.data));
  }

  static create(
    id: string,
    path: string,
    include: string[],
    exclude: string[],
    debounceMs: number,
    ignorePatterns: string[],
  ): Result<WatchSource> {
    return WatchSource.of({
      id,
      path,
      include,
      exclude,
      debounceMs,
      ignorePatterns,
    });
  }

  get id(): string {
    return this.props.id;
  }
  get path(): string {
    return this.props.path;
  }
  get include(): string[] {
    return this.props.include;
  }
  get exclude(): string[] {
    return this.props.exclude;
  }
  get debounceMs(): number {
    return this.props.debounceMs;
  }
  get ignorePatterns(): string[] {
    return this.props.ignorePatterns;
  }
}
