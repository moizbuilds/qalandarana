# Qalandarana — Setup Runbook

The once-only wiring to take Qalandarana from a fresh clone to a live site that
receives your father's voice notes. Do the steps **in order** — later steps need
values produced by earlier ones. Everything here is copy-pasteable.

You only do this once. After it's wired, the day-to-day is just: father sends a
voice note → you get a review link → he approves → it appears on `/journey`.

---

## 0. Prerequisites

- Node 20+ and npm installed (`node -v` should print v20 or higher).
- This repo cloned, and dependencies installed:

  ```bash
  npm install
  ```

- A Telegram account (on your phone), and accounts you can create for free at
  **neon.tech** (database) and **vercel.com** (hosting).

---

## 1. Create the Telegram bot → `TELEGRAM_BOT_TOKEN`

The bot is the mailbox your father forwards voice notes to.

1. In Telegram, open a chat with **@BotFather**.
2. Send `/newbot`.
3. Give it a display name (e.g. `Qalandarana`) and a username ending in `bot`
   (e.g. `qalandarana_bot`).
4. BotFather replies with a token like `123456789:ABCdef...`. **Copy it** — this
   is `TELEGRAM_BOT_TOKEN`. Treat it like a password.

---

## 2. Get your numeric user id → `TELEGRAM_ALLOWED_USER_IDS`

Only whitelisted senders may submit notes (checklist #4 — fail closed). Telegram
identifies people by a **numeric** id, not their @username.

1. In Telegram, open a chat with **@userinfobot** and send any message.
2. It replies with your `Id:` — a number like `987654321`.
3. That number is `TELEGRAM_ALLOWED_USER_IDS` **and** `TELEGRAM_ADMIN_CHAT_ID`
   (where failure alerts get sent).
4. Have your **father** message @userinfobot too, and add his id to the allow-list
   as a comma-separated list, e.g. `987654321,123123123`.

---

## 3. Create the database → `DATABASE_URL`

1. At **neon.tech**, create a project (any region near you — e.g. Frankfurt).
2. In the project's **Connection Details**, copy the **connection string**. It
   looks like `postgres://user:pass@ep-xxx.neon.tech/dbname?sslmode=require`.
3. That's `DATABASE_URL`.

> Tip: Neon can create a **branch** database — a throwaway copy — handy later for
> running the e2e tests without touching production data.

---

## 4. Generate the secrets

Several env vars are just long random strings. Generate a fresh one for **each**
(don't reuse the same value) with:

```bash
openssl rand -hex 32
```

Run it once per secret and assign the output to:

- `TELEGRAM_WEBHOOK_SECRET` — proves incoming webhook calls really came from Telegram.
- `INTERNAL_API_SECRET` — protects the internal stage-chaining route.
- `AUTH_SECRET` — signs the admin login session (must be ≥32 chars; the command gives 64).

Also pick a value for `FAMILY_PASSPHRASE` (the shared word your family types to
enter — any memorable phrase) and `STRUCTURER_PROVIDER` (start with `claude`;
you'll confirm this in Step 11).

---

## 5. Hash the admin password → `ADMIN_PASSWORD_HASH`

The admin login (`/admin`) stores a **bcrypt hash**, never the plaintext password.
Pick your password, then generate its hash (replace `the-password`):

```bash
node -e "console.log(require('bcryptjs').hashSync(process.argv[1], 12))" 'the-password'
```

It prints a string starting with `$2a$12$...` — that's `ADMIN_PASSWORD_HASH`.
Also choose `ADMIN_EMAIL` (the one login email). You'll type the **plaintext**
password at `/admin/login`; the app compares it against this hash.

---

## 6. Fill in `.env.local`

`.env.local` is the gitignored file holding your real secrets. It mirrors the
committed template `.env.example`. Create it by copying the template:

```bash
cp .env.example .env.local
```

Then open `.env.local` and paste in every value from Steps 1–5. For **local**
work leave `APP_URL=http://localhost:3000`; you'll change it to the Vercel URL in
Step 9. `PUBLIC_MODE` stays `false` (the passphrase gate is Phase 2). Every var is
**required** — the app refuses to start if any is missing (`src/lib/env.ts` fails
closed), so a blank here becomes a loud, early error rather than a mystery crash.

---

## 7. Create the tables and seed reference data

```bash
npm run db:migrate   # creates the tables in your Neon database
npm run db:seed      # inserts the 7 maqamat, 6 poets, and your 1 admin account
```

`db:seed` is idempotent — safe to re-run; it upserts rather than duplicating.

---

## 8. Local smoke test

```bash
npm run dev
```

Visit **http://localhost:3000/journey** — you should see the seven valleys in
order (each empty for now). Visit **/admin/login** and sign in with `ADMIN_EMAIL`
+ your plaintext password to confirm auth works. Stop the server with `Ctrl-C`.

---

## 9. Deploy to Vercel

The webhook needs a **public** URL, so the app must be deployed before Telegram
can reach it.

1. Link the project (creates/attaches a Vercel project):

   ```bash
   npx vercel link
   ```

2. **Create a Blob store** (where original `.ogg` audio is saved): in the Vercel
   dashboard → your project → **Storage** → **Create** → **Blob**. Copy the
   generated **`BLOB_READ_WRITE_TOKEN`** into `.env.local`.

3. **Put every env var into Vercel.** In the dashboard → **Settings** →
   **Environment Variables**, add the same keys/values as `.env.local`, with two
   changes:
   - `APP_URL` = your production URL (e.g. `https://qalandarana.vercel.app`).
   - `BLOB_READ_WRITE_TOKEN` = the value from step 9.2.

   Set `DATABASE_URL` to the **same** Neon database you migrated in Step 7 (or run
   `db:migrate`/`db:seed` again against whatever DB production points at).

4. Deploy:

   ```bash
   npx vercel --prod
   ```

5. Update `APP_URL` in your **local** `.env.local` to the production URL too, so
   the webhook script (next step) registers the right address.

---

## 10. Register the webhook

Point Telegram at your deployed webhook so it starts delivering voice notes:

```bash
npx tsx scripts/set-webhook.ts
# or: npm run set-webhook
```

It prints Telegram's `setWebhook` response, then reads `getWebhookInfo` back.
Check that:

- `setWebhook` shows `"ok": true`.
- `getWebhookInfo` shows your `url` and an **empty** `last_error_message`.

The script **refuses to run if `APP_URL` is localhost** — webhooks need a public
URL, so this catches the easy mistake of forgetting Step 9.5.

Now forward a voice note to the bot and watch it flow. Failure alerts (if any)
arrive in your Telegram from the bot.

---

## 11. The taste test — pick the structurer

Two LLMs (Claude and GPT) can turn a raw transcript into a structured entry. Run
the **same real transcript** through both and let your father judge which reads
truer; that decides `STRUCTURER_PROVIDER`.

1. After the first 2–3 real notes have processed, open `/admin`, click an entry,
   and copy its **`raw_transcript`** into a plain text file, e.g. `note1.txt`.
2. Run both providers side by side:

   ```bash
   npm run taste-test -- note1.txt
   # single provider: npm run taste-test -- note1.txt --provider claude
   ```

   It prints two labeled JSON blocks (each header shows the exact model id). If one
   provider errors, the other's output still prints.
3. Whichever your father prefers → set `STRUCTURER_PROVIDER` to `claude` or
   `openai` in **both** `.env.local` and Vercel, and redeploy.

> Model ids live in one place — `CLAUDE_MODEL` / `OPENAI_MODEL` in
> `src/lib/adapters/structurer.ts`. Verify they're still current at deploy time and
> edit there if a newer model has shipped.

---

## ⚠️ NOTE — Vercel plan and the pipeline timeout

The pipeline's `advance` route asks for a **300-second** limit
(`export const maxDuration = 300` in `src/app/api/pipeline/advance/route.ts`),
because transcribing a long note with Whisper can take minutes.

**300 seconds requires a Vercel Pro plan.** The free **Hobby** plan caps functions
at **60 seconds**. If you're on Hobby:

1. Change the value to `60`:

   ```ts
   // src/app/api/pipeline/advance/route.ts
   export const maxDuration = 60
   ```

2. Keep voice notes **short — roughly 8–10 minutes or less** — so transcription
   finishes inside 60s. For a longer recitation, split it into two notes and send
   them separately; each becomes its own entry.

Upgrading to Pro later? Set it back to `300` and the length limit relaxes.

---

## ⚠️ NOTE — Running the end-to-end (e2e) tests

The Playwright suite (`e2e/journey.spec.ts`) drives a real browser against the app
and needs a **real database**. It reads `DATABASE_URL` from `.env.local`.

```bash
# once: install the browser Playwright drives
npx playwright install chromium

# then, with .env.local filled and the DB migrated + seeded (Step 7):
npm run e2e
```

Recommended: point `DATABASE_URL` at a **Neon branch** database for tests so they
never touch production rows. The suite seeds its own fixtures (`e2e/seed-e2e.ts`)
on each run. If `DATABASE_URL` is unset, the whole suite **skips cleanly** rather
than failing — so it never blocks a machine that has no database configured.

The fast unit tests (`npm test`, vitest) need **no** database and run anywhere.
