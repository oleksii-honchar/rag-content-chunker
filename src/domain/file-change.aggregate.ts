import { z } from 'zod';
import { DomainEvent } from '../utils/domain-event';
import { ErrorWithDetails } from '../utils/error-with-details';
import { Result } from '../utils/result';
import { FileAddedEvent, FileChangedEvent, FileDeletedEvent } from './events/file-events';

const fileChangeSchema = z.object({
  path: z.string().min(1),
  events: z.array(z.custom<DomainEvent>()),
});

export type FileChangeProps = z.infer<typeof fileChangeSchema>;

export class FileChange {
  private constructor(private readonly props: FileChangeProps) {}

  static of(props: FileChangeProps): Result<FileChange> {
    const parsed = fileChangeSchema.safeParse(props);
    if (!parsed.success) {
      return Result.ko(
        new ErrorWithDetails('Invalid file change data: ' + parsed.error.message, 'InvalidFileChange'),
      );
    }
    return Result.ok(new FileChange(parsed.data));
  }

  static add(path: string): Result<FileChange> {
    const eventResult = FileAddedEvent.of(path);
    if (eventResult.isKo()) {
      return eventResult as unknown as Result<FileChange>;
    }
    return FileChange.of({
      path,
      events: [eventResult.getValue()],
    });
  }

  static change(path: string): Result<FileChange> {
    const eventResult = FileChangedEvent.of(path);
    if (eventResult.isKo()) {
      return eventResult as unknown as Result<FileChange>;
    }
    return FileChange.of({
      path,
      events: [eventResult.getValue()],
    });
  }

  static delete(path: string): Result<FileChange> {
    const eventResult = FileDeletedEvent.of(path);
    if (eventResult.isKo()) {
      return eventResult as unknown as Result<FileChange>;
    }
    return FileChange.of({
      path,
      events: [eventResult.getValue()],
    });
  }

  get path(): string {
    return this.props.path;
  }

  get events(): DomainEvent[] {
    return this.props.events;
  }
}
