import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DomainCommand } from '../domain/commands/process-file-command';
import { DomainEvent } from '../domain/events/domain-event';

@Injectable()
export class AppEventEmitter {
  constructor(private readonly eventEmitter: EventEmitter2) {}

  publish<T extends DomainEvent | DomainCommand>(eventOrCommand: T): void {
    this.eventEmitter.emit(eventOrCommand.type, eventOrCommand);
  }

  publishMany<T extends DomainEvent | DomainCommand>(events: T[]): void {
    events.forEach(event => this.publish(event));
  }
}
