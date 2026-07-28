import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainEvent } from '../../domains/chunking/events/domain-event';
import { DomainCommand } from '../../domains/chunking/commands/process-file-command';

@Injectable()
export class AppEventEmitter {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  publish<T extends DomainEvent | DomainCommand>(eventOrCommand: T): void {
    this.eventEmitter.emit(eventOrCommand.type, eventOrCommand);
  }

  publishMany<T extends DomainEvent | DomainCommand>(events: T[]): void {
    events.forEach((event) => this.publish(event));
  }
}
