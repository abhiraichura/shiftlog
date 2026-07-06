import { type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import prisma from "~/db.server";

/**
 * GDPR mandatory webhooks required for Shopify App Store submission.
 * These handle data deletion / redaction requests.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  switch (topic) {
    case "CUSTOMERS_DATA_REQUEST": {
      // A customer requested their data. You must email it to the shop owner within 30 days.
      // Log the request.
      console.log(`[gdpr] Customer data request for shop: ${shop}`, payload);
      // In production: create a task, email the owner with the data, etc.
      break;
    }

    case "CUSTOMERS_REDACT": {
      // A customer requested deletion. Remove their data.
      const p = payload as any;
      const customerId = String(p.customer?.id ?? "");
      const shop_domain = shop;

      const store = await prisma.store.findUnique({ where: { shop: shop_domain } });
      if (store && customerId) {
        await prisma.customerNote.deleteMany({
          where: {
            storeId: store.id,
            shopifyCustomerId: { in: [`gid://shopify/Customer/${customerId}`, customerId] },
          },
        });
      }
      console.log(`[gdpr] Customer redacted: ${customerId} for ${shop}`);
      break;
    }

    case "SHOP_REDACT": {
      // The shop was deleted. Remove all store data.
      const store = await prisma.store.findUnique({ where: { shop } });
      if (store) {
        // Cascade deletes handle related records via Prisma schema
        await prisma.store.delete({ where: { id: store.id } });
      }
      console.log(`[gdpr] Shop redacted: ${shop}`);
      break;
    }

    default:
      console.log(`[gdpr] Unhandled topic: ${topic}`);
  }

  return new Response(null, { status: 200 });
};
