import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';
import { AuthenticatedActor } from '../auth/authenticated-actor.decorator.js';
import { RequirePermissions } from '../auth/auth.metadata.js';
import type { AuthenticatedUserIdentity } from '../auth/authentication.types.js';
import { Permission } from '../auth/permissions.js';
import { InspectionEntryService } from './inspection-entry.service.js';
import {
  parseIdempotencyKey,
  parseInspectionRequest,
} from './inspection-entry.js';

@Controller('inspections')
export class InspectionEntryController {
  constructor(private readonly service: InspectionEntryService) {}

  @Post()
  @RequirePermissions(Permission.InspectionWrite)
  async submit(
    @AuthenticatedActor() actor: AuthenticatedUserIdentity,
    @Headers('idempotency-key') rawIdempotencyKey: unknown,
    @Body() body: unknown,
  ) {
    try {
      const idempotencyKey = parseIdempotencyKey(rawIdempotencyKey);
      const request = parseInspectionRequest(body);
      const result = await this.service.submit(actor, idempotencyKey, request);
      return result.response;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'INVALID_REQUEST'
      ) {
        const details =
          'details' in error && Array.isArray(error.details)
            ? error.details
            : undefined;
        throw new BadRequestException({
          code: 'INVALID_REQUEST',
          message: 'The request is invalid.',
          ...(details ? { details } : {}),
        });
      }
      throw error;
    }
  }
}
