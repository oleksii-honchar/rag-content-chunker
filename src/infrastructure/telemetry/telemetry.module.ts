import { Module } from '@nestjs/common';
import { ConfigurationModule } from '../config/configuration.module';
import { MetricsCollectorService } from './metrics-collector.service';

@Module({
  imports: [ConfigurationModule],
  providers: [MetricsCollectorService],
  exports: [MetricsCollectorService],
})
export class TelemetryModule {}
