import { PrismaClient } from '../dist/src/generated/prisma/client.js';
import { createPrismaPgAdapter } from '../dist/src/prisma/prisma-pg.js';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL is required to seed the development database.');
}

const prisma = new PrismaClient({
  adapter: createPrismaPgAdapter(connectionString),
});
const date = (value) => new Date(value);
const ownedId = (group, number) =>
  `2f0000${group}-0000-4000-8000-${String(number).padStart(12, '0')}`;

async function upsertById(delegate, row) {
  const { id, ...values } = row;
  return delegate.upsert({
    where: { id },
    create: row,
    update: values,
  });
}

async function seed() {
  const product = {
    alpha: ownedId('01', 1),
    beta: ownedId('01', 2),
  };
  const process = {
    prepare: ownedId('02', 1),
    assemble: ownedId('02', 2),
    verify: ownedId('02', 3),
    release: ownedId('02', 4),
  };
  const route = {
    alpha: ownedId('03', 1),
    beta: ownedId('03', 2),
  };
  const step = {
    alphaPrepare: ownedId('04', 1),
    alphaAssemble: ownedId('04', 2),
    alphaVerify: ownedId('04', 3),
    alphaRelease: ownedId('04', 4),
    betaPrepare: ownedId('04', 5),
    betaVerify: ownedId('04', 6),
    betaAssemble: ownedId('04', 7),
    betaRelease: ownedId('04', 8),
  };
  const unit = {
    passPack: ownedId('05', 1),
    simplePack: ownedId('05', 2),
    escalatedPack: ownedId('05', 3),
    passModule: ownedId('05', 4),
    simpleModule: ownedId('05', 5),
    escalatedModule: ownedId('05', 6),
    passCell1: ownedId('05', 7),
    passCell2: ownedId('05', 8),
    simpleCell1: ownedId('05', 9),
    simpleCell2: ownedId('05', 10),
    escalatedCell1: ownedId('05', 11),
    escalatedCell2: ownedId('05', 12),
    oldComponent: ownedId('05', 13),
    newComponent: ownedId('05', 14),
    betaComponent: ownedId('05', 15),
    demoMaterial: ownedId('05', 16),
  };
  const specification = {
    numeric: ownedId('08', 1),
    boolean: ownedId('08', 2),
    categorical: ownedId('08', 3),
    visual: ownedId('08', 4),
    text: ownedId('08', 5),
  };
  const option = {
    categoryReady: ownedId('09', 1),
    categoryReview: ownedId('09', 2),
    visualClear: ownedId('09', 3),
    visualMark: ownedId('09', 4),
  };

  await prisma.$transaction(
    async (tx) => {
      for (const row of [
        {
          id: product.alpha,
          code: 'DEMO_ALPHA',
          name: 'Demo Alpha Product',
          description:
            'Fictional portfolio product with the prepare, assemble, verify, release route.',
          isActive: true,
        },
        {
          id: product.beta,
          code: 'DEMO_BETA',
          name: 'Demo Beta Product',
          description:
            'Fictional portfolio product whose verify and assemble steps use a different order.',
          isActive: true,
        },
      ])
        await upsertById(tx.productModel, row);

      for (const row of [
        {
          id: process.prepare,
          code: 'DEMO_PREPARE',
          name: 'Demo Preparation',
          description: 'Generic fictional preparation process.',
          isActive: true,
        },
        {
          id: process.assemble,
          code: 'DEMO_ASSEMBLE',
          name: 'Demo Assembly',
          description: 'Generic fictional assembly process.',
          isActive: true,
        },
        {
          id: process.verify,
          code: 'DEMO_VERIFY',
          name: 'Demo Verification',
          description: 'Generic fictional quality verification process.',
          isActive: true,
        },
        {
          id: process.release,
          code: 'DEMO_RELEASE',
          name: 'Demo Release',
          description: 'Generic fictional release process.',
          isActive: true,
        },
      ])
        await upsertById(tx.processDefinition, row);

      for (const row of [
        {
          id: route.alpha,
          productModelId: product.alpha,
          code: 'DEMO_ALPHA_ROUTE',
          name: 'Demo Alpha Route',
          description: 'Synthetic route A: prepare, assemble, verify, release.',
          version: 1,
          isActive: true,
        },
        {
          id: route.beta,
          productModelId: product.beta,
          code: 'DEMO_BETA_ROUTE',
          name: 'Demo Beta Route',
          description: 'Synthetic route B: prepare, verify, assemble, release.',
          version: 1,
          isActive: true,
        },
      ])
        await upsertById(tx.processRoute, row);

      for (const row of [
        {
          id: step.alphaPrepare,
          processRouteId: route.alpha,
          processDefinitionId: process.prepare,
          stepOrder: 1,
          executionMethod: 'MANUAL',
        },
        {
          id: step.alphaAssemble,
          processRouteId: route.alpha,
          processDefinitionId: process.assemble,
          stepOrder: 2,
          executionMethod: 'HYBRID',
        },
        {
          id: step.alphaVerify,
          processRouteId: route.alpha,
          processDefinitionId: process.verify,
          stepOrder: 3,
          executionMethod: 'AUTOMATED',
        },
        {
          id: step.alphaRelease,
          processRouteId: route.alpha,
          processDefinitionId: process.release,
          stepOrder: 4,
          executionMethod: 'MANUAL',
        },
        {
          id: step.betaPrepare,
          processRouteId: route.beta,
          processDefinitionId: process.prepare,
          stepOrder: 1,
          executionMethod: 'MANUAL',
        },
        {
          id: step.betaVerify,
          processRouteId: route.beta,
          processDefinitionId: process.verify,
          stepOrder: 2,
          executionMethod: 'AUTOMATED',
        },
        {
          id: step.betaAssemble,
          processRouteId: route.beta,
          processDefinitionId: process.assemble,
          stepOrder: 3,
          executionMethod: 'HYBRID',
        },
        {
          id: step.betaRelease,
          processRouteId: route.beta,
          processDefinitionId: process.release,
          stepOrder: 4,
          executionMethod: 'MANUAL',
        },
      ])
        await upsertById(tx.processRouteStep, row);

      for (const row of [
        {
          id: unit.passPack,
          traceCode: 'PACK-DEMO-ALPHA-PASS',
          unitType: 'PACK',
          productModelId: product.alpha,
        },
        {
          id: unit.simplePack,
          traceCode: 'PACK-DEMO-ALPHA-RETEST',
          unitType: 'PACK',
          productModelId: product.alpha,
        },
        {
          id: unit.escalatedPack,
          traceCode: 'PACK-DEMO-BETA-ESCALATED',
          unitType: 'PACK',
          productModelId: product.beta,
        },
        {
          id: unit.passModule,
          traceCode: 'MODULE-DEMO-ALPHA-PASS-01',
          unitType: 'MODULE',
          productModelId: null,
        },
        {
          id: unit.simpleModule,
          traceCode: 'MODULE-DEMO-ALPHA-RETEST-01',
          unitType: 'MODULE',
          productModelId: null,
        },
        {
          id: unit.escalatedModule,
          traceCode: 'MODULE-DEMO-BETA-ESCALATED-01',
          unitType: 'MODULE',
          productModelId: null,
        },
        {
          id: unit.passCell1,
          traceCode: 'CELL-DEMO-ALPHA-PASS-01',
          unitType: 'CELL',
          productModelId: null,
        },
        {
          id: unit.passCell2,
          traceCode: 'CELL-DEMO-ALPHA-PASS-02',
          unitType: 'CELL',
          productModelId: null,
        },
        {
          id: unit.simpleCell1,
          traceCode: 'CELL-DEMO-ALPHA-RETEST-01',
          unitType: 'CELL',
          productModelId: null,
        },
        {
          id: unit.simpleCell2,
          traceCode: 'CELL-DEMO-ALPHA-RETEST-02',
          unitType: 'CELL',
          productModelId: null,
        },
        {
          id: unit.escalatedCell1,
          traceCode: 'CELL-DEMO-BETA-ESCALATED-01',
          unitType: 'CELL',
          productModelId: null,
        },
        {
          id: unit.escalatedCell2,
          traceCode: 'CELL-DEMO-BETA-ESCALATED-02',
          unitType: 'CELL',
          productModelId: null,
        },
        {
          id: unit.oldComponent,
          traceCode: 'COMP-DEMO-OLD',
          unitType: 'COMPONENT',
          productModelId: null,
        },
        {
          id: unit.newComponent,
          traceCode: 'COMP-DEMO-NEW',
          unitType: 'COMPONENT',
          productModelId: null,
        },
        {
          id: unit.betaComponent,
          traceCode: 'COMP-DEMO-BETA-01',
          unitType: 'COMPONENT',
          productModelId: null,
        },
        {
          id: unit.demoMaterial,
          traceCode: 'MATERIAL-DEMO-ALPHA-01',
          unitType: 'MATERIAL',
          productModelId: null,
        },
      ])
        await upsertById(tx.traceableUnit, row);

      const genealogy = [
        [
          1,
          unit.passPack,
          unit.passModule,
          'MODULE-01',
          '2026-01-10T08:00:00Z',
          null,
        ],
        [
          2,
          unit.simplePack,
          unit.simpleModule,
          'MODULE-01',
          '2026-01-11T08:00:00Z',
          null,
        ],
        [
          3,
          unit.escalatedPack,
          unit.escalatedModule,
          'MODULE-01',
          '2026-01-12T08:00:00Z',
          null,
        ],
        [
          4,
          unit.passModule,
          unit.passCell1,
          'CELL-01',
          '2026-01-10T08:10:00Z',
          null,
        ],
        [
          5,
          unit.passModule,
          unit.passCell2,
          'CELL-02',
          '2026-01-10T08:11:00Z',
          null,
        ],
        [
          6,
          unit.simpleModule,
          unit.simpleCell1,
          'CELL-01',
          '2026-01-11T08:10:00Z',
          null,
        ],
        [
          7,
          unit.simpleModule,
          unit.simpleCell2,
          'CELL-02',
          '2026-01-11T08:11:00Z',
          null,
        ],
        [
          8,
          unit.escalatedModule,
          unit.escalatedCell1,
          'CELL-01',
          '2026-01-12T08:10:00Z',
          null,
        ],
        [
          9,
          unit.escalatedModule,
          unit.escalatedCell2,
          'CELL-02',
          '2026-01-12T08:11:00Z',
          null,
        ],
        [
          10,
          unit.simpleModule,
          unit.oldComponent,
          'SENSOR-01',
          '2026-01-11T08:12:00Z',
          '2026-01-11T11:00:00Z',
        ],
        [
          11,
          unit.simpleModule,
          unit.newComponent,
          'SENSOR-01',
          '2026-01-11T11:05:00Z',
          null,
        ],
        [
          12,
          unit.escalatedModule,
          unit.betaComponent,
          'CONNECTOR-01',
          '2026-01-12T08:12:00Z',
          null,
        ],
        [
          13,
          unit.passModule,
          unit.demoMaterial,
          'MATERIAL-01',
          '2026-01-10T08:12:00Z',
          null,
        ],
      ];
      for (const [
        number,
        parentUnitId,
        childUnitId,
        positionCode,
        installedAt,
        removedAt,
      ] of genealogy) {
        await upsertById(tx.genealogyRelation, {
          id: ownedId('06', number),
          parentUnitId,
          childUnitId,
          positionCode,
          installedAt: date(installedAt),
          removedAt: removedAt ? date(removedAt) : null,
        });
      }

      const execution = {};
      let executionNumber = 0;
      const executionRows = [];
      const addExecution = (
        key,
        traceableUnitId,
        processDefinitionId,
        processRouteStepId,
        attemptNumber,
        executionMethod,
        startedAt,
        finishedAt,
      ) => {
        executionNumber += 1;
        execution[key] = ownedId('07', executionNumber);
        executionRows.push({
          id: execution[key],
          traceableUnitId,
          processDefinitionId,
          processRouteStepId,
          attemptNumber,
          status: 'COMPLETED',
          executionMethod,
          startedAt: date(startedAt),
          finishedAt: date(finishedAt),
        });
      };
      addExecution(
        'passPrepare',
        unit.passPack,
        process.prepare,
        step.alphaPrepare,
        1,
        'MANUAL',
        '2026-01-10T09:00:00Z',
        '2026-01-10T09:10:00Z',
      );
      addExecution(
        'passAssemble',
        unit.passPack,
        process.assemble,
        step.alphaAssemble,
        1,
        'HYBRID',
        '2026-01-10T09:20:00Z',
        '2026-01-10T09:40:00Z',
      );
      addExecution(
        'passVerify',
        unit.passPack,
        process.verify,
        step.alphaVerify,
        1,
        'AUTOMATED',
        '2026-01-10T09:50:00Z',
        '2026-01-10T10:05:00Z',
      );
      addExecution(
        'passRelease',
        unit.passPack,
        process.release,
        step.alphaRelease,
        1,
        'MANUAL',
        '2026-01-10T10:10:00Z',
        '2026-01-10T10:15:00Z',
      );
      addExecution(
        'simplePrepare',
        unit.simplePack,
        process.prepare,
        step.alphaPrepare,
        1,
        'MANUAL',
        '2026-01-11T09:00:00Z',
        '2026-01-11T09:10:00Z',
      );
      addExecution(
        'simpleAssemble',
        unit.simplePack,
        process.assemble,
        step.alphaAssemble,
        1,
        'HYBRID',
        '2026-01-11T09:20:00Z',
        '2026-01-11T09:40:00Z',
      );
      addExecution(
        'simpleVerify1',
        unit.simplePack,
        process.verify,
        step.alphaVerify,
        1,
        'AUTOMATED',
        '2026-01-11T09:50:00Z',
        '2026-01-11T10:05:00Z',
      );
      addExecution(
        'simpleVerify2',
        unit.simplePack,
        process.verify,
        step.alphaVerify,
        2,
        'AUTOMATED',
        '2026-01-11T11:20:00Z',
        '2026-01-11T11:35:00Z',
      );
      addExecution(
        'simpleRelease',
        unit.simplePack,
        process.release,
        step.alphaRelease,
        1,
        'MANUAL',
        '2026-01-11T11:50:00Z',
        '2026-01-11T11:55:00Z',
      );
      addExecution(
        'escalatedPrepare',
        unit.escalatedPack,
        process.prepare,
        step.betaPrepare,
        1,
        'MANUAL',
        '2026-01-12T09:00:00Z',
        '2026-01-12T09:10:00Z',
      );
      addExecution(
        'escalatedVerify1',
        unit.escalatedPack,
        process.verify,
        step.betaVerify,
        1,
        'AUTOMATED',
        '2026-01-12T09:20:00Z',
        '2026-01-12T09:35:00Z',
      );
      addExecution(
        'escalatedAssemble',
        unit.escalatedPack,
        process.assemble,
        step.betaAssemble,
        1,
        'HYBRID',
        '2026-01-12T10:30:00Z',
        '2026-01-12T10:50:00Z',
      );
      addExecution(
        'escalatedVerify2',
        unit.escalatedPack,
        process.verify,
        step.betaVerify,
        2,
        'AUTOMATED',
        '2026-01-12T11:00:00Z',
        '2026-01-12T11:15:00Z',
      );
      addExecution(
        'escalatedRelease',
        unit.escalatedPack,
        process.release,
        step.betaRelease,
        1,
        'MANUAL',
        '2026-01-12T11:30:00Z',
        '2026-01-12T11:35:00Z',
      );
      for (const row of executionRows)
        await upsertById(tx.processExecution, row);

      for (const row of [
        {
          id: specification.numeric,
          code: 'DEMO_NUMERIC_LEVEL',
          version: 1,
          name: 'Demo Numeric Level',
          description: 'Fictional demo-only range; not a production threshold.',
          resultType: 'NUMERIC',
          targetUnitType: 'PACK',
          processDefinitionId: process.verify,
          processRouteStepId: null,
          lowerBound: '10.000000',
          upperBound: '20.000000',
          unitCode: 'DEMO_UNIT',
          expectedBooleanValue: null,
          isActive: true,
        },
        {
          id: specification.boolean,
          code: 'DEMO_BOOLEAN_READY',
          version: 1,
          name: 'Demo Boolean Ready',
          description: 'Fictional readiness flag.',
          resultType: 'BOOLEAN',
          targetUnitType: 'PACK',
          processDefinitionId: process.release,
          processRouteStepId: null,
          lowerBound: null,
          upperBound: null,
          unitCode: null,
          expectedBooleanValue: true,
          isActive: true,
        },
        {
          id: specification.categorical,
          code: 'DEMO_CATEGORY_STATE',
          version: 1,
          name: 'Demo Category State',
          description: 'Fictional stable-code category.',
          resultType: 'CATEGORICAL',
          targetUnitType: 'PACK',
          processDefinitionId: process.release,
          processRouteStepId: null,
          lowerBound: null,
          upperBound: null,
          unitCode: null,
          expectedBooleanValue: null,
          isActive: true,
        },
        {
          id: specification.visual,
          code: 'DEMO_VISUAL_STATE',
          version: 1,
          name: 'Demo Visual State',
          description: 'Fictional visual classification.',
          resultType: 'VISUAL',
          targetUnitType: 'PACK',
          processDefinitionId: process.verify,
          processRouteStepId: null,
          lowerBound: null,
          upperBound: null,
          unitCode: null,
          expectedBooleanValue: null,
          isActive: true,
        },
        {
          id: specification.text,
          code: 'DEMO_TEXT_NOTE',
          version: 1,
          name: 'Demo Text Note',
          description: 'Fictional free-text observation.',
          resultType: 'TEXT',
          targetUnitType: 'PACK',
          processDefinitionId: process.release,
          processRouteStepId: null,
          lowerBound: null,
          upperBound: null,
          unitCode: null,
          expectedBooleanValue: null,
          isActive: true,
        },
      ])
        await upsertById(tx.inspectionSpecification, row);

      for (const row of [
        {
          id: option.categoryReady,
          specificationId: specification.categorical,
          resultType: 'CATEGORICAL',
          code: 'READY',
          description: 'Fictional acceptable category.',
          isAcceptable: true,
        },
        {
          id: option.categoryReview,
          specificationId: specification.categorical,
          resultType: 'CATEGORICAL',
          code: 'REVIEW',
          description: 'Fictional category requiring review.',
          isAcceptable: false,
        },
        {
          id: option.visualClear,
          specificationId: specification.visual,
          resultType: 'VISUAL',
          code: 'CLEAR',
          description: 'Fictional acceptable visual state.',
          isAcceptable: true,
        },
        {
          id: option.visualMark,
          specificationId: specification.visual,
          resultType: 'VISUAL',
          code: 'DEMO_MARK',
          description: 'Fictional visual mark for the escalation story.',
          isAcceptable: false,
        },
      ])
        await upsertById(tx.inspectionSpecificationOption, row);

      const inspection = {
        passNumeric: ownedId('10', 1),
        passBoolean: ownedId('10', 2),
        passCategory: ownedId('10', 3),
        passText: ownedId('10', 4),
        simpleNg: ownedId('10', 5),
        simplePass: ownedId('10', 6),
        escalatedNg: ownedId('10', 7),
        escalatedPass: ownedId('10', 8),
      };
      for (const row of [
        {
          id: inspection.passNumeric,
          traceableUnitId: unit.passPack,
          specificationId: specification.numeric,
          processDefinitionId: process.verify,
          processExecutionId: execution.passVerify,
          resultType: 'NUMERIC',
          targetUnitType: 'PACK',
          attemptNumber: 1,
          outcome: 'PASS',
          inspectedAt: date('2026-01-10T10:00:00Z'),
        },
        {
          id: inspection.passBoolean,
          traceableUnitId: unit.passPack,
          specificationId: specification.boolean,
          processDefinitionId: process.release,
          processExecutionId: execution.passRelease,
          resultType: 'BOOLEAN',
          targetUnitType: 'PACK',
          attemptNumber: 1,
          outcome: 'PASS',
          inspectedAt: date('2026-01-10T10:12:00Z'),
        },
        {
          id: inspection.passCategory,
          traceableUnitId: unit.passPack,
          specificationId: specification.categorical,
          processDefinitionId: process.release,
          processExecutionId: execution.passRelease,
          resultType: 'CATEGORICAL',
          targetUnitType: 'PACK',
          attemptNumber: 1,
          outcome: 'PASS',
          inspectedAt: date('2026-01-10T10:13:00Z'),
        },
        {
          id: inspection.passText,
          traceableUnitId: unit.passPack,
          specificationId: specification.text,
          processDefinitionId: process.release,
          processExecutionId: execution.passRelease,
          resultType: 'TEXT',
          targetUnitType: 'PACK',
          attemptNumber: 1,
          outcome: 'PASS',
          inspectedAt: date('2026-01-10T10:14:00Z'),
        },
        {
          id: inspection.simpleNg,
          traceableUnitId: unit.simplePack,
          specificationId: specification.numeric,
          processDefinitionId: process.verify,
          processExecutionId: execution.simpleVerify1,
          resultType: 'NUMERIC',
          targetUnitType: 'PACK',
          attemptNumber: 1,
          outcome: 'NG',
          inspectedAt: date('2026-01-11T10:00:00Z'),
        },
        {
          id: inspection.simplePass,
          traceableUnitId: unit.simplePack,
          specificationId: specification.numeric,
          processDefinitionId: process.verify,
          processExecutionId: execution.simpleVerify2,
          resultType: 'NUMERIC',
          targetUnitType: 'PACK',
          attemptNumber: 2,
          outcome: 'PASS',
          inspectedAt: date('2026-01-11T11:30:00Z'),
        },
        {
          id: inspection.escalatedNg,
          traceableUnitId: unit.escalatedPack,
          specificationId: specification.visual,
          processDefinitionId: process.verify,
          processExecutionId: execution.escalatedVerify1,
          resultType: 'VISUAL',
          targetUnitType: 'PACK',
          attemptNumber: 1,
          outcome: 'NG',
          inspectedAt: date('2026-01-12T09:30:00Z'),
        },
        {
          id: inspection.escalatedPass,
          traceableUnitId: unit.escalatedPack,
          specificationId: specification.visual,
          processDefinitionId: process.verify,
          processExecutionId: execution.escalatedVerify2,
          resultType: 'VISUAL',
          targetUnitType: 'PACK',
          attemptNumber: 2,
          outcome: 'PASS',
          inspectedAt: date('2026-01-12T11:10:00Z'),
        },
      ])
        await upsertById(tx.inspection, row);

      for (const row of [
        {
          id: ownedId('11', 1),
          inspectionId: inspection.passNumeric,
          specificationId: specification.numeric,
          resultType: 'NUMERIC',
          numericValue: '15.000000',
          booleanValue: null,
          optionId: null,
          textValue: null,
        },
        {
          id: ownedId('11', 2),
          inspectionId: inspection.passBoolean,
          specificationId: specification.boolean,
          resultType: 'BOOLEAN',
          numericValue: null,
          booleanValue: true,
          optionId: null,
          textValue: null,
        },
        {
          id: ownedId('11', 3),
          inspectionId: inspection.passCategory,
          specificationId: specification.categorical,
          resultType: 'CATEGORICAL',
          numericValue: null,
          booleanValue: null,
          optionId: option.categoryReady,
          textValue: null,
        },
        {
          id: ownedId('11', 4),
          inspectionId: inspection.passText,
          specificationId: specification.text,
          resultType: 'TEXT',
          numericValue: null,
          booleanValue: null,
          optionId: null,
          textValue: 'Synthetic demo release note.',
        },
        {
          id: ownedId('11', 5),
          inspectionId: inspection.simpleNg,
          specificationId: specification.numeric,
          resultType: 'NUMERIC',
          numericValue: '25.000000',
          booleanValue: null,
          optionId: null,
          textValue: null,
        },
        {
          id: ownedId('11', 6),
          inspectionId: inspection.simplePass,
          specificationId: specification.numeric,
          resultType: 'NUMERIC',
          numericValue: '16.000000',
          booleanValue: null,
          optionId: null,
          textValue: null,
        },
        {
          id: ownedId('11', 7),
          inspectionId: inspection.escalatedNg,
          specificationId: specification.visual,
          resultType: 'VISUAL',
          numericValue: null,
          booleanValue: null,
          optionId: option.visualMark,
          textValue: null,
        },
        {
          id: ownedId('11', 8),
          inspectionId: inspection.escalatedPass,
          specificationId: specification.visual,
          resultType: 'VISUAL',
          numericValue: null,
          booleanValue: null,
          optionId: option.visualClear,
          textValue: null,
        },
      ])
        await upsertById(tx.inspectionResult, row);

      const defect = { range: ownedId('12', 1), visual: ownedId('12', 2) };
      for (const row of [
        {
          id: defect.range,
          code: 'DEMO_RANGE_NG',
          name: 'Demo Range Nonconformance',
          description: 'Fictional numeric demo defect.',
          isActive: true,
        },
        {
          id: defect.visual,
          code: 'DEMO_VISUAL_NG',
          name: 'Demo Visual Nonconformance',
          description: 'Fictional visual demo defect.',
          isActive: true,
        },
      ])
        await upsertById(tx.defectCategory, row);

      const nc = { simple: ownedId('13', 1), escalated: ownedId('13', 2) };
      for (const row of [
        {
          id: nc.simple,
          code: 'NC-DEMO-SIMPLE-001',
          traceableUnitId: unit.simplePack,
          defectCategoryId: defect.range,
          sourceInspectionId: inspection.simpleNg,
          sourceProcessExecutionId: execution.simpleVerify1,
          status: 'CLOSED',
          description: 'Synthetic simple correction and retest story.',
          detectedAt: date('2026-01-11T10:01:00Z'),
          resolvedAt: date('2026-01-11T11:40:00Z'),
          closedAt: date('2026-01-11T11:45:00Z'),
        },
        {
          id: nc.escalated,
          code: 'NC-DEMO-ESCALATED-001',
          traceableUnitId: unit.escalatedPack,
          defectCategoryId: defect.visual,
          sourceInspectionId: inspection.escalatedNg,
          sourceProcessExecutionId: execution.escalatedVerify1,
          status: 'CLOSED',
          description: 'Synthetic optional escalation and replacement story.',
          detectedAt: date('2026-01-12T09:31:00Z'),
          resolvedAt: date('2026-01-12T11:20:00Z'),
          closedAt: date('2026-01-12T11:25:00Z'),
        },
      ])
        await upsertById(tx.nonconformance, row);

      const abnormal = ownedId('14', 1);
      await upsertById(tx.abnormalCase, {
        id: abnormal,
        nonconformanceId: nc.escalated,
        code: 'ABNORMAL-DEMO-001',
        reason: 'Fictional escalation used only to exercise optional history.',
        openedAt: date('2026-01-12T09:40:00Z'),
        closedAt: date('2026-01-12T11:20:00Z'),
      });

      const action = {
        simpleCorrection: ownedId('15', 1),
        simpleRetest: ownedId('15', 2),
        escalation: ownedId('15', 3),
        replacement: ownedId('15', 4),
        escalatedRetest: ownedId('15', 5),
      };
      for (const row of [
        {
          id: action.simpleCorrection,
          nonconformanceId: nc.simple,
          traceableUnitId: unit.simplePack,
          abnormalCaseId: null,
          resultingInspectionId: null,
          relatedUnitId: null,
          actionType: 'CORRECTION',
          note: 'Fictional adjustment before retest.',
          occurredAt: date('2026-01-11T10:30:00Z'),
        },
        {
          id: action.simpleRetest,
          nonconformanceId: nc.simple,
          traceableUnitId: unit.simplePack,
          abnormalCaseId: null,
          resultingInspectionId: inspection.simplePass,
          relatedUnitId: null,
          actionType: 'RETEST',
          note: 'Separate PASS inspection retained after original NG.',
          occurredAt: date('2026-01-11T11:30:00Z'),
        },
        {
          id: action.escalation,
          nonconformanceId: nc.escalated,
          traceableUnitId: unit.escalatedPack,
          abnormalCaseId: abnormal,
          resultingInspectionId: null,
          relatedUnitId: null,
          actionType: 'ESCALATION',
          note: 'Fictional optional escalation.',
          occurredAt: date('2026-01-12T09:40:00Z'),
        },
        {
          id: action.replacement,
          nonconformanceId: nc.escalated,
          traceableUnitId: unit.escalatedPack,
          abnormalCaseId: abnormal,
          resultingInspectionId: null,
          relatedUnitId: unit.betaComponent,
          actionType: 'REPLACEMENT',
          note: 'Fictional component replacement action.',
          occurredAt: date('2026-01-12T10:10:00Z'),
        },
        {
          id: action.escalatedRetest,
          nonconformanceId: nc.escalated,
          traceableUnitId: unit.escalatedPack,
          abnormalCaseId: abnormal,
          resultingInspectionId: inspection.escalatedPass,
          relatedUnitId: null,
          actionType: 'RETEST',
          note: 'Separate PASS inspection after escalation.',
          occurredAt: date('2026-01-12T11:10:00Z'),
        },
      ])
        await upsertById(tx.actionHistory, row);

      for (const row of [
        {
          id: ownedId('16', 1),
          nonconformanceId: nc.simple,
          traceableUnitId: unit.simplePack,
          actionHistoryId: action.simpleRetest,
          inspectionId: inspection.simplePass,
          note: 'Synthetic PASS retest verification.',
          verifiedAt: date('2026-01-11T11:40:00Z'),
        },
        {
          id: ownedId('16', 2),
          nonconformanceId: nc.escalated,
          traceableUnitId: unit.escalatedPack,
          actionHistoryId: action.escalatedRetest,
          inspectionId: inspection.escalatedPass,
          note: 'Synthetic escalated-case PASS verification.',
          verifiedAt: date('2026-01-12T11:20:00Z'),
        },
      ])
        await upsertById(tx.verification, row);

      for (const row of [
        {
          id: ownedId('17', 1),
          nonconformanceId: nc.simple,
          dispositionType: 'CONTINUE',
          note: 'Synthetic continuation after verified retest.',
          decidedAt: date('2026-01-11T11:45:00Z'),
        },
        {
          id: ownedId('17', 2),
          nonconformanceId: nc.escalated,
          dispositionType: 'RETURN_IQC',
          note: 'Synthetic interim decision retained as history.',
          decidedAt: date('2026-01-12T09:50:00Z'),
        },
        {
          id: ownedId('17', 3),
          nonconformanceId: nc.escalated,
          dispositionType: 'CONTINUE',
          note: 'Synthetic later decision after verified rework.',
          decidedAt: date('2026-01-12T11:25:00Z'),
        },
      ])
        await upsertById(tx.dispositionHistory, row);
    },
    { maxWait: 10_000, timeout: 30_000 },
  );

  console.log('Deterministic Phase 2F synthetic seed completed.');
}

try {
  await seed();
} finally {
  await prisma.$disconnect();
}
