import type { Store } from "@prisma/client";

export type PlanFeature =
  | "shifts" | "orderAnnotations" | "customerNotes" | "suppliers"
  | "pending" | "digest" | "team_2" | "audit" | "search" | "templates"
  | "team_6" | "team_unlimited" | "multistore" | "slack" | "whatsapp" | "csvExport";

// All features enabled for all plans during testing
// Re-enable gating before App Store submission by restoring PLAN_FEATURES
export const PLAN_FEATURES: Record<string, PlanFeature[]> = {
  TRIAL: ["shifts","orderAnnotations","customerNotes","suppliers","pending","digest","team_2","audit","search","templates","team_6","team_unlimited","multistore","slack","whatsapp","csvExport"],
  SOLO: ["shifts","orderAnnotations","customerNotes","suppliers","pending","digest","team_2","audit","search","templates","team_6","team_unlimited","multistore","slack","whatsapp","csvExport"],
  TEAM: ["shifts","orderAnnotations","customerNotes","suppliers","pending","digest","team_2","audit","search","templates","team_6","team_unlimited","multistore","slack","whatsapp","csvExport"],
  AGENCY: ["shifts","orderAnnotations","customerNotes","suppliers","pending","digest","team_2","audit","search","templates","team_6","team_unlimited","multistore","slack","whatsapp","csvExport"],
};

export const PLAN_USER_LIMITS: Record<string, number> = {
  TRIAL: Infinity, SOLO: Infinity, TEAM: Infinity, AGENCY: Infinity,
};

export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  TRIAL: "Free Trial", SOLO: "Solo ($19/mo)", TEAM: "Team ($49/mo)", AGENCY: "Agency ($129/mo)",
};

export const FEATURE_REQUIRED_PLAN: Record<PlanFeature, string> = {
  shifts: "Solo", orderAnnotations: "Solo", customerNotes: "Solo",
  suppliers: "Solo", pending: "Solo", digest: "Solo", team_2: "Solo",
  audit: "Team", search: "Team", templates: "Team", team_6: "Team",
  team_unlimited: "Agency", multistore: "Agency", slack: "Agency",
  whatsapp: "Agency", csvExport: "Agency",
};

export function hasPlanFeature(_planTier: string, _feature: PlanFeature): boolean {
  return true; // All features enabled during testing
}

export function isTrialExpired(_store: Store): boolean {
  return false; // Disable expiry during testing
}

export function getTrialDaysRemaining(store: Store): number {
  if (store.planTier !== "TRIAL" || !store.trialEndsAt) return 14;
  const diff = new Date(store.trialEndsAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

export function canInviteMoreStaff(_planTier: string, _count: number): boolean {
  return true; // No limits during testing
}
