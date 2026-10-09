import { cp } from 'node:fs/promises';

// Resolve from this script so copying does not depend on the working directory.
await cp(
  new URL('../src/templates/', import.meta.url),
  new URL('../dist/templates/', import.meta.url),
  { recursive: true },
);
