import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as fs from 'fs';
import * as path from 'path';

async function generateOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Universal POS API')
    .setDescription('Universal Restaurant POS System API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outputPath = path.resolve(__dirname, '../../../openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));
  console.log(`OpenAPI spec written to ${outputPath}`);

  await app.close();
}

generateOpenApi();
