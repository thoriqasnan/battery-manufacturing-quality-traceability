import pg from 'pg';

export const ISOLATED_TEST_DATABASE = 'battery_quality_traceability_test';

export async function assertIsolatedTestDatabase(
  explicitConnectionString?: string,
): Promise<void> {
  const connectionString = explicitConnectionString ?? process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is required for the isolated test database guard.',
    );
  }

  const client = new pg.Client({ connectionString });

  try {
    await client.connect();
    const result = await client.query<{ currentDatabase: string }>(
      'SELECT current_database() AS "currentDatabase"',
    );
    const actualDatabase = result.rows[0]?.currentDatabase;

    if (actualDatabase !== ISOLATED_TEST_DATABASE) {
      throw new Error(
        `Refusing database-mutating tests: connected to "${actualDatabase ?? 'unknown'}", expected "${ISOLATED_TEST_DATABASE}".`,
      );
    }
  } finally {
    await client.end();
  }
}
