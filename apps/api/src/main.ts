import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { resolveFrontendOrigin } from './config/cors.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: resolveFrontendOrigin(
      process.env.FRONTEND_ORIGIN,
      process.env.NODE_ENV,
    ),
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Accept', 'Content-Type'],
  });
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
