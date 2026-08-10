import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN') ?? 'http://localhost:5173',
    credentials: true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  // Mirrors the old app's wwwroot/uploads — FileUpload field values are stored as a "/uploads/..."
  // relative path, served here as static files.
  app.useStaticAssets(join(process.cwd(), 'uploads'), { prefix: '/uploads' });

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`FlowForm backend listening on http://localhost:${port}`);
}
bootstrap();
