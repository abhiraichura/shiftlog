/**
 * Real-time alerts for urgent pending items (Agency plan only)
 * Slack via Incoming Webhooks
 * WhatsApp via Twilio WhatsApp Business API
 */

export async function sendSlackAlert({
  webhookUrl,
  title,
  description,
  flaggedBy,
  storeShop,
}: {
  webhookUrl: string;
  title: string;
  description?: string | null;
  flaggedBy: string;
  storeShop: string;
}) {
  const storeName = storeShop.replace(".myshopify.com", "");
  const appUrl = `https://${storeShop}/admin/apps/shiftlog/pending`;

  const payload = {
    text: `🚨 *Urgent item flagged on ${storeName}*`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `🚨 Urgent: ${title}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Store:*\n${storeName}` },
          { type: "mrkdwn", text: `*Flagged by:*\n${flaggedBy}` },
        ],
      },
      ...(description
        ? [
            {
              type: "section",
              text: { type: "mrkdwn", text: `*Details:*\n${description}` },
            },
          ]
        : []),
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: { type: "plain_text", text: "Open ShiftLog →", emoji: true },
            url: appUrl,
            style: "danger",
          },
        ],
      },
    ],
  };

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Slack webhook failed: ${res.status} ${text}`);
  }
}

export async function sendWhatsAppAlert({
  toNumber,
  title,
  flaggedBy,
  storeShop,
}: {
  toNumber: string;
  title: string;
  flaggedBy: string;
  storeShop: string;
}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_WHATSAPP_FROM; // e.g. whatsapp:+14155238886

  if (!accountSid || !authToken || !fromNumber) {
    console.warn("[whatsapp] Twilio credentials not configured — skipping WhatsApp alert");
    return;
  }

  const storeName = storeShop.replace(".myshopify.com", "");
  const body = `🚨 *ShiftLog Alert — ${storeName}*\n\nUrgent item flagged by ${flaggedBy}:\n_${title}_\n\nOpen ShiftLog to action this: https://${storeShop}/admin/apps/shiftlog/pending`;

  const toWhatsApp = toNumber.startsWith("whatsapp:") ? toNumber : `whatsapp:${toNumber}`;

  const params = new URLSearchParams({
    From: fromNumber,
    To: toWhatsApp,
    Body: body,
  });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    }
  );

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(`Twilio WhatsApp failed: ${res.status} — ${JSON.stringify(data)}`);
  }
}

/**
 * Fire all configured alerts for an urgent pending item.
 * Silently logs errors so a failed alert never breaks the main action.
 */
export async function fireUrgentAlerts({
  storeId,
  title,
  description,
  flaggedBy,
  storeShop,
  slackWebhookUrl,
  whatsappNumber,
}: {
  storeId: string;
  title: string;
  description?: string | null;
  flaggedBy: string;
  storeShop: string;
  slackWebhookUrl?: string | null;
  whatsappNumber?: string | null;
}) {
  const tasks: Promise<void>[] = [];

  if (slackWebhookUrl) {
    tasks.push(
      sendSlackAlert({ webhookUrl: slackWebhookUrl, title, description, flaggedBy, storeShop }).catch(
        (err) => console.error("[slack alert] Failed:", err)
      )
    );
  }

  if (whatsappNumber) {
    tasks.push(
      sendWhatsAppAlert({ toNumber: whatsappNumber, title, flaggedBy, storeShop }).catch(
        (err) => console.error("[whatsapp alert] Failed:", err)
      )
    );
  }

  await Promise.allSettled(tasks);
}
