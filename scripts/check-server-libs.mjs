// Loads the libraries the server uses the way Vercel's runtime does: without Node's newer
// ability to require() ES modules. A library that only loads with it would crash every route.
import { execFileSync } from 'node:child_process';

const libraries = [
  '@solana/web3.js',
  '@circle-fin/developer-controlled-wallets',
  '@anthropic-ai/sdk',
  'firebase-admin',
];

let failed = false;
for (const library of libraries) {
  try {
    execFileSync(
      process.execPath,
      ['--no-experimental-require-module', '-e', `require(${JSON.stringify(library)})`],
      { stdio: 'pipe' },
    );
    console.log(`ok    ${library}`);
  } catch (error) {
    failed = true;
    const firstLine = String(error.stderr ?? error)
      .split('\n')
      .find((line) => line.trim());
    console.error(`FAIL  ${library}: ${firstLine}`);
  }
}
process.exit(failed ? 1 : 0);
