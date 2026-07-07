// drizzle.config.ts — configuration for the drizzle-kit CLI (generate/migrate).
//
// CONCEPT: a migration is a versioned SQL script that evolves the database from
// one shape to the next. drizzle-kit compares schema.ts against the last
// migration and generates the SQL to close the gap, so schema changes are
// tracked in git and applied in order — never by hand-editing the live DB.
import { defineConfig } from 'drizzle-kit'
import dotenv from 'dotenv'
// dotenv's default file is .env; our secrets live in .env.local (Next.js convention).
dotenv.config({ path: '.env.local' })
dotenv.config()

export default defineConfig({
  schema: './src/lib/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  // SANCTIONED EXCEPTION to the getEnv() rule: drizzle-kit is a CLI that runs
  // OUTSIDE the Next.js app (at build/deploy time), so it can't import our app's
  // env module. Here alone we read process.env.DATABASE_URL directly, loaded by
  // 'dotenv/config' above from .env.local.
  dbCredentials: { url: process.env.DATABASE_URL! },
})
