import { type LoaderFunctionArgs } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { hasPlanFeature } from "~/utils/planCheck.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store } = await getStoreAndStaff(session.shop);

  if (!hasPlanFeature(store.planTier, "csvExport")) {
    throw new Response("Upgrade to Agency to export the audit log", { status: 403 });
  }

  const logs = await prisma.auditLog.findMany({
    where: { storeId: store.id },
    orderBy: { detectedAt: "desc" },
    include: { staffMember: true },
    take: 10000,
  });

  const rows = [
    ["Date", "Time", "Staff", "Action", "Resource", "Details"].join(","),
    ...logs.map((l) => {
      const dt = new Date(l.detectedAt);
      const meta = l.metadata as any;
      const details = meta?.amount
        ? `$${Number(meta.amount).toFixed(2)}`
        : meta?.reason ?? meta?.oldPrice
        ? `${meta.oldPrice} → ${meta.newPrice}`
        : "";
      return [
        dt.toLocaleDateString(),
        dt.toLocaleTimeString(),
        `"${l.staffMember?.name ?? "System"}"`,
        l.actionType,
        `"${l.resourceLabel}"`,
        `"${details}"`,
      ].join(",");
    }),
  ].join("\n");

  return new Response(rows, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="shiftlog-audit-${store.shop}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
};
