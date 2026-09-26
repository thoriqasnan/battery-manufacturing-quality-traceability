import { Injectable } from '@nestjs/common';
import { resolveFrontendOrigin } from '../config/cors.js';

@Injectable()
export class OriginValidationService {
  isAllowed(origin: string | undefined): boolean {
    if (!origin) {
      return false;
    }

    return (
      origin ===
      resolveFrontendOrigin(process.env.FRONTEND_ORIGIN, process.env.NODE_ENV)
    );
  }
}
