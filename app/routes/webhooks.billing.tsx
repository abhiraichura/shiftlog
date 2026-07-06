import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

/**
 * Handles Shopify billing subscription changes:
 * - Plan upgrades / downgrades
 * - Subscription cancellations
 * - Payment failures
 *
 * Register in shopify.app.toml under webhooks:
 *   [[webhooks.subscriptions]]
 *   topics = ["app_subscriptions/update"]
 *   uri = "/webhooks/billing"
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  if (topic !== "APP_SUBSCRIPTIONS_UPDATE") {
    return new Response(null, { status: 200 });
  }

  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store) return new Response("Store not found", { status: 404 });

  const sub = payload as any;
  const planName: string = sub.name ?? "";
  const status: string = sub.status ?? "";

  // Map Shopify plan names → our PlanTier enum
  const PLAN_NAME_MAP: Record<string, string> = {
    "Solo Monthly": "SOLO",
    "Solo Annual": "SOLO",
    "Team Monthly": "TEAM",
    "Team Annual": "TEAM",
    "Agency Monthly": "AGENCY",
    "Agency Annual": "AGENCY",
  };

  const newTier = PLAN_NAME_MAP[planName];

  if (status === "ACTIVE" && newTier) {
    await prisma.store.update({
      where: { id: store.id },
      data: {
        planTier: newTier as any,
        billingId: String(sub.id ?? ""),
        billingStatus: "active",
        trialEndsAt: null,
      },
    });

    // If downgrading, deactivate excess staff
    if (newTier === "SOLO") {
      // Solo = max 2 staff. Keep owner + 1 most recent active member.
      const activeStaff = await prisma.staffMember.findMany({
        where: { storeId: store.id, isActive: true, role: { not: "OWNER" } },
        orderBy: { createdAt: "asc" },
      });
      if (activeStaff.length > 1) {
        const toDeactivate = activeStaff.slice(1); // keep oldest 1
        await prisma.staffMember.updateMany({
          where: { id: { in: toDeactivate.map((s) => s.id) } },
          data: { isActive: false },
        });
      }
    } else if (newTier === "TEAM") {
      // Team = max 6 staff.
      const activeStaff = await prisma.staffMember.findMany({
        where: { storeId: store.id, isActive: true, role: { not: "OWNER" } },
        orderBy: { createdAt: "asc" },
      });
      if (activeStaff.length > 5) {
        const toDeactivate = activeStaff.slice(5);
        await prisma.staffMember.updateMany({
          where: { id: { in: toDeactivate.map((s) => s.id) } },
          data: { isActive: false },
        });
      }
    }

    console.log(`[billing] ${shop} upgraded to ${newTier}`);
  } else if (status === "CANCELLED" || status === "DECLINED" || status === "EXPIRED") {
    await prisma.store.update({
      where: { id: store.id },
      data: {
        billingStatus: status.toLowerCase(),
        // Revert to TRIAL so they see the upgrade prompt (data preserved)
        planTier: "TRIAL",
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 day grace
      },
    });
    console.log(`[billing] ${shop} subscription ${status} — reverted to TRIAL with 30-day grace`);
  }

  return new Response(null, { status: 200 });
};
