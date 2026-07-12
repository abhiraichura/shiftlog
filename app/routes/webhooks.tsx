import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, session, payload } =
    await authenticate.webhook(request);

  const store = await prisma.store.findUnique({ where: { shop } });
  if (!store) return new Response("Store not found", { status: 404 });

  switch (topic) {
    case "APP_UNINSTALLED": {
      await prisma.store.update({
        where: { id: store.id },
        data: { billingStatus: "uninstalled" },
      });
      break;
    }

    case "REFUNDS_CREATE": {
      const refund = payload as any;
      const orderId = String(refund.order_id);
      const amount = parseFloat(refund.transactions?.[0]?.amount ?? "0");
      const reason = refund.note ?? refund.refund_line_items?.[0]?.reason ?? "No reason given";

      // Fetch order number
      let orderNumber = `#${orderId}`;
      try {
        const resp = await fetch(
          `https://${shop}/admin/api/2024-10/orders/${orderId}.json?fields=order_number`,
          { headers: { "X-Shopify-Access-Token": session?.accessToken ?? "" } }
        );
        const { order } = await resp.json();
        orderNumber = `#${order.order_number}`;
      } catch {}

      await prisma.auditLog.create({
        data: {
          storeId: store.id,
          actionType: "REFUND_ISSUED",
          resourceType: "order",
          resourceId: orderId,
          resourceLabel: `Order ${orderNumber}`,
          metadata: { amount, reason, refundId: String(refund.id) },
        },
      });
      break;
    }

    case "ORDERS_UPDATED": {
      const order = payload as any;
      const orderId = String(order.id);
      const orderNumber = `#${order.order_number}`;

      if (order.cancelled_at) {
        // Check if already logged
        const existing = await prisma.auditLog.findFirst({
          where: {
            storeId: store.id,
            actionType: "ORDER_CANCELLED",
            resourceId: orderId,
          },
        });
        if (!existing) {
          await prisma.auditLog.create({
            data: {
              storeId: store.id,
              actionType: "ORDER_CANCELLED",
              resourceType: "order",
              resourceId: orderId,
              resourceLabel: `Order ${orderNumber}`,
              metadata: {
                reason: order.cancel_reason ?? "No reason",
                cancelledAt: order.cancelled_at,
              },
            },
          });
        }
      }
      break;
    }

    case "ORDERS_EDITED": {
      const orderEdit = payload as any;
      const orderId = String(orderEdit.order_id);
      await prisma.auditLog.create({
        data: {
          storeId: store.id,
          actionType: "ORDER_EDITED",
          resourceType: "order",
          resourceId: orderId,
          resourceLabel: `Order #${orderId}`,
          metadata: { editId: String(orderEdit.id) },
        },
      });
      break;
    }

    case "PRODUCTS_UPDATE": {
      const product = payload as any;
      // Detect price changes by comparing with last logged price
      for (const variant of product.variants ?? []) {
        const priceKey = `product_price_${variant.id}`;
        // We use a simple approach: log if the variant has been updated recently
        // In production, you'd store the last known price in a separate table
        await prisma.auditLog.create({
          data: {
            storeId: store.id,
            actionType: "PRODUCT_PRICE_CHANGED",
            resourceType: "product",
            resourceId: String(product.id),
            resourceLabel: `${product.title} — ${variant.title}`,
            metadata: {
              newPrice: variant.price,
              sku: variant.sku,
              variantId: String(variant.id),
            },
          },
        });
        break; // Only log once per product update to avoid noise
      }
      break;
    }

    default: {
    }
  }

  return new Response(null, { status: 200 });
};
