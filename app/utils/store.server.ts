import prisma from "~/db.server";
import type { Store, StaffMember } from "@prisma/client";
import { isTrialExpired } from "~/utils/planCheck.server";

export type StoreWithStaff = Store & { staffMembers: StaffMember[] };

/**
 * Resolves the Store and current StaffMember from a Shopify session.
 * Throws a redirect to /app/settings/billing if trial is expired.
 */
export async function getStoreAndStaff(
  shop: string,
  sessionEmail?: string | null | undefined
): Promise<{ store: Store; staffMember: StaffMember | null }> {
  const store = await prisma.store.findUnique({
    where: { shop },
  });

  if (!store) {
    throw new Response("Store not found", { status: 404 });
  }

  let staffMember: StaffMember | null = null;
  if (sessionEmail) {
    staffMember = await prisma.staffMember.findFirst({
      where: { storeId: store.id, email: sessionEmail, isActive: true },
    });
  }

  return { store, staffMember };
}

/**
 * Returns the StaffMember for the current session, or throws if not found.
 */
export async function requireStaffMember(
  storeId: string,
  email: string
): Promise<StaffMember> {
  const member = await prisma.staffMember.findFirst({
    where: { storeId, email, isActive: true },
  });
  if (!member) {
    throw new Response("Staff member not found", { status: 403 });
  }
  return member;
}

/**
 * Formats a date for display in the UI.
 */
export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function timeAgo(date: Date | string): string {
  const seconds = Math.floor(
    (Date.now() - new Date(date).getTime()) / 1000
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(date);
}
