import * as fs from 'fs';
import * as path from 'path';

/**
 * Every NodejsFunction in the stack names its handler as a string, and nothing checks that the
 * string matches a real export. Get it wrong and the build passes, cdk synth passes, the deploy
 * succeeds, and the route fails at runtime with Runtime.HandlerNotFound the first time it's called.
 *
 * That has already happened twice here: images.getAllImages has never worked, and the muk hunt
 * upload and submission handlers shipped with their routes wired but their exports missing.
 *
 * This reads the handler names out of the stack and checks each against the module it points at.
 * It's a static source check rather than an import, because the lambdas pull in @middy/core, which
 * is ESM-only and can't be required from Jest's CJS runtime.
 */

const LAMBDA_DIR = path.join(__dirname, '../lib/lambda');
const STACK_PATH = path.join(__dirname, '../lib/ps-backend-stack.ts');

interface LambdaWiring {
  entryFile: string;
  handlerName: string;
}

/**
 * Pulls (entry, handler) pairs out of the NodejsFunction definitions in the stack. A regex rather
 * than a real parse, but these are written in a consistent shape and the alternative is no check.
 */
function readLambdaWirings(): LambdaWiring[] {
  const source = fs.readFileSync(STACK_PATH, 'utf8');
  const pattern = /entry:\s*path\.join\(__dirname,\s*"\.\/lambda\/([a-zA-Z]+)\.ts"\),\s*\n\s*handler:\s*'([a-zA-Z]+)'/g;

  const wirings: LambdaWiring[] = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    wirings.push({ entryFile: match[1], handlerName: match[2] });
  }
  return wirings;
}

/**
 * Top-level export names in a lambda module. Covers both styles in use: `export const x = middy(..)`
 * in posts/images/mukhunt, and `export async function x()` in survivor.
 */
function readExportedNames(entryFile: string): string[] {
  const source = fs.readFileSync(path.join(LAMBDA_DIR, `${entryFile}.ts`), 'utf8');
  const pattern = /^export\s+(?:const|(?:async\s+)?function)\s+([a-zA-Z0-9_]+)/gm;

  const names: string[] = [];
  let match;
  while ((match = pattern.exec(source)) !== null) {
    names.push(match[1]);
  }
  return names;
}

describe('lambda handler wiring', () => {
  const wirings = readLambdaWirings();

  test('the stack defines lambdas in the shape this test expects', () => {
    // guards the regex: if the stack gets reformatted so it stops matching, fail loudly rather
    // than quietly asserting nothing.
    expect(wirings.length).toBeGreaterThanOrEqual(20);
  });

  test.each(readLambdaWirings())(
    'lambda/$entryFile.ts exports $handlerName',
    ({ entryFile, handlerName }) => {
      expect(readExportedNames(entryFile)).toContain(handlerName);
    }
  );
});
