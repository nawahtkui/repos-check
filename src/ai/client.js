function buildMockReview(result) {
  const findings = result.findings || [];
  const summary = result.summary || {};
  const project = result.project || {};
  const policy = result.policy || {};

  const criticalOrHigh = findings.filter(
    f => f.severity === "critical" || f.severity === "high"
  );

  const securityFindings = findings.filter(
    f => f.category === "security"
  );

  const buildFindings = findings.filter(
    f => f.category === "build"
  );

  const dependencyFindings = findings.filter(
    f => f.category === "dependencies"
  );

  let productionStatus = "mostly-ready";

  if (criticalOrHigh.length > 0) {
    productionStatus = "needs-work";
  } else if (summary.total === 0) {
    productionStatus = "ready";
  }

  return {
    executiveSummary:
      `Static repository review completed for a ` +
      `${project.projectType?.join(", ") || "project"}. ` +
      `${summary.total || 0} finding(s) detected: ` +
      `${summary.critical || 0} critical, ` +
      `${summary.high || 0} high, ` +
      `${summary.medium || 0} medium, ` +
      `${summary.low || 0} low, ` +
      `${summary.info || 0} informational.`,

    architectureAssessment:
      `Detected languages: ${project.languages?.join(", ") || "unknown"}. ` +
      `Frameworks: ${project.frameworks?.join(", ") || "none"}. ` +
      `Project type: ${project.projectType?.join(", ") || "unknown"}. ` +
      `Package managers: ${project.packageManagers?.join(", ") || "none"}.`,

    mainIssues: findings.map(f => ({
      findingId: f.id,
      severity: f.severity,
      title: f.title,
      explanation: f.evidence || "No additional evidence provided.",
      recommendation:
        f.recommendation || "Review this finding."
    })),

    securityAssessment: {
      status:
        securityFindings.some(
          f => f.severity === "critical" || f.severity === "high"
        )
          ? "risk"
          : securityFindings.length > 0
            ? "attention"
            : "clear",

      summary:
        securityFindings.length > 0
          ? `${securityFindings.length} security-related finding(s) detected.`
          : "No security findings detected by the current static analyzer.",

      items: securityFindings.map(f => ({
        severity: f.severity,
        title: f.title,
        explanation: f.evidence || "No evidence provided.",
        recommendation:
          f.recommendation || "Review this security finding."
      }))
    },

    buildAndDependencies: {
      summary:
        `${buildFindings.length} build finding(s), ` +
        `${dependencyFindings.length} dependency finding(s).`,

      buildStatus: policy.requireBuild
        ? buildFindings.some(
            f => f.severity === "critical" || f.severity === "high"
          )
          ? "fail"
          : "pass"
        : "not-required",

      dependencyStatus:
        dependencyFindings.some(
          f => f.severity === "critical" || f.severity === "high"
        )
          ? "risk"
          : dependencyFindings.length > 0
            ? "attention"
            : "healthy",

      recommendations: [
        ...buildFindings.map(f => f.recommendation).filter(Boolean),
        ...dependencyFindings.map(f => f.recommendation).filter(Boolean)
      ]
    },

    productionReadiness: {
      status: productionStatus,

      summary:
        criticalOrHigh.length > 0
          ? "High-impact findings should be addressed before production use."
          : "No critical or high-severity findings were detected by the current analyzers.",

      blockers: criticalOrHigh.map(f => f.title)
    },

    recommendedFixes: findings
      .filter(f => f.severity !== "info")
      .map(f => ({
        priority: f.severity,
        action:
          f.recommendation || `Review finding ${f.id}.`,
        reason:
          f.evidence || "Analyzer evidence requires review."
      })),

    nextSteps: [
      "Review all findings against the intended project architecture.",
      "Address high-impact findings first.",
      "Run the project's normal test and deployment workflow.",
      "Re-run repos-check after changes."
    ]
  };
}

export async function askAI({ provider, result }) {
  if (!provider || provider === "mock") {
    return {
      provider: "mock",
      content: JSON.stringify(
        buildMockReview(result),
        null,
        2
      )
    };
  }

  throw new Error(
    `AI provider "${provider}" is not implemented yet.`
  );
}
