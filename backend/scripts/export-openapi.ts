import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { buildApp, exportOpenApi } from '../src/app';

const target = resolve(process.cwd(), '..', 'docs', 'openapi.json');

async function main(): Promise<void> {
  const app = await buildApp({ logger: false });
  try {
    const document = await exportOpenApi(app);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    console.log(`OpenAPI document written to ${target}`);
  } finally {
    await app.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
