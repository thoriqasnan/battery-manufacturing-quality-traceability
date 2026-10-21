import {
  assertIsolatedTestDatabase,
  ISOLATED_TEST_DATABASE,
} from './test-database-identity.js';

await assertIsolatedTestDatabase();
console.log(`Isolated test database verified: ${ISOLATED_TEST_DATABASE}`);
