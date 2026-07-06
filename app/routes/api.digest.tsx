import { type ActionFunctionArgs, json } from "@remix-run/node";
import { sendDailyDigests } from "~/jobs/dailyDigest.server";

/**
 * POST /api/digest
 *
 * Called by a cron job (e.g. Fly.io cron, GitHub Actions, or cron-job.org) every hour.
 * Protected by a shared secret in the Authorization header.
 *
 * Cron schedule: every hour at :00
 * Example curl: curl -X POST https://your-app.fly.dev/api/digest \
 *   -H "Authorization: Bearer YOUR_CRON_SECRET"
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const authHeader = request.headers.get("Authorization");
  const expectedToken = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expectedToken) {
    return json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();
  try {
    await sendDailyDigests();
    return json({ ok: true, durationMs: Date.now() - start });
  } catch (err) {
    console.error("[api/digest] Error:", err);
    return json({ error: String(err) }, { status: 500 });
  }
};

export const loader = () => json({ error: "Method not allowed" }, { status: 405 });
