import { defineConfig } from "vitest/config";
import { readFileSync, existsSync } from "node:fs";

// No dotenv dependency needed for a handful of KEY=VALUE lines.
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

export default defineConfig({
  test: {
    environment: "node",
    testTimeout: 15000,
  },
});
