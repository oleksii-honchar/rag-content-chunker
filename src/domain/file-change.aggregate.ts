import { z } from 'zod';
import { DomainEvent } from '../utils/domain-event';
import { ErrorWithDetails } from '../utils/error-with-details';
import { Result } from '../utils/result';
import { FileAddedEvent, FileChangedEvent, FileDeletedEvent } from './events/file-events';

const fileChangeSchema = z.object({
  events: z.array(z.custom<DomainEvent>()),
});

export type FileChangeProps = z.infer<typeof fileChangeSchema>;

export class FileChange {
  private constructor(private readonly props: FileChangeProps) {}

  static empty(): FileChange {
    return new FileChange({ events: [] });
  }

  static of(props: FileChangeProps): Result<FileChange> {
    const parsed = fileChangeSchema.safeParse(props);
    if (!parsed.success) {
      return Result.ko(
        new ErrorWithDetails('Invalid file change data: ' + parsed.error.message, 'InvalidFileChange'),
      );
    }
    return Result.ok(new FileChange(parsed.data));
  }

  add(filePath: string): Result<FileChange> {
    const eventResult = FileAddedEvent.of(filePath);
    if (eventResult.isKo()) {
      return eventResult as unknown as Result<FileChange>;
    }
    const fileChange = FileChange.empty();
    fileChange.props.events.push(eventResult.getValue());
    return Result.ok(fileChange);
  }

  change(filePath: string): Result<FileChange> {
    const eventResult = FileChangedEvent.of(filePath);
    if (eventResult.isKo()) {
      return eventResult as unknown as Result<FileChange>;
    }
    const fileChange = FileChange.empty();
    fileChange.props.events.push(eventResult.getValue());
    return Result.ok(fileChange);
  }

  delete(filePath: string): Result<FileChange> {
    const eventResult = FileDeletedEvent.of(filePath);
    if (eventResult.isKo()) {
      return eventResult as unknown as Result<FileChange>;
    }
    const fileChange = FileChange.empty();
    fileChange.props.events.push(eventResult.getValue());
    return Result.ok(fileChange);
  }

  get events(): DomainEvent[] {
    return this.props.events;
  }
}
