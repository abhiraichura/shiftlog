import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from "@remix-run/node";
import prisma from "~/db.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const shop = request.headers.get("X-Shopify-Shop-Domain") ??
    new URL(request.url).searchParams.get("shop") ?? "";

  if (!shop) return json({ error: "shop required" }, { status: 400, headers: CORS });

  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store) return json({ error: "Store not found" }, { status: 404, headers: CORS });

  const url = new URL(request.url);
  const customerId = url.searchParams.get("customerId");
  if (!customerId) return json({ error: "customerId required" }, { status: 400, headers: CORS });

  const notes = await prisma.customerNote.findMany({
    where: { storeId: store.id, shopifyCustomerId: customerId },
    orderBy: { createdAt: "desc" },
    include: { staffMember: { select: { name: true } } },
  });

  return json({
    notes: notes.map((n) => ({
      id: n.id,
      note: n.note,
      isWarning: n.isWarning,
      createdAt: n.createdAt.toISOString(),
      staffName: n.staffMember.name,
    })),
    hasWarning: notes.some((n) => n.isWarning),
  }, { headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const shop = request.headers.get("X-Shopify-Shop-Domain") ??
    new URL(request.url).searchParams.get("shop") ?? "";

  if (!shop) return json({ error: "shop required" }, { status: 400, headers: CORS });

  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store) return json({ error: "Store not found" }, { status: 404, headers: CORS });

  const staffMember = await prisma.staffMember.findFirst({
    where: { storeId: store.id, role: "OWNER", isActive: true },
  });
  if (!staffMember) return json({ error: "No staff found" }, { status: 403, headers: CORS });

  const body = await request.json().catch(() => ({}));
  const { customerId, customerName, customerEmail, note, isWarning } = body;

  if (!customerId || !customerName || !note) {
    return json({ error: "Required fields missing" }, { status: 400, headers: CORS });
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
