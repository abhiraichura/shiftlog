export const SOLO_MONTHLY = "Solo Monthly";
export const SOLO_ANNUAL = "Solo Annual";
export const TEAM_MONTHLY = "Team Monthly";
export const TEAM_ANNUAL = "Team Annual";
export const AGENCY_MONTHLY = "Agency Monthly";
export const AGENCY_ANNUAL = "Agency Annual";

export const PLAN_DISPLAY_NAMES: Record<string, string> = {
  TRIAL: "Free Trial",
  SOLO: "Solo ($19/mo)",
  TEAM: "Team ($49/mo)",
  AGENCY: "Agency ($129/mo)",
};

export const PLANS = [
  {
    key: "SOLO",
    name: "Solo",
    monthlyPlan: SOLO_MONTHLY,
    annualPlan: SOLO_ANNUAL,
    monthlyPrice: 19,
    annualPrice: 190,
    description: "For solo operators or tiny teams",
    recommended: false,
    features: [
      "Shift notes",
      "Order & customer annotations",
      "Supplier directory",
      "Pending items inbox",
      "Daily digest email",
      "Up to 2 staff members",
    ],
  },
  {
    key: "TEAM",
    name: "Team",
    monthlyPlan: TEAM_MONTHLY,
    annualPlan: TEAM_ANNUAL,
    monthlyPrice: 49,
    annualPrice: 490,
    description: "For growing teams with accountability needs",
    recommended: true,
    features: [
      "Everything in Solo",
      "Full audit trail",
      "Search all notes",
      "Note templates",
      "Up to 6 staff members",
    ],
  },
  {
    key: "AGENCY",
    name: "Agency",
    monthlyPlan: AGENCY_MONTHLY,
    annualPlan: AGENCY_ANNUAL,
    monthlyPrice: 129,
    annualPrice: 1290,
    description: "For agencies managing multiple stores",
    recommended: false,
    features: [
      "Everything in Team",
      "Unlimited staff members",
      "Multi-store access",
      "Slack digest",
      "WhatsApp alerts",
      "CSV export",
    ],
  },
];
