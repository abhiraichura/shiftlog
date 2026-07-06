import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

/**
 * Used by the customer-notes UI Extension to:
 * GET  /api/customer-notes?customerId=123
 * POST /api/customer-notes  { customerId, customerName, customerEmail, note, isWarning }
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return json({ error: "customerId required" }, { status: 400 });

  const notes = await prisma.customerNote.findMany({
    where: { storeId: store.id, shopifyCustomerId: customerId },
    orderBy: { createdAt: "desc" },
    include: { staffMember: { select: { name: true } } },
  });

  const hasWarning = notes.some((n) => n.isWarning);

  return json({
    notes: notes.map((n) => ({
      id: n.id,
      note: n.note,
      isWarning: n.isWarning,
      createdAt: n.createdAt.toISOString(),
      staffName: n.staffMember.name,
    })),
    hasWarning,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  if (!staffMember) return json({ error: "Unauthorized" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { customerId, customerName, customerEmail, note, isWarning } = body;

  if (!customerId || !customerName || !note) {
    return json({ error: "customerId, customerName, and note are required" }, { status: 400 });
  }

  await prisma.customerNote.create({
    data: {
      storeId: store.id,
      staffMemberId: staffMember.id,
      shopifyCustomerId: String(customerId),
      customerName: String(customerName),
      customerEmail: customerEmail ? String(customerEmail) : null,
      note: String(note),
      isWarning: Boolean(isWarning),
    },
  });

  return json({ ok: true });
};
