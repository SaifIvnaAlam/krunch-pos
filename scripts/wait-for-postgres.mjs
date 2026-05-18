import { execSync } from "node:child_process";

const container = "krunch-pos-postgres";
const maxAttempts = 30;

for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
  try {
    execSync(`docker exec ${container} pg_isready -U postgres -d postgres`, {
      stdio: "ignore",
    });
    process.exit(0);
  } catch {
    if (attempt === maxAttempts) break;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

console.error(
  `Postgres container "${container}" did not become ready within ${maxAttempts}s. Run: npm run db:up`,
);
process.exit(1);
