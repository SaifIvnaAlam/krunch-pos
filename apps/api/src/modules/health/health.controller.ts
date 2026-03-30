import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { HealthService, HealthStatus } from './health.service';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness — process is running' })
  getLive(): Promise<{ status: 'ok'; timestamp: string }> {
    return this.health.getLiveness();
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness — database and Redis' })
  getReady(): Promise<HealthStatus> {
    return this.health.getReadiness();
  }
}
