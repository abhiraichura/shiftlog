import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from "@remix-run/node";
import { unauthenticated } from "~/shopify.server";
import prisma from "~/db.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Shopify-Shop-Domain, Authorization, authorization",
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

  const staffMember = await prisma.staffMember.findFirst({
    where: { storeId: store.id, role: "OWNER", isActive: true },
  });

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) return json({ error: "orderId required" }, { status: 400, headers: CORS });

  const annotations = await prisma.orderAnnotation.findMany({
    where: { storeId: store.id, shopifyOrderId: orderId },
    orderBy: { createdAt: "desc" },
    include: { staffMember: { select: { name: true, role: true } } },
  });

  return json({
    annotations: annotations.map((a) => ({
      id: a.id,
      note: a.note,
      needsOwner: a.needsOwner,
      resolvedAt: a.resolvedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      staffName: a.staffMember.name,
    })),
    canResolve: true,
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

  const method = request.method.toUpperCase();
  const body = await request.json().catch(() => ({}));

  if (method === "POST") {
    const { orderId, orderNumber, note, needsOwner } = body;
    if (!orderId || !note) {
      return json({ error: "orderId and note required" }, { status: 400, headers: CORS });
    }

    const annotation = await prisma.orderAnnotation.create({
      data: {
        storeId: store.id,
        staffMemberId: staffMember.id,
        shopifyOrderId: String(orderId),
        orderNumber: String(orderNumber ?? orderId),
        note: String(note),
        needsOwner: Boolean(needsOwner),
      },
    });

    if (needsOwner) {
      await prisma.pendingItem.create({
        data: {
          storeId: store.id,
          createdById: staffMember.id,
          title: `Order ${orderNumber} flagged`,
          description: note,
          sourceType: "order_annotation",
          sourceId: annotation.id,
          priority: "NORMAL",
        },
      });
    }

    return json({ annotation: { id: annotation.id } }, { headers: CORS });
  }

  if (method === "PUT") {
    const { annotationId } = body;
    if (!annotationId) return json({ error: "annotationId required" }, { status: 400, headers: CORS });
    await prisma.orderAnnotation.update({
      where: { id: annotationId, storeId: store.id },
      data: { resolvedAt: new Date() },
    });
    return json({ ok: true }, { headers: CORS });
  }

  return json({ error: "Method not allowed" }, { status: 405, headers: CORS });
};
