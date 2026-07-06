import { formatInTimeZone } from "date-fns-tz";
import { subDays, startOfDay } from "date-fns";
import prisma from "~/db.server";
import { sendDailyDigestEmail } from "~/utils/email.server";

export async function sendDailyDigests() {
  const now = new Date();

  const stores = await prisma.store.findMany({
    where: {
      digestEnabled: true,
      planTier: { not: "TRIAL" },
      billingStatus: { not: "uninstalled" },
    },
    include: {
      staffMembers: { where: { isActive: true } },
    },
  });

  for (const store of stores) {
    try {
      const storeTime = formatInTimeZone(now, store.timezone, "HH:mm");
      if (storeTime !== store.digestTime) continue;

      // Check not already sent today
      const todayStart = startOfDay(now);
      const alreadySent = await prisma.digestLog.findFirst({
        where: { storeId: store.id, sentAt: { gte: todayStart } },
      });
      if (alreadySent) continue;

      // Yesterday's date range in store's timezone
      const yesterday = subDays(todayStart, 1);

      const [refunds, shiftNotes, pendingItems, urgentSupplierNotes] =
        await Promise.all([
          prisma.auditLog.findMany({
            where: {
              storeId: store.id,
              actionType: "REFUND_ISSUED",
              detectedAt: { gte: yesterday, lt: todayStart },
            },
          }),
          prisma.shiftNote.findMany({
            where: {
              storeId: store.id,
              createdAt: { gte: yesterday, lt: todayStart },
            },
            include: { staffMember: true },
          }),
          prisma.pendingItem.findMany({
            where: { storeId: store.id, resolvedAt: null },
            include: { createdBy: true },
            orderBy: { createdAt: "asc" },
            take: 20,
          }),
          prisma.supplierNote.findMany({
            where: {
              storeId: store.id,
              isUrgent: true,
              createdAt: { gte: yesterday },
            },
            include: { supplier: true, staffMember: true },
          }),
        ]);

      const submittedIds = new Set(shiftNotes.map((n) => n.staffMemberId));
      const didNotSubmit = store.staffMembers.filter(
        (s) => s.role !== "OWNER" && !submittedIds.has(s.id)
      );

      const totalRefunded = refunds.reduce(
        (sum, r) => sum + ((r.metadata as any)?.amount ?? 0),
        0
      );

      const dateLabel = formatInTimeZone(
        yesterday,
        store.timezone,
        "EEEE, MMMM d"
      );

      await sendDailyDigestEmail({
        toEmail: store.ownerEmail,
        ownerName: store.ownerName ?? "there",
        dateLabel,
        refunds,
        totalRefunded,
        shiftNotes,
        didNotSubmit,
        pendingItems,
        urgentSupplierNotes,
        storeShop: store.shop,
      });

      await prisma.digestLog.create({
        data: {
          storeId: store.id,
          emailSentTo: store.ownerEmail,
          summary: {
            refundCount: refunds.length,
            shiftNoteCount: shiftNotes.length,
            pendingCount: pendingItems.length,
            urgentSupplierCount: urgentSupplierNotes.length,
          },
        },
      });

      console.log(`[digest] Sent digest to ${store.ownerEmail} for ${store.shop}`);
    } catch (err) {
      console.error(`[digest] Failed for store ${store.shop}:`, err);
    }
  }
}
