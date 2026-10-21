#!/usr/bin/env node
/**
 * Build command for Vercel (vercel.json). Applies pending migrations first, but only on the test
 * site's production build of `main` (migration gate, scripts/migration-gate.mjs, owner decision
 * D3A-19). Preview builds, other branches and the sample-data preview never migrate.
 */
import { spawnSync } from 'node:child_process';
import { applyMigrationsIfAllowed } from './migration-gate.mjs';

await applyMigrationsIfAllowed(process.env, { log: (line) => console.log(line) });
const result = spawnSync('npx', ['next', 'build'], { stdio: 'inherit', env: process.env });
process.exit(result.status ?? 1);
