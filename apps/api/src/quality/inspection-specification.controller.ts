import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermissions } from '../auth/auth.metadata.js';
import { Permission } from '../auth/permissions.js';
import {
  normalizeSpecificationCode,
  parseDiscoverySpecificationQuery,
  parseManagementSpecificationQuery,
  parsePositiveSpecificationVersion,
} from './inspection-specification-query.js';
import {
  parseCreateSpecification,
  parseCreateSpecificationVersion,
  parseReplaceSpecification,
  parseRequiredIfMatch,
} from './inspection-specification-mutation.js';
import { InspectionSpecificationService } from './inspection-specification.service.js';
import type {
  DiscoverySpecificationDetail,
  DiscoverySpecificationListResponse,
  ManagementSpecificationDetail,
  ManagementSpecificationListResponse,
} from './inspection-specification.types.js';

@Controller('inspection-specifications')
export class InspectionSpecificationController {
  constructor(private readonly service: InspectionSpecificationService) {}

  @Post()
  @RequirePermissions(Permission.InspectionSpecificationManage)
  async create(
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.create(parseCreateSpecification(body));
    response.setHeader('ETag', result.etag);
    return result.detail;
  }

  @Post(':code/versions')
  @RequirePermissions(Permission.InspectionSpecificationManage)
  async createVersion(
    @Param('code') code: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.createVersion(
      normalizeSpecificationCode(code),
      parseCreateSpecificationVersion(body),
    );
    response.setHeader('ETag', result.etag);
    return result.detail;
  }

  @Put(':code/versions/:version')
  @RequirePermissions(Permission.InspectionSpecificationManage)
  async replace(
    @Param('code') code: string,
    @Param('version') version: string,
    @Headers('if-match') ifMatch: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.replace(
      normalizeSpecificationCode(code),
      parsePositiveSpecificationVersion(version),
      parseReplaceSpecification(body),
      parseRequiredIfMatch(ifMatch),
    );
    response.setHeader('ETag', result.etag);
    return result.detail;
  }

  @Post(':code/versions/:version/publish')
  @RequirePermissions(Permission.InspectionSpecificationManage)
  async publish(
    @Param('code') code: string,
    @Param('version') version: string,
    @Headers('if-match') ifMatch: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.publish(
      normalizeSpecificationCode(code),
      parsePositiveSpecificationVersion(version),
      parseRequiredIfMatch(ifMatch),
    );
    response.setHeader('ETag', result.etag);
    return result.detail;
  }

  @Post(':code/versions/:version/retire')
  @RequirePermissions(Permission.InspectionSpecificationManage)
  async retire(
    @Param('code') code: string,
    @Param('version') version: string,
    @Headers('if-match') ifMatch: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.service.retire(
      normalizeSpecificationCode(code),
      parsePositiveSpecificationVersion(version),
      parseRequiredIfMatch(ifMatch),
    );
    response.setHeader('ETag', result.etag);
    return result.detail;
  }

  @Get()
  @RequirePermissions(Permission.InspectionSpecificationManage)
  listManagement(
    @Query() query: Record<string, unknown>,
  ): Promise<ManagementSpecificationListResponse> {
    return this.service.listManagement(
      parseManagementSpecificationQuery(query),
    );
  }

  @Get('discovery')
  @RequirePermissions(Permission.InspectionWrite)
  listDiscovery(
    @Query() query: Record<string, unknown>,
  ): Promise<DiscoverySpecificationListResponse> {
    return this.service.listDiscovery(parseDiscoverySpecificationQuery(query));
  }

  @Get('discovery/:code/versions/:version')
  @RequirePermissions(Permission.InspectionWrite)
  discoveryDetail(
    @Param('code') code: string,
    @Param('version') version: string,
  ): Promise<DiscoverySpecificationDetail> {
    return this.service.getDiscoveryDetail(
      normalizeSpecificationCode(code),
      parsePositiveSpecificationVersion(version),
    );
  }

  @Get(':code/versions/:version')
  @RequirePermissions(Permission.InspectionSpecificationManage)
  async managementDetail(
    @Param('code') code: string,
    @Param('version') version: string,
    @Res({ passthrough: true }) response: Response,
  ): Promise<ManagementSpecificationDetail> {
    const result = await this.service.getManagementDetail(
      normalizeSpecificationCode(code),
      parsePositiveSpecificationVersion(version),
    );
    response.setHeader('ETag', result.etag);
    return result.detail;
  }
}
