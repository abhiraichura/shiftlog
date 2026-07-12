import "@shopify/shopify-app-remix/adapters/node";
import {
  ApiVersion,
  AppDistribution,
  BillingInterval,
  shopifyApp,
} from "@shopify/shopify-app-remix/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import prisma from "~/db.server";

const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.October24,
  scopes: process.env.SCOPES?.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  billing: {
    "Solo Monthly": {
      amount: 19,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
      trialDays: 14,
    },
    "Solo Annual": {
      amount: 190,
      currencyCode: "USD",
      interval: BillingInterval.Annual,
      trialDays: 14,
    },
    "Team Monthly": {
      amount: 49,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
      trialDays: 14,
    },
    "Team Annual": {
      amount: 490,
      currencyCode: "USD",
      interval: BillingInterval.Annual,
      trialDays: 14,
    },
    "Agency Monthly": {
      amount: 129,
      currencyCode: "USD",
      interval: BillingInterval.Every30Days,
      trialDays: 14,
    },
    "Agency Annual": {
      amount: 1290,
      currencyCode: "USD",
      interval: BillingInterval.Annual,
      trialDays: 14,
    },
  },
  hooks: {
  afterAuth: async ({ session }) => {
    try {
      shopify.registerWebhooks({ session });
    } catch (err) {
      console.error("[afterAuth] Webhook registration failed:", err);
    }

    try {
      const existingStore = await prisma.store.findUnique({
        where: { shop: session.shop },
        include: { staffMembers: true },
      });

      if (!existingStore) {
        const response = await fetch(
          `https://${session.shop}/admin/api/2024-10/shop.json`,
          { headers: { "X-Shopify-Access-Token": session.accessToken } }
        );
        const { shop: shopData } = await response.json();

        const store = await prisma.store.create({
          data: {
            shop: session.shop,
            ownerEmail: shopData.email,
            ownerName: shopData.shop_owner,
            planTier: "TRIAL",
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
          },
        });

        await prisma.staffMember.create({
          data: {
            storeId: store.id,
            name: shopData.shop_owner,
            email: shopData.email,
            role: "OWNER",
            acceptedAt: new Date(),
            isActive: true,
          },
        });
      } else if (existingStore.staffMembers.length === 0) {
        // Store exists but owner staff member is missing - fix it
        const response = await fetch(
          `https://${session.shop}/admin/api/2024-10/shop.json`,
          { headers: { "X-Shopify-Access-Token": session.accessToken } }
        );
        const { shop: shopData } = await response.json();

        await prisma.staffMember.create({
          data: {
            storeId: existingStore.id,
            name: shopData.shop_owner,
            email: shopData.email,
            role: "OWNER",
            acceptedAt: new Date(),
            isActive: true,
          },
        });
      }
    } catch (err) {
      console.error("[afterAuth] Store setup failed:", err);
    }
  },
},
future: {
  v3_webhookAdminContext: true,
  unstable_newEmbeddedAuthStrategy: true,
},
  ...(process.env.SHOP_CUSTOM_DOMAIN
    ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] }
    : {}),
});

export default shopify;
export const apiVersion = ApiVersion.October24;
export const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
export const authenticate = shopify.authenticate;
export const unauthenticated = shopify.unauthenticated;
export const login = shopify.login;
export const registerWebhooks = shopify.registerWebhooks;
export const sessionStorage = shopify.sessionStorage;
