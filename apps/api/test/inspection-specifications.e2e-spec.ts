import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { PasswordHashService } from '../src/auth/password-hash.service.js';
import { CSRF_HEADER_NAME } from '../src/auth/csrf.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

const ORIGIN = 'http://localhost:3000';
const USER_PREFIX = 'phase5c2.http.';
const SPEC_PREFIX = 'PHASE5C2_HTTP_';
const PASSWORD = 'fictional-phase5c2-passphrase';

describe('Phase 5C-2 inspection specification HTTP contracts', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const originalEnvironment = process.env.NODE_ENV;
  const originalOrigin = process.env.FRONTEND_ORIGIN;
  const originalCsrfSecret = process.env.AUTH_CSRF_SECRET;

  async function cleanup() {
    await prisma.client.session.deleteMany({
      where: { user: { username: { startsWith: USER_PREFIX } } },
    });
    await prisma.client.user.deleteMany({
      where: { username: { startsWith: USER_PREFIX } },
    });
    const specifications = await prisma.client.inspectionSpecification.findMany(
      {
        where: { code: { startsWith: SPEC_PREFIX } },
        select: { id: true },
      },
    );
    await prisma.client.inspectionSpecificationOption.deleteMany({
      where: { specificationId: { in: specifications.map(({ id }) => id) } },
    });
    await prisma.client.inspectionSpecification.deleteMany({
      where: { id: { in: specifications.map(({ id }) => id) } },
    });
  }

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.FRONTEND_ORIGIN = ORIGIN;
    process.env.AUTH_CSRF_SECRET =
      'phase5c2-test-only-csrf-secret-at-least-32-characters';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await cleanup();

    const passwordHash = await app
      .get(PasswordHashService)
      .hashPassword(PASSWORD);
    await prisma.client.user.createMany({
      data: Object.values(UserRole).map((role) => ({
        username: `${USER_PREFIX}${role.toLowerCase()}`,
        passwordHash,
        role,
      })),
    });
    const processDefinition =
      await prisma.client.processDefinition.findFirstOrThrow({
        orderBy: { id: 'asc' },
        select: { id: true },
      });
    await prisma.client.inspectionSpecification.createMany({
      data: [
        {
          code: `${SPEC_PREFIX}HIDDEN`,
          version: 1,
          name: 'Hidden draft',
          resultType: 'TEXT',
          targetUnitType: 'PACK',
          processDefinitionId: processDefinition.id,
          lifecycle: 'DRAFT',
        },
        {
          code: `${SPEC_PREFIX}HIDDEN`,
          version: 2,
          name: 'Hidden retired',
          resultType: 'TEXT',
          targetUnitType: 'PACK',
          processDefinitionId: processDefinition.id,
          lifecycle: 'RETIRED',
        },
      ],
    });
  });

  afterAll(async () => {
    await cleanup();
    await app.close();
    if (originalEnvironment === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalEnvironment;
    if (originalOrigin === undefined) delete process.env.FRONTEND_ORIGIN;
    else process.env.FRONTEND_ORIGIN = originalOrigin;
    if (originalCsrfSecret === undefined) delete process.env.AUTH_CSRF_SECRET;
    else process.env.AUTH_CSRF_SECRET = originalCsrfSecret;
  });

  async function login(role: UserRole) {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({
        username: `${USER_PREFIX}${role.toLowerCase()}`,
        password: PASSWORD,
      })
      .expect(200);
    return agent;
  }

  async function mutationLogin(role: UserRole) {
    const agent = request.agent(app.getHttpServer());
    const response = await agent
      .post('/auth/login')
      .set('Origin', ORIGIN)
      .send({
        username: `${USER_PREFIX}${role.toLowerCase()}`,
        password: PASSWORD,
      })
      .expect(200);
    return { agent, csrfToken: response.body.session.csrfToken as string };
  }

  it('enforces mutation auth, role, origin, and CSRF boundaries', async () => {
    const process = await prisma.client.processDefinition.findFirstOrThrow({
      orderBy: { id: 'asc' },
      select: { code: true },
    });
    const body = {
      code: `${SPEC_PREFIX}SECURITY`,
      name: 'Security contract',
      targetUnitType: 'PACK',
      processCode: process.code,
      configuration: { type: 'TEXT' },
    };
    await request(app.getHttpServer())
      .post('/inspection-specifications')
      .send(body)
      .expect(401);
    for (const role of [
      UserRole.QUALITY,
      UserRole.ADMIN,
      UserRole.PRODUCTION,
    ]) {
      const actor = await mutationLogin(role);
      await actor.agent
        .post('/inspection-specifications')
        .set('Origin', ORIGIN)
        .set(CSRF_HEADER_NAME, actor.csrfToken)
        .send(body)
        .expect(403);
    }
    const engineering = await mutationLogin(UserRole.ENGINEERING);
    await engineering.agent
      .post('/inspection-specifications')
      .send(body)
      .expect(403);
    await engineering.agent
      .post('/inspection-specifications')
      .set('Origin', ORIGIN)
      .send(body)
      .expect(403);
  });

  it('creates, replaces, publishes, and retires with strong ETags', async () => {
    const process = await prisma.client.processDefinition.findFirstOrThrow({
      orderBy: { id: 'asc' },
      select: { code: true },
    });
    const engineering = await mutationLogin(UserRole.ENGINEERING);
    const headers = {
      Origin: ORIGIN,
      [CSRF_HEADER_NAME]: engineering.csrfToken,
    };
    const code = `${SPEC_PREFIX}LIFECYCLE`;
    const created = await engineering.agent
      .post('/inspection-specifications')
      .set(headers)
      .send({
        code: code.toLowerCase(),
        name: 'Lifecycle draft',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: {
          type: 'CATEGORICAL',
          options: [{ code: ' ok ', isAcceptable: true }],
        },
      })
      .expect(201);
    expect(created.body).toMatchObject({
      code,
      version: 1,
      lifecycle: 'DRAFT',
      configuration: {
        type: 'CATEGORICAL',
        options: [{ code: 'OK', isAcceptable: true }],
      },
    });
    expect(created.headers.etag).toMatch(/^"spec-v1-[A-Za-z0-9_-]{43}"$/);
    await engineering.agent
      .post('/inspection-specifications')
      .set(headers)
      .send({
        code,
        name: 'Duplicate',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: { type: 'TEXT' },
      })
      .expect(409, {
        code: 'SPECIFICATION_CODE_CONFLICT',
        message: 'The specification code already exists.',
      });
    await engineering.agent
      .put(`/inspection-specifications/${code}/versions/1`)
      .set(headers)
      .send({
        name: 'Missing precondition',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: { type: 'TEXT' },
      })
      .expect(400);
    const replaced = await engineering.agent
      .put(`/inspection-specifications/${code}/versions/1`)
      .set(headers)
      .set('If-Match', created.headers.etag)
      .send({
        name: 'Lifecycle text',
        description: null,
        targetUnitType: 'PACK',
        processCode: process.code,
        routeStep: null,
        configuration: { type: 'TEXT' },
      })
      .expect(200);
    expect(replaced.body.configuration).toEqual({ type: 'TEXT' });
    expect(replaced.headers.etag).not.toBe(created.headers.etag);
    await engineering.agent
      .post(`/inspection-specifications/${code}/versions/1/publish`)
      .set(headers)
      .set('If-Match', created.headers.etag)
      .expect(409, {
        code: 'SPECIFICATION_WRITE_CONFLICT',
        message: 'The inspection specification has changed.',
      });
    const published = await engineering.agent
      .post(`/inspection-specifications/${code}/versions/1/publish`)
      .set(headers)
      .set('If-Match', replaced.headers.etag)
      .expect(201);
    expect(published.body.lifecycle).toBe('PUBLISHED');
    await engineering.agent
      .put(`/inspection-specifications/${code}/versions/1`)
      .set(headers)
      .set('If-Match', published.headers.etag)
      .send({
        name: 'Forbidden',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: { type: 'TEXT' },
      })
      .expect(409);
    const retired = await engineering.agent
      .post(`/inspection-specifications/${code}/versions/1/retire`)
      .set(headers)
      .set('If-Match', published.headers.etag)
      .expect(201);
    expect(retired.body.lifecycle).toBe('RETIRED');
    expect(JSON.stringify(retired.body)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
  });

  it('enforces new-version authorization, CSRF, validation, copy semantics, and ETag response', async () => {
    const process = await prisma.client.processDefinition.findFirstOrThrow({
      orderBy: { id: 'asc' },
      select: { code: true },
    });
    const code = `${SPEC_PREFIX}NEW_VERSION`;
    const route = `/inspection-specifications/${code.toLowerCase()}/versions`;
    await request(app.getHttpServer())
      .post(route)
      .send({ sourceVersion: 1 })
      .expect(401);
    for (const role of [
      UserRole.QUALITY,
      UserRole.ADMIN,
      UserRole.PRODUCTION,
    ]) {
      const actor = await mutationLogin(role);
      await actor.agent
        .post(route)
        .set('Origin', ORIGIN)
        .set(CSRF_HEADER_NAME, actor.csrfToken)
        .send({ sourceVersion: 1 })
        .expect(403);
    }
    const engineering = await mutationLogin(UserRole.ENGINEERING);
    await engineering.agent.post(route).send({ sourceVersion: 1 }).expect(403);
    await engineering.agent
      .post(route)
      .set('Origin', ORIGIN)
      .set(CSRF_HEADER_NAME, engineering.csrfToken)
      .send({ sourceVersion: 0 })
      .expect(400);
    await engineering.agent
      .post(route)
      .set('Origin', ORIGIN)
      .set(CSRF_HEADER_NAME, engineering.csrfToken)
      .send({ sourceVersion: 1, version: 9 })
      .expect(400);
    await engineering.agent
      .post(`/inspection-specifications/${SPEC_PREFIX}UNKNOWN/versions`)
      .set('Origin', ORIGIN)
      .set(CSRF_HEADER_NAME, engineering.csrfToken)
      .send({ sourceVersion: 1 })
      .expect(404);

    const headers = {
      Origin: ORIGIN,
      [CSRF_HEADER_NAME]: engineering.csrfToken,
    };
    const created = await engineering.agent
      .post('/inspection-specifications')
      .set(headers)
      .send({
        code,
        name: 'Version source',
        description: 'Copied safely',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: {
          type: 'CATEGORICAL',
          options: [
            { code: ' pass ', description: 'acceptable', isAcceptable: true },
            { code: 'FAIL', isAcceptable: false },
          ],
        },
      })
      .expect(201);
    await engineering.agent
      .post(route)
      .set(headers)
      .send({ sourceVersion: 1 })
      .expect(409, {
        code: 'INVALID_SPECIFICATION_LIFECYCLE_TRANSITION',
        message: 'The lifecycle transition is not allowed.',
      });
    const published = await engineering.agent
      .post(`/inspection-specifications/${code}/versions/1/publish`)
      .set(headers)
      .set('If-Match', created.headers.etag)
      .expect(201);
    const copied = await engineering.agent
      .post(route)
      .set(headers)
      .send({ sourceVersion: 1 })
      .expect(201);
    expect(copied.body).toMatchObject({
      code,
      version: 2,
      lifecycle: 'DRAFT',
      name: 'Version source',
      description: 'Copied safely',
      configuration: published.body.configuration,
    });
    expect(copied.headers.etag).toMatch(/^"spec-v1-[A-Za-z0-9_-]{43}"$/);
    expect(JSON.stringify(copied.body)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
    const sourceAfter = await engineering.agent
      .get(`/inspection-specifications/${code}/versions/1`)
      .expect(200);
    expect(sourceAfter.body).toEqual(published.body);
    const retired = await engineering.agent
      .post(`/inspection-specifications/${code}/versions/1/retire`)
      .set(headers)
      .set('If-Match', published.headers.etag)
      .expect(201);
    const fromRetired = await engineering.agent
      .post(route)
      .set(headers)
      .send({ sourceVersion: 1 })
      .expect(201);
    expect(fromRetired.body).toMatchObject({
      version: 3,
      lifecycle: 'DRAFT',
      configuration: retired.body.configuration,
    });
  });

  it('completes the Phase 5C ENGINEERING lifecycle and QUALITY discovery acceptance workflow', async () => {
    const process = await prisma.client.processDefinition.findFirstOrThrow({
      orderBy: { id: 'asc' },
      select: { code: true },
    });
    const engineering = await mutationLogin(UserRole.ENGINEERING);
    const quality = await mutationLogin(UserRole.QUALITY);
    const headers = {
      Origin: ORIGIN,
      [CSRF_HEADER_NAME]: engineering.csrfToken,
    };
    const code = `${SPEC_PREFIX}ACCEPTANCE`;
    const v1Path = `/inspection-specifications/${code}/versions/1`;

    const created = await engineering.agent
      .post('/inspection-specifications')
      .set(headers)
      .send({
        code: code.toLowerCase(),
        name: 'Acceptance draft',
        description: 'Synthetic acceptance evidence',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: {
          type: 'CATEGORICAL',
          options: [
            { code: ' pass ', isAcceptable: true },
            { code: 'FAIL', isAcceptable: false },
          ],
        },
      })
      .expect(201);
    expect(created.body).toMatchObject({
      code,
      version: 1,
      lifecycle: 'DRAFT',
    });

    const initialRead = await engineering.agent.get(v1Path).expect(200);
    expect(initialRead.headers.etag).toBe(created.headers.etag);
    const replacementBody = {
      name: 'Acceptance definition v1',
      description: 'Updated synthetic evidence',
      targetUnitType: 'PACK',
      processCode: process.code,
      configuration: {
        type: 'CATEGORICAL',
        options: [
          { code: 'GOOD', isAcceptable: true },
          { code: 'REJECT', isAcceptable: false },
        ],
      },
    };
    for (const invalidIfMatch of [
      `W/${initialRead.headers.etag}`,
      '*',
      'malformed',
    ])
      await engineering.agent
        .put(v1Path)
        .set(headers)
        .set('If-Match', invalidIfMatch)
        .send(replacementBody)
        .expect(400);
    const replaced = await engineering.agent
      .put(v1Path)
      .set(headers)
      .set('If-Match', initialRead.headers.etag)
      .send({
        ...replacementBody,
      })
      .expect(200);
    expect(replaced.headers.etag).not.toBe(initialRead.headers.etag);
    await engineering.agent
      .put(v1Path)
      .set(headers)
      .set('If-Match', initialRead.headers.etag)
      .send({
        name: 'Stale overwrite',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: { type: 'TEXT' },
      })
      .expect(409, {
        code: 'SPECIFICATION_WRITE_CONFLICT',
        message: 'The inspection specification has changed.',
      });
    expect((await engineering.agent.get(v1Path).expect(200)).body).toEqual(
      replaced.body,
    );

    const publishedV1 = await engineering.agent
      .post(`${v1Path}/publish`)
      .set(headers)
      .set('If-Match', replaced.headers.etag)
      .expect(201);
    await engineering.agent
      .put(v1Path)
      .set(headers)
      .set('If-Match', publishedV1.headers.etag)
      .send({
        name: 'Forbidden published edit',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: { type: 'TEXT' },
      })
      .expect(409);

    const copiedV2 = await engineering.agent
      .post(`/inspection-specifications/${code}/versions`)
      .set(headers)
      .send({ sourceVersion: 1 })
      .expect(201);
    expect(copiedV2.body).toMatchObject({
      version: 2,
      lifecycle: 'DRAFT',
      configuration: publishedV1.body.configuration,
    });
    const v2Path = `/inspection-specifications/${code}/versions/2`;
    const replacedV2 = await engineering.agent
      .put(v2Path)
      .set(headers)
      .set('If-Match', copiedV2.headers.etag)
      .send({
        name: 'Acceptance definition v2',
        description: 'Independent next version',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: {
          type: 'VISUAL',
          options: [
            { code: 'CLEAR', isAcceptable: true },
            { code: 'DEFECT', isAcceptable: false },
          ],
        },
      })
      .expect(200);
    const publishedV2 = await engineering.agent
      .post(`${v2Path}/publish`)
      .set(headers)
      .set('If-Match', replacedV2.headers.etag)
      .expect(201);
    const retiredV1 = await engineering.agent
      .post(`${v1Path}/retire`)
      .set(headers)
      .set('If-Match', publishedV1.headers.etag)
      .expect(201);
    expect(retiredV1.body.lifecycle).toBe('RETIRED');
    await engineering.agent
      .put(v1Path)
      .set(headers)
      .set('If-Match', retiredV1.headers.etag)
      .send({
        name: 'Forbidden retired edit',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: { type: 'TEXT' },
      })
      .expect(409);

    const draftV3 = await engineering.agent
      .post(`/inspection-specifications/${code}/versions`)
      .set(headers)
      .send({ sourceVersion: 1 })
      .expect(201);
    expect(draftV3.body).toMatchObject({ version: 3, lifecycle: 'DRAFT' });
    expect(
      (await engineering.agent.get(v1Path).expect(200)).body.lifecycle,
    ).toBe('RETIRED');
    expect((await engineering.agent.get(v2Path).expect(200)).body).toEqual(
      publishedV2.body,
    );

    await quality.agent.get('/inspection-specifications').expect(403);
    await quality.agent.get(v2Path).expect(403);
    await quality.agent
      .put(v2Path)
      .set('Origin', ORIGIN)
      .set(CSRF_HEADER_NAME, quality.csrfToken)
      .set('If-Match', publishedV2.headers.etag)
      .send({
        name: 'Forbidden',
        targetUnitType: 'PACK',
        processCode: process.code,
        configuration: { type: 'TEXT' },
      })
      .expect(403);
    const discovery = await quality.agent
      .get('/inspection-specifications/discovery')
      .query({ query: code })
      .expect(200);
    expect(discovery.body.items).toEqual([
      expect.objectContaining({ code, version: 2 }),
    ]);
    const discoveredV2 = await quality.agent
      .get(`/inspection-specifications/discovery/${code}/versions/2`)
      .expect(200);
    expect(discoveredV2.body.configuration).toEqual(
      publishedV2.body.configuration,
    );
    await quality.agent
      .get(`/inspection-specifications/discovery/${code}/versions/1`)
      .expect(404, {
        code: 'INSPECTION_SPECIFICATION_NOT_FOUND',
        message: 'Inspection specification not found.',
      });
    await quality.agent
      .get(`/inspection-specifications/discovery/${code}/versions/3`)
      .expect(404, {
        code: 'INSPECTION_SPECIFICATION_NOT_FOUND',
        message: 'Inspection specification not found.',
      });
    await engineering.agent
      .get('/inspection-specifications/discovery')
      .expect(403);
  });

  it('returns the global unauthenticated contract for both surfaces', async () => {
    for (const route of [
      '/inspection-specifications',
      '/inspection-specifications/discovery',
    ]) {
      await request(app.getHttpServer()).get(route).expect(401, {
        code: 'UNAUTHENTICATED',
        message: 'Authentication required.',
      });
    }
  });

  it('enforces the exact management and discovery role matrix', async () => {
    const agents = {
      [UserRole.ADMIN]: await login(UserRole.ADMIN),
      [UserRole.QUALITY]: await login(UserRole.QUALITY),
      [UserRole.PRODUCTION]: await login(UserRole.PRODUCTION),
      [UserRole.ENGINEERING]: await login(UserRole.ENGINEERING),
    };

    await agents[UserRole.ENGINEERING]
      .get('/inspection-specifications')
      .expect(200);
    for (const role of [
      UserRole.QUALITY,
      UserRole.ADMIN,
      UserRole.PRODUCTION,
    ]) {
      await agents[role].get('/inspection-specifications').expect(403, {
        code: 'FORBIDDEN',
        message: 'Insufficient permission.',
      });
    }

    await agents[UserRole.QUALITY]
      .get('/inspection-specifications/discovery')
      .expect(200);
    for (const role of [
      UserRole.ENGINEERING,
      UserRole.ADMIN,
      UserRole.PRODUCTION,
    ]) {
      await agents[role]
        .get('/inspection-specifications/discovery')
        .expect(403, {
          code: 'FORBIDDEN',
          message: 'Insufficient permission.',
        });
    }
  });

  it('returns bounded management pages and filtered results', async () => {
    const engineering = await login(UserRole.ENGINEERING);
    const response = await engineering
      .get('/inspection-specifications')
      .query({ query: 'demo', lifecycle: 'published', page: 1, pageSize: 2 })
      .expect(200);
    expect(response.body.page).toEqual({
      number: 1,
      size: 2,
      totalItems: 5,
      totalPages: 3,
    });
    expect(response.body.items).toHaveLength(2);
    expect(
      response.body.items.every((item: object) => 'lifecycle' in item),
    ).toBe(true);

    const beyond = await engineering
      .get('/inspection-specifications')
      .query({ query: 'demo', page: 20, pageSize: 2 })
      .expect(200);
    expect(beyond.body.items).toEqual([]);
    expect(beyond.body.page.totalItems).toBe(5);
  });

  it('normalizes exact management identity and emits a strong public ETag', async () => {
    const engineering = await login(UserRole.ENGINEERING);
    const response = await engineering
      .get('/inspection-specifications/demo_numeric_level/versions/1')
      .expect(200);
    expect(response.body).toMatchObject({
      code: 'DEMO_NUMERIC_LEVEL',
      version: 1,
      lifecycle: 'PUBLISHED',
      configuration: {
        type: 'NUMERIC',
        lowerBound: '10',
        upperBound: '20',
        unitCode: 'DEMO_UNIT',
      },
    });
    expect(response.headers.etag).toMatch(/^"spec-v1-[A-Za-z0-9_-]{43}"$/);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
    expect(response.body).not.toHaveProperty('id');
  });

  it('returns published discovery configuration and deterministic options', async () => {
    const quality = await login(UserRole.QUALITY);
    const list = await quality
      .get('/inspection-specifications/discovery')
      .query({ resultType: 'categorical', pageSize: 100 })
      .expect(200);
    expect(list.body.items).toEqual([
      expect.objectContaining({
        code: 'DEMO_CATEGORY_STATE',
        resultType: 'CATEGORICAL',
      }),
    ]);
    expect(list.body.items[0]).not.toHaveProperty('lifecycle');

    const detail = await quality
      .get(
        '/inspection-specifications/discovery/dEmO_cAtEgOrY_sTaTe/versions/1',
      )
      .expect(200);
    expect(detail.body).not.toHaveProperty('lifecycle');
    expect(
      detail.body.configuration.options.map(
        (option: { code: string }) => option.code,
      ),
    ).toEqual(['READY', 'REVIEW']);
    expect(JSON.stringify(detail.body)).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i,
    );
  });

  it('makes hidden and unknown discovery identities indistinguishable', async () => {
    const quality = await login(UserRole.QUALITY);
    for (const route of [
      `/inspection-specifications/discovery/${SPEC_PREFIX}HIDDEN/versions/1`,
      `/inspection-specifications/discovery/${SPEC_PREFIX}HIDDEN/versions/2`,
      '/inspection-specifications/discovery/UNKNOWN_SPEC/versions/1',
    ]) {
      await quality.get(route).expect(404, {
        code: 'INSPECTION_SPECIFICATION_NOT_FOUND',
        message: 'Inspection specification not found.',
      });
    }
  });

  it('returns safe request and not-found errors', async () => {
    const engineering = await login(UserRole.ENGINEERING);
    await engineering
      .get('/inspection-specifications/DEMO_NUMERIC_LEVEL/versions/0')
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('INVALID_REQUEST'));
    await engineering
      .get('/inspection-specifications')
      .query({ pageSize: 101 })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('INVALID_REQUEST'));
    await engineering
      .get('/inspection-specifications/UNKNOWN_SPEC/versions/1')
      .expect(404, {
        code: 'INSPECTION_SPECIFICATION_NOT_FOUND',
        message: 'Inspection specification not found.',
      });
  });
});
