import { DomainEvent } from '@/utils/domain-event';
import { z } from 'zod';
import { AggregateResult } from '../utils/aggregate-result';
import { ErrorWithDetails } from '../utils/error-with-details';

const fileMemoryTrackerSchema = z.object({
  id: z.bigint(),
  filePath: z.string().min(1),
  memoryIds: z.array(z.string().min(1)),
  sourceId: z.string().min(1),
  memoryBank: z.string().min(1),
});

export type FileMemoryTrackerProps = z.infer<typeof fileMemoryTrackerSchema>;

export class FileMemoryTracker {
  private constructor(private readonly props: FileMemoryTrackerProps) {}

  static of(props: FileMemoryTrackerProps): AggregateResult<FileMemoryTracker, DomainEvent> {
    const parsed = fileMemoryTrackerSchema.safeParse(props);
    if (!parsed.success) {
      return AggregateResult.ko(
        new ErrorWithDetails(
          'Invalid FileMemoryTracker data: ' + parsed.error.message,
          'InvalidFileMemoryTracker',
        ),
      );
    }
    return AggregateResult.ok(new FileMemoryTracker(parsed.data), []);
  }

  remember(memoryId: string): AggregateResult<FileMemoryTracker, DomainEvent> {
    if (!memoryId || memoryId.trim().length === 0) {
      return AggregateResult.ko(new ErrorWithDetails('memoryId cannot be empty', 'EmptyMemoryId'));
    }
    if (this.props.memoryIds.includes(memoryId)) {
      return AggregateResult.ok(this, []);
    }
    return FileMemoryTracker.of({
      ...this.props,
      memoryIds: [...this.props.memoryIds, memoryId],
    });
  }

  forget(memoryId: string): AggregateResult<FileMemoryTracker, DomainEvent> {
    const filtered = this.props.memoryIds.filter(id => id !== memoryId);
    if (filtered.length === this.props.memoryIds.length) {
      return AggregateResult.ok(this, []);
    }
    return FileMemoryTracker.of({
      ...this.props,
      memoryIds: filtered,
    });
  }

  get id(): bigint {
    return this.props.id;
  }

  get filePath(): string {
    return this.props.filePath;
  }

  get memoryIds(): string[] {
    return this.props.memoryIds;
  }

  get sourceId(): string {
    return this.props.sourceId;
  }

  get memoryBank(): string {
    return this.props.memoryBank;
  }

  toJson(): FileMemoryTrackerProps {
    return {
      id: this.props.id,
      filePath: this.props.filePath,
      memoryIds: [...this.props.memoryIds],
      sourceId: this.props.sourceId,
      memoryBank: this.props.memoryBank,
    };
  }

  empty(): AggregateResult<FileMemoryTracker, DomainEvent> {
    return AggregateResult.ok(new FileMemoryTracker({} as FileMemoryTrackerProps), []);
  }
}
