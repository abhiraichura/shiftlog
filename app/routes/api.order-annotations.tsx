import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

/**
 * Used by the order-annotations UI Extension to:
 * GET  /api/order-annotations?orderId=123&orderNumber=#1001
 * POST /api/order-annotations  { orderId, orderNumber, note, needsOwner }
 * PUT  /api/order-annotations  { annotationId, resolvedAt }
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) return json({ error: "orderId required" }, { status: 400 });

  const annotations = await prisma.orderAnnotation.findMany({
    where: {
      storeId: store.id,
      shopifyOrderId: orderId,
    },
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
    canResolve:
      staffMember?.role === "OWNER" || staffMember?.role === "MANAGER",
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  if (!staffMember) return json({ error: "Unauthorized" }, { status: 403 });

  const method = request.method.toUpperCase();
  const body = await request.json().catch(() => ({}));

  if (method === "POST") {
    const { orderId, orderNumber, note, needsOwner } = body;
    if (!orderId || !note) {
      return json({ error: "orderId and note required" }, { status: 400 });
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

    await prisma.auditLog.create({
      data: {
        storeId: store.id,
        staffMemberId: staffMember.id,
        actionType: "NOTE_ADDED",
        resourceType: "order",
        resourceId: String(orderId),
        resourceLabel: `Order ${orderNumber}`,
        metadata: { annotationId: annotation.id },
      },
    });

    return json({ annotation: { id: annotation.id } });
  }

  if (method === "PUT") {
    const { annotationId } = body;
    if (!annotationId) return json({ error: "annotationId required" }, { status: 400 });

    if (staffMember.role !== "OWNER" && staffMember.role !== "MANAGER") {
      return json({ error: "Only managers can resolve annotations" }, { status: 403 });
    }

    await prisma.orderAnnotation.update({
      where: { id: annotationId, storeId: store.id },
      data: { resolvedAt: new Date() },
    });

    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};
