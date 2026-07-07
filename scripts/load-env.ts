// Loads .env.local (then .env) BEFORE anything else runs.
//
// CONCEPT: ES module imports are hoisted — they all execute before the file's
// own code. So calling dotenv.config() in a script's body is too late for
// modules like db.ts that read env at import time. Importing THIS module first
// guarantees the env is populated before any other import evaluates.
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
dotenv.config()
