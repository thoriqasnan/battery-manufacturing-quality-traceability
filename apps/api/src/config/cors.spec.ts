import { Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { resolveApiCorsOptions, resolveFrontendOrigin } from './cors.js';

const frontendOrigin = 'http://localhost:3000';

@Controller('inspections')
class InspectionPreflightController {
  @Post()
  createInspection() {
    return undefined;
  }
}

describe('resolveFrontendOrigin', () => {
  it('uses the configured HTTP origin', () => {
    expect(
      resolveFrontendOrigin('https://web.example.test', 'production'),
    ).toBe('https://web.example.test');
  });

  it('uses the local frontend origin outside production', () => {
    expect(resolveFrontendOrigin(undefined, 'development')).toBe(
      'http://localhost:3000',
    );
  });

  it('requires explicit production configuration', () => {
    expect(() => resolveFrontendOrigin(undefined, 'production')).toThrow(
      'FRONTEND_ORIGIN must be configured in production.',
    );
  });

  it('rejects a value that is not an origin', () => {
    expect(() =>
      resolveFrontendOrigin('http://localhost:3000/path', 'development'),
    ).toThrow('FRONTEND_ORIGIN must contain only an HTTP(S) origin.');
  });
});

describe('inspection submission CORS preflight', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      controllers: [InspectionPreflightController],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.enableCors(resolveApiCorsOptions(frontendOrigin, 'test'));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('permits the credentialed browser headers required by POST /inspections', async () => {
    const response = await request(app.getHttpServer())
      .options('/inspections')
      .set('Origin', frontendOrigin)
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'content-type,x-csrf-token,idempotency-key',
      )
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(
      frontendOrigin,
    );
    expect(response.headers['access-control-allow-credentials']).toBe('true');

    const methods = String(response.headers['access-control-allow-methods'])
      .split(',')
      .map((method) => method.trim().toUpperCase());
    expect(methods).toContain('POST');

    const headers = String(response.headers['access-control-allow-headers'])
      .split(',')
      .map((header) => header.trim().toLowerCase());
    expect(headers).toEqual(
      expect.arrayContaining([
        'content-type',
        'x-csrf-token',
        'idempotency-key',
      ]),
    );
  });
});
