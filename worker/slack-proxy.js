/**
 * slack-proxy.js — minimal Cloudflare Worker.
 *
 * The browser can't POST directly to a Slack incoming webhook (CORS). This
 * ~20-line Worker accepts { text } from the app and forwards it to Slack.
 * No key ever touches client code — the webhook lives in a Worker secret.
 *
 * Deploy:
 *   1. npm i -g wrangler && wrangler login
 *   2. wrangler deploy worker/slack-proxy.js --name bellwether-slack
 *   3. wrangler secret put SLACK_WEBHOOK_URL   (paste your Slack incoming webhook)
 *   4. Put the resulting workers.dev URL into src/config.js -> slackWorkerUrl
 */
export default {
  async fetch(request, env) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (request.method !== "POST")
      return new Response("POST only", { status: 405, headers: cors });

    try {
      const { text } = await request.json();
      if (!text) return json({ ok: false, error: "missing text" }, 400, cors);
      if (!env.SLACK_WEBHOOK_URL)
        return json({ ok: false, error: "worker missing SLACK_WEBHOOK_URL secret" }, 500, cors);

      const r = await fetch(env.SLACK_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      return json({ ok: r.ok }, r.ok ? 200 : 502, cors);
    } catch (e) {
      return json({ ok: false, error: String(e) }, 500, cors);
    }
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
