import type { Store } from "@prisma/client";

export type PlanFeature =
  | "shifts"
  | "orderAnnotations"
  | "customerNotes"
  | "suppliers"
  | "pending"
  | "digest"
  | "team_2"
  | "audit"
  | "search"
  | "templates"
  | "team_6"
  | "team_unlimited"
  | "multistore"
  | "slack"
  | "whatsapp"
  | "csvExport";

export const PLAN_FEATURES: Record<string, PlanFeature[]> = {
  TRIAL: [
    "shifts",
    "orderAnnotations",
    "customerNotes",
    "suppliers",
    "pending",
    "digest",
    "team_2",
  ],
  SOLO: [
    "shifts",
    "orderAnnotations",
    "customerNotes",
    "suppliers",
    "pending",
    "digest",
    "team_2",
  ],
  TEAM: [
    "shifts",
    "orderAnnotations",
    "customerNotes",
    "suppliers",
    "pending",
    "digest",
    "audit",
    "search",
    "templates",
    "team_6",
  ],
  AGENCY: [
    "shifts",
    "orderAnnotations",
    "customerNotes",
    "suppliers",
    "pending",
    "digest",
    "audit",
    "search",
    "templates",
    "team_unlimited",
    "multistore",
    "slack",
    "whatsapp",
    "csvExport",
  ],
};

export const PLAN_USER_LIMITS: Record<string, number> = {
  TRIAL: 2,
  SOLO: 2,
  TEAM: 6,
  AGENCY: Infinity,
};

export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  TRIAL: "Free Trial",
  SOLO: "Solo ($19/mo)",
  TEAM: "Team ($49/mo)",
  AGENCY: "Agency ($129/mo)",
};

export const FEATURE_REQUIRED_PLAN: Record<PlanFeature, string> = {
  shifts: "Solo",
  orderAnnotations: "Solo",
  customerNotes: "Solo",
  suppliers: "Solo",
  pending: "Solo",
  digest: "Solo",
  team_2: "Solo",
  audit: "Team",
  search: "Team",
  templates: "Team",
  team_6: "Team",
  team_unlimited: "Agency",
  multistore: "Agency",
  slack: "Agency",
  whatsapp: "Agency",
  csvExport: "Agency",
};

export function hasPlanFeature(
  planTier: string,
  feature: PlanFeature
): boolean {
  const features = PLAN_FEATURES[planTier] ?? [];
  return features.includes(feature);
}

export function isTrialExpired(store: Store): boolean {
  if (store.planTier !== "TRIAL") return false;
  if (!store.trialEndsAt) return false;
  return new Date() > new Date(store.trialEndsAt);
}

export function getTrialDaysRemaining(store: Store): number {
  if (store.planTier !== "TRIAL" || !store.trialEndsAt) return 0;
  const diff = new Date(store.trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function canInviteMoreStaff(
  planTier: string,
  currentActiveCount: number
): boolean {
  const limit = PLAN_USER_LIMITS[planTier] ?? 0;
  return currentActiveCount < limit;
}
