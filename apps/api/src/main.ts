import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { resolveApiCorsOptions } from './config/cors.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors(
    resolveApiCorsOptions(process.env.FRONTEND_ORIGIN, process.env.NODE_ENV),
  );
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
