import { type LoaderFunctionArgs, json, redirect } from "@remix-run/node";
import { getStoreAndStaff } from "~/utils/store.server";
import { Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "~/shopify.server";
import { isTrialExpired, getTrialDaysRemaining, hasPlanFeature } from "~/utils/planCheck.server";
import prisma from "~/db.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const { store, staffMember } = await getStoreAndStaff(
    session.shop,
    session.onlineAccessInfo?.associated_user?.email ?? session.email
  );

  const url = new URL(request.url);
  const path = url.pathname;

  // First-run onboarding redirect (only for owner, only once)
  if (
    !store.onboardingDone &&
    staffMember?.role === "OWNER" &&
    !path.includes("/onboarding")
  ) {
    throw redirect("/app/onboarding");
  }

  // Redirect to billing if trial has expired (except when already on billing page)
  if (isTrialExpired(store) && !path.includes("/settings/billing")) {
    throw redirect("/app/settings/billing");
  }

  // Unresolved pending count for nav badge
  const pendingCount = await prisma.pendingItem.count({
    where: { storeId: store.id, resolvedAt: null },
  });

  // Review prompt: show after 14 days of usage AND 5+ shift notes
  let showReviewPrompt = false;
  if (store.onboardingDone) {
    const daysSinceInstall = (Date.now() - new Date(store.createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceInstall >= 14) {
      const noteCount = await prisma.shiftNote.count({ where: { storeId: store.id } });
      showReviewPrompt = noteCount >= 5;
    }
  }

  const trialDaysRemaining = getTrialDaysRemaining(store);
  const canMultistore = hasPlanFeature(store.planTier, "multistore");

  return json({
    apiKey: process.env.SHOPIFY_API_KEY ?? "",
    store: {
      id: store.id,
      shop: store.shop,
      ownerName: store.ownerName,
      planTier: store.planTier,
      trialEndsAt: store.trialEndsAt?.toISOString() ?? null,
      trialDaysRemaining,
      createdAt: store.createdAt.toISOString(),
    },
    staffMember: staffMember
      ? {
          id: staffMember.id,
          name: staffMember.name,
          email: staffMember.email,
          role: staffMember.role,
        }
      : null,
    pendingCount,
    showReviewPrompt,
    canMultistore,
  });
};

export default function App() {
  const { apiKey, pendingCount, canMultistore } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <a href="/app" rel="home">Dashboard</a>
        <a href="/app/shifts">Shift Notes</a>
        <a href="/app/pending">
          {pendingCount > 0 ? `Pending (${pendingCount})` : "Pending Items"}
        </a>
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
  const error = useRouteError();
  return (
    <AppProvider isEmbeddedApp apiKey="">
      <div style={{ padding: "2rem" }}>
        <h1>Something went wrong</h1>
        <pre style={{ fontSize: 12, opacity: 0.7 }}>{String(error)}</pre>
      </div>
    </AppProvider>
  );
}
