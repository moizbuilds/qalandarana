// set-webhook.ts — points Telegram at our deployed webhook, once per deploy URL.
//
// Telegram doesn't poll us; we tell IT where to POST new voice notes. This calls
// the Bot API `setWebhook` method with our production URL + the shared secret,
// then reads `getWebhookInfo` back so you can SEE it registered (Telegram accepts
// setWebhook optimistically — the info call is the real confirmation).
//
// Run AFTER deploying: `npx tsx scripts/set-webhook.ts`.
//
// NOTE: RELATIVE imports (../src/lib/...), not the '@/' alias — tsx does not read
// tsconfig `paths` at runtime, so '@/' would fail when this script actually runs.
// Same convention as scripts/seed.ts.
import 'dotenv/config'
import { getEnv } from '../src/lib/env'

// CONCEPT: a webhook is a URL you register with a third party so IT calls YOU
// when something happens — the inverse of polling, where you'd repeatedly ask
// "anything new?". Telegram will POST every matching update to this URL.
async function main() {
  const { APP_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET } = getEnv()

  // Guard: webhooks need a PUBLIC url Telegram can reach. localhost is only
  // visible on your machine, so registering it silently breaks every delivery.
  // Fail closed with a fix, rather than "succeeding" into a dead webhook.
  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(APP_URL)) {
    console.error(
      `APP_URL is local (${APP_URL}). Telegram cannot reach a localhost webhook.\n` +
      `Deploy first, then set APP_URL to your public Vercel URL and re-run this script.`,
    )
    process.exit(1)
  }

  const webhookUrl = `${APP_URL}/api/telegram/webhook`
  const api = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`

  // setWebhook: register the URL + secret. secret_token makes Telegram send an
  // `X-Telegram-Bot-Api-Secret-Token` header on every call, which our webhook
  // route checks — so a stranger who guesses the URL still can't post to us.
  // allowed_updates: ['message'] narrows deliveries to messages only (we don't
  // care about edits, reactions, etc.), cutting noise the route would just drop.
  const setRes = await fetch(`${api}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      secret_token: TELEGRAM_WEBHOOK_SECRET,
      allowed_updates: ['message'],
    }),
  })
  console.log('setWebhook →', webhookUrl)
  console.log(JSON.stringify(await setRes.json(), null, 2))

  // getWebhookInfo: read back what Telegram now has registered. This is the
  // confirmation that matters — check `url` matches and `last_error_message` is
  // empty. A non-empty `last_error_message` means deliveries are failing.
  const infoRes = await fetch(`${api}/getWebhookInfo`)
  console.log('\ngetWebhookInfo →')
  console.log(JSON.stringify(await infoRes.json(), null, 2))
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
