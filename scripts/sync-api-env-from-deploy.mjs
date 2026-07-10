#!/usr/bin/env node
/**
 * Writes apps/api/.env DATABASE_URL from deploy/.env (VPS Postgres credentials).
 * Run after deploy/.env is configured: node scripts/sync-api-env-from-deploy.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deployEnvPath = resolve(root, "deploy/.env");
const apiEnvPath = resolve(root, "apps/api/.env");

if (!existsSync(deployEnvPath)) {
  console.error("Missing deploy/.env — copy deploy/.env.example first.");
  process.exit(1);
}

const deployEnv = Object.fromEntries(
  readFileSync(deployEnvPath, "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#") && line.includes("="))
    .map((line) => {
      const i = line.indexOf("=");
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
);

const { VPS_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB } = deployEnv;
if (!VPS_HOST || !POSTGRES_USER || !POSTGRES_PASSWORD || !POSTGRES_DB) {
  console.error("deploy/.env must set VPS_HOST, POSTGRES_USER, POSTGRES_PASSWORD, POSTGRES_DB");
  process.exit(1);
}

const password = encodeURIComponent(POSTGRES_PASSWORD);
const localPort = process.env.VPS_PG_LOCAL_PORT || "5433";
const databaseUrl = `postgresql://${POSTGRES_USER}:${password}@127.0.0.1:${localPort}/${POSTGRES_DB}?schema=public`;

let apiEnv = existsSync(apiEnvPath) ? readFileSync(apiEnvPath, "utf8") : "";
if (/^DATABASE_URL=/m.test(apiEnv)) {
  apiEnv = apiEnv.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${databaseUrl}`);
} else {
  apiEnv = `DATABASE_URL=${databaseUrl}\n${apiEnv}`;
}

writeFileSync(apiEnvPath, apiEnv);
console.log(`Updated apps/api/.env → DATABASE_URL via tunnel localhost:${localPort}/${POSTGRES_DB} (${VPS_HOST})`);
console.log("Start tunnel: npm run db:tunnel");
