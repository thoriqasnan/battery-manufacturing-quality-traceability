import { PrismaService } from '../src/prisma/prisma.service.js';
import { TraceabilityIntegrityService } from '../src/traceability/traceability-integrity.service.js';
import { TraceabilityRepository } from '../src/traceability/traceability.repository.js';
import { TraceabilityService } from '../src/traceability/traceability.service.js';

const prisma = new PrismaService();
const repository = new TraceabilityRepository(prisma);
const traceability = new TraceabilityService(repository);
const integrity = new TraceabilityIntegrityService(prisma);

try {
  const [
    forward,
    reverse,
    oldCurrent,
    oldHistorical,
    replacement,
    simple,
    escalated,
    simpleProcess,
    simpleQuality,
    report,
  ] = await Promise.all([
    traceability.forwardGenealogy('PACK-DEMO-ALPHA-PASS'),
    traceability.reverseGenealogy('CELL-DEMO-ALPHA-PASS-01'),
    traceability.reverseGenealogy('COMP-DEMO-OLD'),
    traceability.reverseGenealogy('COMP-DEMO-OLD', { mode: 'historical' }),
    traceability.replacementHistory('MODULE-DEMO-ALPHA-RETEST-01', 'SENSOR-01'),
    traceability.nonconformanceHistory('PACK-DEMO-ALPHA-RETEST'),
    traceability.nonconformanceHistory('PACK-DEMO-BETA-ESCALATED'),
    traceability.processHistory('PACK-DEMO-ALPHA-RETEST'),
    traceability.qualityHistory('PACK-DEMO-ALPHA-RETEST'),
    integrity.validateSeedDataset(),
  ]);

  const evidence = {
    forward: forward.edges.map((edge) => ({
      depth: edge.depth,
      parent: edge.parentTraceCode,
      child: edge.childTraceCode,
    })),
    reverse: reverse.edges.map((edge) => ({
      depth: edge.depth,
      child: edge.childTraceCode,
      parent: edge.parentTraceCode,
    })),
    oldComponent: {
      currentParents: oldCurrent.edges.length,
      historicalPath: oldHistorical.edges.map((edge) => edge.parentTraceCode),
    },
    replacement: replacement.map((edge) => ({
      child: edge.childTraceCode,
      position: edge.positionCode,
      current: edge.isCurrent,
      installedAt: edge.installedAt,
      removedAt: edge.removedAt,
    })),
    process: simpleProcess.map((entry) => ({
      process: entry.processCode,
      attempt: entry.attemptNumber,
      status: entry.status,
      method: entry.executionMethod,
    })),
    quality: simpleQuality.map((entry) => ({
      specification: entry.specificationCode,
      attempt: entry.attemptNumber,
      outcome: entry.outcome,
      evidence: entry.evidence,
    })),
    simple: simple.map((nc) => ({
      code: nc.code,
      sourceOutcome: nc.sourceInspection?.outcome,
      abnormalCases: nc.abnormalCases.length,
      actions: nc.actions.map((action) => action.actionType),
      verificationOutcomes: nc.verifications.map(
        (verification) => verification.inspection.outcome,
      ),
      dispositions: nc.dispositions.map((item) => item.dispositionType),
    })),
    escalated: escalated.map((nc) => ({
      code: nc.code,
      sourceOutcome: nc.sourceInspection?.outcome,
      abnormalCases: nc.abnormalCases.map((item) => item.code),
      actions: nc.actions.map((action) => action.actionType),
      verificationOutcomes: nc.verifications.map(
        (verification) => verification.inspection.outcome,
      ),
      dispositions: nc.dispositions.map((item) => item.dispositionType),
    })),
    integrity: report,
  };
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  await prisma.onModuleDestroy();
}
