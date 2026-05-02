import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('CRM AI Chatbot Service (e2e)', () => {
  let app: INestApplication<App>;
  let originalAiServiceKey: string | undefined;
  let originalDatabaseUrl: string | undefined;
  let originalHfToken: string | undefined;

  beforeEach(async () => {
    originalAiServiceKey = process.env.AI_SERVICE_KEY;
    originalDatabaseUrl = process.env.DATABASE_URL;
    originalHfToken = process.env.HF_TOKEN;

    process.env.AI_SERVICE_KEY = '';
    process.env.DATABASE_URL = '';
    process.env.HF_TOKEN = '';

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    restoreEnv('AI_SERVICE_KEY', originalAiServiceKey);
    restoreEnv('DATABASE_URL', originalDatabaseUrl);
    restoreEnv('HF_TOKEN', originalHfToken);
  });

  it('/health (GET)', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect((response) => {
        expect(response.body).toEqual(
          expect.objectContaining({
            status: 'ok',
            service: 'crm-ai-chatbot-service',
            database: 'not_configured',
            huggingFace: 'not_configured',
          }),
        );
      });
  });

  it('requires x-ai-service-key when AI_SERVICE_KEY is configured', async () => {
    process.env.AI_SERVICE_KEY = 'secret';

    await request(app.getHttpServer())
      .post('/v1/feedback')
      .send({ responseLogId: 'response-1', rating: 'accepted' })
      .expect(401);
  });
});

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
