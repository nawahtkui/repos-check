const order = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0
};

const confidenceOrder = {
  high: 3,
  medium: 2,
  low: 1
};

export function normalizeFindings(findings = []) {
  return findings
    .map((finding, index) => ({
      id:
        finding.id ||
        `RC-${String(index + 1).padStart(4, "0")}`,

      severity:
        finding.severity || "info",

      category:
        finding.category || "general",

      title:
        finding.title || "Untitled finding",

      path:
        finding.path || ".",

      evidence:
        finding.evidence || "",

      recommendation:
        finding.recommendation || "",

      confidence:
        finding.confidence || "medium"
    }))
    .sort(
      (a, b) => {
        const severityDifference =
          (order[b.severity] ?? 0) -
          (order[a.severity] ?? 0);

        if (severityDifference !== 0) {
          return severityDifference;
        }

        return (
          (confidenceOrder[b.confidence] ?? 0) -
          (confidenceOrder[a.confidence] ?? 0)
        );
      }
    );
}
