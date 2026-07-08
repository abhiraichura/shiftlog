import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { getStoreAndStaff } from "~/utils/store.server";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(session.shop);

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
      staffRole: a.staffMember.role,
    })),
    canResolve: staffMember?.role === "OWNER" || staffMember?.role === "MANAGER",
  }, { headers: CORS });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(session.shop);

  if (!staffMember) return json({ error: "Unauthorized" }, { status: 403, headers: CORS });

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
          title: `Order ${orderNumber} flagged — ${staffMember.name}`,
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

    if (staffMember.role !== "OWNER" && staffMember.role !== "MANAGER") {
      return json({ error: "Only managers can resolve" }, { status: 403, headers: CORS });
    }

    await prisma.orderAnnotation.update({
      where: { id: annotationId, storeId: store.id },
      data: { resolvedAt: new Date() },
    });

    return json({ ok: true }, { headers: CORS });
  }

  return json({ error: "Method not allowed" }, { status: 405, headers: CORS });
};
