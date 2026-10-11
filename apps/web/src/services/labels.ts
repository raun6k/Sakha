const roleNames: Record<string, string> = {
  sakha: "Sakha",
  megha: "Megha",
  jal: "Jal",
  kheti: "Kheti",
  paisa: "Paisa",
};

export function roleLabel(key: string) {
  return roleNames[key] ?? key.replaceAll("_", " ");
}

export function freshnessLabel(status: string) {
  switch (status) {
    case "fresh":
      return "Current";
    case "stale":
      return "May be out of date";
    case "missing":
      return "Not available";
    case "partial":
      return "Incomplete";
    case "unknown":
      return "Not checked";
    default:
      return status.replaceAll("_", " ");
  }
}

export function capabilityLabel(status: string) {
  switch (status) {
    case "enabled":
      return "Available";
    case "degraded":
      return "Limited";
    case "disabled":
      return "Not available";
    case "unavailable":
      return "Not available yet";
    case "validating":
      return "Being checked";
    case "declared":
      return "Listed only";
    default:
      return status.replaceAll("_", " ");
  }
}

export function chatStatusLabel(status: string | undefined) {
  switch (status) {
    case "enabled":
    case "degraded":
      return "Ready to ask";
    case "disabled":
      return "Setup needed";
    default:
      return "Not available yet";
  }
}

export function alertStatusLabel(status: string) {
  switch (status) {
    case "active":
      return "Needs review";
    case "acknowledged":
      return "Noted";
    case "dismissed":
      return "Set aside";
    case "expired":
      return "Expired";
    default:
      return status.replaceAll("_", " ");
  }
}

export function severityLabel(severity: string) {
  switch (severity) {
    case "information":
      return "Note";
    case "advisory":
      return "Advisory";
    case "warning":
      return "Warning";
    default:
      return severity.replaceAll("_", " ");
  }
}

export function recordKindLabel(kind: string) {
  switch (kind) {
    case "finding":
      return "Suggestion";
    case "plan_proposal":
      return "Proposal";
    case "plan_decision":
      return "Your decision";
    case "actual_work":
      return "Completed work";
    case "correction":
      return "Correction";
    case "outcome":
      return "Outcome";
    case "alert":
      return "Alert";
    default:
      return kind.replaceAll("_", " ");
  }
}

export function planStatusLabel(status: string) {
  switch (status) {
    case "proposed":
      return "Proposal";
    case "approved":
      return "Approved";
    case "rejected":
      return "Not chosen";
    case "changes_requested":
      return "Changes requested";
    case "pending":
      return "Waiting";
    case "deferred":
      return "Not yet";
    default:
      return status.replaceAll("_", " ");
  }
}

export function originLabel(origin: string) {
  switch (origin) {
    case "live_source":
      return "Official source";
    case "imported_source":
      return "Imported document";
    case "farmer_report":
      return "Your report";
    case "derived_calculation":
      return "Calculation";
    case "agent_inference":
      return "Specialist note";
    case "fixture":
      return "Example data";
    default:
      return origin.replaceAll("_", " ");
  }
}

export function runStatusLabel(state: string) {
  switch (state) {
    case "queued":
      return "Waiting to start";
    case "running":
      return "Working on your question";
    case "waiting_clarification":
      return "Waiting for your answer";
    case "waiting_approval":
      return "Waiting for your review";
    case "completed":
      return "Answer saved";
    case "failed":
      return "Could not finish";
    case "cancelled":
      return "Stopped";
    case "interrupted":
      return "Stopped before finishing";
    default:
      return state.replaceAll("_", " ");
  }
}

export function completenessLabel(status: string) {
  switch (status) {
    case "complete":
      return "Complete coverage";
    case "partial":
      return "Partial coverage";
    case "missing":
      return "Coverage missing";
    default:
      return status.replaceAll("_", " ");
  }
}
