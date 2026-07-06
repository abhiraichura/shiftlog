import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInviteEmail({
  toEmail,
  toName,
  storeName,
  ownerName,
  inviteToken,
}: {
  toEmail: string;
  toName: string;
  storeName: string;
  ownerName: string;
  inviteToken: string;
}) {
  const inviteUrl = `${process.env.SHOPIFY_APP_URL}/invite/${inviteToken}`;

  const text = `Hi ${toName},

${ownerName} has invited you to join ${storeName}'s operations team on ShiftLog.

ShiftLog is where the team logs daily shift notes, flags issues on orders, and keeps track of what's happening in the store — so nothing gets lost in WhatsApp.

Accept your invitation here:
${inviteUrl}

This link expires in 72 hours.

—
ShiftLog
support@shiftlog.app`;

  await resend.emails.send({
    from: "ShiftLog <invites@shiftlog.app>",
    to: toEmail,
    subject: `You've been invited to join ${storeName} on ShiftLog`,
    text,
  });
}

export async function sendDailyDigestEmail({
  toEmail,
  ownerName,
  dateLabel,
  refunds,
  totalRefunded,
  shiftNotes,
  didNotSubmit,
  pendingItems,
  urgentSupplierNotes,
  storeShop,
}: {
  toEmail: string;
  ownerName: string;
  dateLabel: string;
  refunds: Array<{ resourceLabel: string; metadata: any }>;
  totalRefunded: number;
  shiftNotes: Array<{ staffMember: { name: string } }>;
  didNotSubmit: Array<{ name: string }>;
  pendingItems: Array<{ title: string; createdBy: { name: string }; createdAt: Date }>;
  urgentSupplierNotes: Array<{ supplier: { name: string }; note: string; staffMember: { name: string } }>;
  storeShop: string;
}) {
  let text = `Good morning ${ownerName},\n\nHere's what happened in your store on ${dateLabel}:\n\n`;

  text += `REFUNDS\n`;
  if (refunds.length === 0) {
    text += `— No refunds issued\n`;
  } else {
    text += `— ${refunds.length} refund${refunds.length !== 1 ? "s" : ""} totalling $${totalRefunded.toFixed(2)}\n`;
    refunds.forEach((r) => {
      const meta = r.metadata as any;
      text += `  → ${r.resourceLabel} — $${meta?.amount?.toFixed(2) ?? "?"} — ${meta?.reason ?? "No reason"}\n`;
    });
  }

  text += `\nSHIFT NOTES\n`;
  if (shiftNotes.length === 0 && didNotSubmit.length === 0) {
    text += `— No active staff members\n`;
  }
  shiftNotes.forEach((n) => {
    text += `— ${n.staffMember.name} submitted a shift note ✓\n`;
  });
  didNotSubmit.forEach((s) => {
    text += `— ${s.name} did not submit a shift note\n`;
  });

  if (pendingItems.length > 0) {
    text += `\nNEEDS YOUR ATTENTION (${pendingItems.length} unresolved)\n`;
    pendingItems.forEach((p) => {
      text += `— ${p.title} — flagged by ${p.createdBy.name}\n`;
    });
  } else {
    text += `\nNEEDS YOUR ATTENTION\n— Nothing pending ✓\n`;
  }

  if (urgentSupplierNotes.length > 0) {
    text += `\nURGENT SUPPLIER UPDATES\n`;
    urgentSupplierNotes.forEach((n) => {
      text += `— ${n.supplier.name}: ${n.note} (${n.staffMember.name})\n`;
    });
  }

  text += `\n—\nOpen ShiftLog: https://${storeShop}/admin/apps/shiftlog\nReply to this email with any questions.\n`;

  await resend.emails.send({
    from: "ShiftLog <digest@shiftlog.app>",
    to: toEmail,
    subject: `Your ShiftLog summary — ${dateLabel}`,
    text,
  });
}
