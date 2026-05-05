export type PageStatus =
  | "draft"
  | "reviewing"
  | "approved"
  | "published"
  | "archived"
  | "rejected";

export type PolicyStatus = "pending" | "approved" | "flagged" | "rejected";
export type QualityDecision = "approve" | "retry" | "merge" | "reject" | null;

export function isPublicPageStatus(status: PageStatus): boolean {
  return status === "published" || status === "archived";
}

export function isPublishablePage(
  status: PageStatus,
  qualityDecision: QualityDecision,
  policyStatus: PolicyStatus,
): boolean {
  return status === "approved" && qualityDecision === "approve" && policyStatus === "approved";
}

export function shouldNoindexPage(status: PageStatus, policyStatus: PolicyStatus): boolean {
  return status === "archived" || policyStatus === "rejected";
}
