import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getStoreAndStaff } from "~/utils/store.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const { session } = await authenticate.admin(request);
  const { store } = await getStoreAndStaff(session.shop);

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return json({ error: "customerId required" }, { status: 400, headers: CORS });

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
  }, { headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(session.shop);

  if (!staffMember) return json({ error: "Unauthorized" }, { status: 403, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const { customerId, customerName, customerEmail, note, isWarning } = body;

  if (!customerId || !customerName || !note) {
    return json({ error: "customerId, customerName, and note required" }, { status: 400, headers: CORS });
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

  return json({ ok: true }, { headers: CORS });
};
