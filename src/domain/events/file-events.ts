import { Result } from '../../utils/result';
import { DomainEvent, FILE_EVENTS } from './domain-event';

export class FileAddedEvent implements DomainEvent {
  readonly type: string;
  readonly timestamp: Date;
  readonly path: string;

  private constructor(path: string) {
    this.type = FILE_EVENTS.ADDED;
    this.path = path;
    this.timestamp = new Date();
  }

  static of(path: string): Result<FileAddedEvent> {
    if (!path || typeof path !== 'string') {
      return Result.ko(new Error('File path must be a non-empty string'));
    }
    return Result.ok(new FileAddedEvent(path));
  }
}

export class FileChangedEvent implements DomainEvent {
  readonly type: string;
  readonly timestamp: Date;
  readonly path: string;

  private constructor(path: string) {
    this.type = FILE_EVENTS.CHANGED;
    this.path = path;
    this.timestamp = new Date();
  }

  static of(path: string): Result<FileChangedEvent> {
    if (!path || typeof path !== 'string') {
      return Result.ko(new Error('File path must be a non-empty string'));
    }
    return Result.ok(new FileChangedEvent(path));
  }
}

export class FileDeletedEvent implements DomainEvent {
  readonly type: string;
  readonly timestamp: Date;
  readonly path: string;

  private constructor(path: string) {
    this.type = FILE_EVENTS.DELETED;
    this.path = path;
    this.timestamp = new Date();
  }

  static of(path: string): Result<FileDeletedEvent> {
    if (!path || typeof path !== 'string') {
      return Result.ko(new Error('File path must be a non-empty string'));
    }
    return Result.ok(new FileDeletedEvent(path));
  }
}
