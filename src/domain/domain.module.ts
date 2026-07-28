import { Module } from '@nestjs/common';

/**
 * Domain module — marker module for domain layer.
 * Domain entities and aggregates are instantiated via domain logic, not DI.
 * No imports from application/ or infrastructure/ layers.
 */
@Module({})
export class DomainModule {}
