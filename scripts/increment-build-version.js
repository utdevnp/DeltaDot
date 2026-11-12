import { readFile, writeFile } from 'node:fs/promises';

const packagePath = new URL('../package.json', import.meta.url);
const lockPath = new URL('../package-lock.json', import.meta.url);

const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(packageJson.version);

if (!match) {
  throw new Error(`Cannot increment non-standard app version: ${packageJson.version}`);
}

const nextVersion = `${match[1]}.${match[2]}.${Number(match[3]) + 1}`;
packageJson.version = nextVersion;
await writeFile(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`);

const lockJson = JSON.parse(await readFile(lockPath, 'utf8'));
lockJson.version = nextVersion;
if (lockJson.packages?.['']) lockJson.packages[''].version = nextVersion;
await writeFile(lockPath, `${JSON.stringify(lockJson, null, 2)}\n`);

console.log(`DeltaDot build version: ${nextVersion}`);
