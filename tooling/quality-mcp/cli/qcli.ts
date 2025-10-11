#!/usr/bin/env node

import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { runTests } from '../src/tools/run_tests.js';

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === 'run' && args[1] === '--tests') {
    try {
      const result = await runTests({});
      const outputPath = '.qreport/tests.json';
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(result, null, 2));
      console.log(`Test report saved to ${outputPath}`);
      process.exit(0);
    } catch (err) {
      console.error(`Error: ${(err as Error).message}`);
      process.exit(1);
    }
  } else {
    console.log('Usage: qcli run --tests');
    process.exit(1);
  }
}

main();