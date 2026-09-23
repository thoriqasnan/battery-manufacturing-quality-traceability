import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHealth(): { status: 'ok'; service: 'api' } {
    return {
      status: 'ok',
      service: 'api',
    };
  }
}
