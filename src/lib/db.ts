// db.ts — one shared database client for the whole app.
//
// Every module that touches the database imports `db` from here, so there is a
// single connection configured in a single place. The connection string comes
// through getEnv() (our validated config gate), never straight from process.env.
//
// Neon's serverless driver speaks Postgres over HTTP, which suits Vercel's
// serverless functions: each invocation is short-lived, so there are no
// long-held connection pools to babysit or exhaust.
import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import { getEnv } from './env'
import * as schema from './schema'

// Passing `schema` gives the client full knowledge of our tables, so query
// results come back fully typed.
export const db = drizzle(neon(getEnv().DATABASE_URL), { schema })
