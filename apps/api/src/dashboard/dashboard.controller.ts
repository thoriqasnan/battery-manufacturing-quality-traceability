import { Controller, Get } from '@nestjs/common';
import { RequirePermissions } from '../auth/auth.metadata.js';
import { Permission } from '../auth/permissions.js';
import { DashboardService } from './dashboard.service.js';
import type { DashboardOverviewResponse } from './dashboard.types.js';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('overview')
  @RequirePermissions(Permission.DashboardView)
  overview(): Promise<DashboardOverviewResponse> {
    return this.dashboard.getOverview();
  }
}
