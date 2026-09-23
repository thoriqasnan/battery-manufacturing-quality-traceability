import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller('health')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHealth(): { status: 'ok'; service: 'api' } {
    return this.appService.getHealth();
  }
}
