import { type LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "~/shopify.server";
import { getStoreAndStaff } from "~/utils/store.server";
import { isTrialExpired, getTrialDaysRemaining, hasPlanFeature } from "~/utils/planCheck.server";
import prisma from "~/db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const { store, staffMember } = await getStoreAndStaff(session.shop);
  const url = new URL(request.url);
  const path = url.pathname;

  if (!store.onboardingDone && staffMember?.role === "OWNER" && !path.includes("/onboarding")) {
    throw redirect("/app/onboarding");
  }
  if (isTrialExpired(store) && !path.includes("/settings/billing")) {
    throw redirect("/app/settings/billing");
  }

  const pendingCount = await prisma.pendingItem.count({
    where: { storeId: store.id, resolvedAt: null },
  });

  return json({
    apiKey: process.env.SHOPIFY_API_KEY ?? "",
    pendingCount,
    canMultistore: hasPlanFeature(store.planTier, "multistore"),
    store: { planTier: store.planTier, trialDaysRemaining: getTrialDaysRemaining(store) },
    staffMember: staffMember
      ? { id: staffMember.id, name: staffMember.name, role: staffMember.role }
      : null,
  });
};

export default function App() {
  const { apiKey, pendingCount, canMultistore } = useLoaderData<typeof loader>();
  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">Dashboard</a>
        <a href="/app/shifts">Shift Notes</a>
        <a href="/app/pending">{pendingCount > 0 ? `Pending (${pendingCount})` : "Pending Items"}</a>
        <a href="/app/orders">Order Notes</a>
        <a href="/app/customers">Customer Notes</a>
        <a href="/app/suppliers">Suppliers</a>
        <a href="/app/audit">Audit Trail</a>
        <a href="/app/search">Search</a>
        <a href="/app/team">Team</a>
        {canMultistore && <a href="/app/multistore">Multi-Store</a>}
        <a href="/app/settings">Settings</a>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return (
    <AppProvider isEmbeddedApp apiKey="">
      <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
        <h1>Something went wrong</h1>
        <p style={{ color: "#666", fontSize: 14 }}>Please refresh or contact support@shiftlog.app</p>
      </div>
    </AppProvider>
  );
}
