const assert = require('assert');

let testCases = [];

function test(name, fn) {
  testCases.push({ name, fn });
}

async function runTests(pattern = '') {
  console.log('Running tests...\n');
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const { name, fn } of testCases) {
    if (pattern && !name.includes(pattern)) {
      skipped++;
      continue;
    }

    try {
      await fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      console.error(`✗ ${name}`);
      console.error(error);
      failed++;
    }
  }

  console.log(`\nTest Results: ${passed + failed} ran, ${passed} passed, ${failed} failed, ${skipped} skipped`);
  
  // Reset the test cases array
  testCases = [];

  if (failed > 0) {
    process.exit(1);
  }
}

// If this script is run directly, execute tests with an optional pattern
if (require.main === module) {
  const pattern = process.argv[2] || '';
  runTests(pattern);
}

module.exports = { test, runTests };