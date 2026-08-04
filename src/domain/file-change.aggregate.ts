import { ValuesType } from '@/utils/values-type';
import { z } from 'zod';
import { ErrorWithDetails } from '../utils/error-with-details';
import { Result } from '../utils/result';
import { FileAddedEvent, FileChangedEvent, FileDeletedEvent } from './events/file-events';

/**
 * File change status — tracks the current state of a file.
 */
export const FILE_CHANGE_STATUS = {
  ADDED: 'added' as const,
  CHANGED: 'changed' as const,
  DELETED: 'deleted' as const,
} as const;

export type FileChangeStatus = ValuesType<typeof FILE_CHANGE_STATUS>;

const fileChangeSchema = z.object({
  filePath: z.string().min(1),
  status: z.enum(Object.values(FILE_CHANGE_STATUS)),
});

export type FileChangeProps = z.infer<typeof fileChangeSchema>;

export class FileChange {
  private constructor(private readonly props: FileChangeProps) {}

  /**
   * Create a new file change with ADDED status and emit FileAddedEvent.
   */
  static add(filePath: string): Result<FileChange> {
    const eventResult = FileAddedEvent.of(filePath);
    if (eventResult.isKo()) {
      return Result.ko(eventResult.getErrors());
    }
    const event = eventResult.getValue();
    const aggregateResult = FileChange.of({ filePath, status: FILE_CHANGE_STATUS.ADDED });
    if (aggregateResult.isKo()) {
      return aggregateResult;
    }
    return Result.ok(aggregateResult.getValue(), [event]);
  }

  /**
   * Transition to CHANGED status and emit FileChangedEvent.
   */
  change(): Result<FileChange> {
    const eventResult = FileChangedEvent.of(this.props.filePath);
    if (eventResult.isKo()) {
      return Result.ko(eventResult.getErrors());
    }
    const event = eventResult.getValue();
    const aggregateResult = FileChange.of({
      ...this.props,
      status: FILE_CHANGE_STATUS.CHANGED,
    });
    if (aggregateResult.isKo()) {
      return aggregateResult;
    }
    return Result.ok(aggregateResult.getValue(), [event]);
  }

  /**
   * Transition to DELETED status and emit FileDeletedEvent.
   */
  delete(): Result<FileChange> {
    const eventResult = FileDeletedEvent.of(this.props.filePath);
    if (eventResult.isKo()) {
      return Result.ko(eventResult.getErrors());
    }
    const event = eventResult.getValue();
    const aggregateResult = FileChange.of({
      ...this.props,
      status: FILE_CHANGE_STATUS.DELETED,
    });
    if (aggregateResult.isKo()) {
      return aggregateResult;
    }
    return Result.ok(aggregateResult.getValue(), [event]);
  }

  static of(props: FileChangeProps): Result<FileChange> {
    const parsed = fileChangeSchema.safeParse(props);
    if (!parsed.success) {
      return Result.ko([
        new ErrorWithDetails('Invalid file change data: ' + parsed.error.message, 'InvalidFileChange'),
      ]);
    }
    return Result.ok(new FileChange(parsed.data));
  }

  get filePath(): string {
    return this.props.filePath;
  }

  get status(): FileChangeStatus {
    return this.props.status;
  }

  toJson(): FileChangeProps {
    return {
      filePath: this.props.filePath,
      status: this.props.status,
    };
  }
}
