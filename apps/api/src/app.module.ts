import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthenticationModule } from './auth/authentication.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TraceabilityModule } from './traceability/traceability.module.js';
import { SecurityHeadersMiddleware } from './config/security-headers.middleware.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { InspectionSpecificationModule } from './quality/inspection-specification.module.js';

@Module({
  imports: [
    AuthenticationModule,
    PrismaModule,
    TraceabilityModule,
    DashboardModule,
    InspectionSpecificationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');
  }
}
