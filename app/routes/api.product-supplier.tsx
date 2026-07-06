import { type ActionFunctionArgs, type LoaderFunctionArgs, json } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";
import { hasPlanFeature } from "~/utils/planCheck.server";

/**
 * GET  /api/product-supplier?productId=gid://shopify/Product/123
 *   → { suppliers, linkedSupplierId, recentNotes }
 * POST /api/product-supplier  { productId, productTitle, supplierId }
 *   → link product to supplier
 * DELETE /api/product-supplier  { productId }
 *   → unlink
 */
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store } = await getStoreAndStaff(session.shop);

  if (!hasPlanFeature(store.planTier, "multistore")) {
    return json({ error: "Agency plan required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const productId = url.searchParams.get("productId");
  if (!productId) return json({ error: "productId required" }, { status: 400 });

  const [suppliers, link] = await Promise.all([
    prisma.supplier.findMany({
      where: { storeId: store.id, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.productSupplierLink.findFirst({
      where: { shopifyProductId: productId },
      include: {
        supplier: {
          include: {
            supplierNotes: {
              orderBy: { createdAt: "desc" },
              take: 5,
              include: { staffMember: { select: { name: true } } },
            },
          },
        },
      },
    }),
  ]);

  const recentNotes = link?.supplier.supplierNotes.map((n) => ({
    id: n.id,
    note: n.note,
    isUrgent: n.isUrgent,
    createdAt: n.createdAt.toISOString(),
    staffName: n.staffMember.name,
    supplierName: link.supplier.name,
  })) ?? [];

  return json({
    suppliers,
    linkedSupplierId: link?.supplierId ?? null,
    recentNotes,
  });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store } = await getStoreAndStaff(session.shop);

  if (!hasPlanFeature(store.planTier, "multistore")) {
    return json({ error: "Agency plan required" }, { status: 403 });
  }

  const method = request.method.toUpperCase();
  const body = await request.json().catch(() => ({}));

  if (method === "POST") {
    const { productId, productTitle, supplierId } = body;
    if (!productId || !supplierId) {
      return json({ error: "productId and supplierId required" }, { status: 400 });
    }

    // Verify supplier belongs to this store
    const supplier = await prisma.supplier.findFirst({
      where: { id: supplierId, storeId: store.id },
    });
    if (!supplier) return json({ error: "Supplier not found" }, { status: 404 });

    await prisma.productSupplierLink.upsert({
      where: { supplierId_shopifyProductId: { supplierId, shopifyProductId: String(productId) } },
      create: {
        supplierId,
        shopifyProductId: String(productId),
        productTitle: String(productTitle ?? productId),
      },
      update: {
        supplierId,
        productTitle: String(productTitle ?? productId),
      },
    });

    return json({ ok: true });
  }

  if (method === "DELETE") {
    const { productId } = body;
    if (!productId) return json({ error: "productId required" }, { status: 400 });

    await prisma.productSupplierLink.deleteMany({
      where: { shopifyProductId: String(productId) },
    });

    return json({ ok: true });
  }

  return json({ error: "Method not allowed" }, { status: 405 });
};
