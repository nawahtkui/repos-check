import "dotenv/config";
import path from "node:path";
import fs from "node:fs";

import { detectProject } from "./src/core/detector.js";
import { getReviewPolicy } from "./src/policy/review-policy.js";
import { analyzeStructure } from "./src/analyzers/structure.js";
import { analyzeBuild } from "./src/analyzers/build.js";
import { analyzeDependencies } from "./src/analyzers/dependencies.js";
import { analyzeSecurity } from "./src/analyzers/security.js";
import { normalizeFindings } from "./src/core/findings.js";
import { reviewWithAI } from "./src/ai/reviewer.js";

function printUsage() {
  console.log(`
Repos Check — AI Repository Review Bot

Usage:

  node app.js repo .
  node app.js review .
  npm run review:repo -- /path/to/project
  npm run review:all

Commands:

  repo <path>     Review one repository
  review <path>   Review one repository
  all             Review repositories configured for batch analysis
`);
}

function buildSummary(findings) {
  return {
    total: findings.length,
    critical: findings.filter(f => f.severity === "critical").length,
    high: findings.filter(f => f.severity === "high").length,
    medium: findings.filter(f => f.severity === "medium").length,
    low: findings.filter(f => f.severity === "low").length,
    info: findings.filter(f => f.severity === "info").length
  };
}

function printFindings(findings) {
  console.log();
  console.log("===== FINDINGS =====");

  if (findings.length === 0) {
    console.log("No findings detected.");
    return;
  }

  for (const finding of findings) {
    console.log(
      `[${finding.severity.toUpperCase()}] ${finding.title}`
    );

    console.log(`  Category: ${finding.category}`);
    console.log(`  Path: ${finding.path}`);

    if (finding.evidence) {
      console.log(`  Evidence: ${finding.evidence.slice(0, 300)}`);
    }

    if (finding.recommendation) {
      console.log(
        `  Recommendation: ${finding.recommendation.slice(0, 300)}`
      );
    }

    console.log();
  }
}

async function reviewRepository(root) {
  const absoluteRoot = path.resolve(root);

  if (!fs.existsSync(absoluteRoot)) {
    throw new Error(`Repository path does not exist: ${absoluteRoot}`);
  }

  console.log("========================================");
  console.log(" REPOS CHECK — REPOSITORY REVIEW");
  console.log("========================================");
  console.log(`Repository: ${absoluteRoot}`);
  console.log();

  const project = detectProject(absoluteRoot);
  const policy = getReviewPolicy(project);

  console.log("PROJECT");
  console.log(`Languages: ${project.languages.join(", ") || "None"}`);
  console.log(`Frameworks: ${project.frameworks.join(", ") || "None"}`);
  console.log(
    `Type: ${project.projectType.join(", ") || "Unknown"}`
  );
  console.log(
    `Package managers: ${
      project.packageManagers.join(", ") || "None"
    }`
  );
  console.log(
    `GitHub Actions: ${project.hasGitHubActions ? "Yes" : "No"}`
  );
  console.log(
    `Docker: ${project.hasDocker ? "Yes" : "No"}`
  );
  console.log(
    `README: ${project.hasReadme ? "Yes" : "No"}`
  );
  console.log(
    `.env.example: ${project.hasEnvExample ? "Yes" : "No"}`
  );

  console.log();
  console.log("REVIEW POLICY");
  console.log(
    `Build required: ${policy.requireBuild ? "Yes" : "No"}`
  );
  console.log(
    `Tests required: ${policy.requireTests ? "Yes" : "No"}`
  );
  console.log(
    `Lint required: ${policy.requireLint ? "Yes" : "No"}`
  );
  console.log(
    `Execution allowed: ${policy.executionAllowed ? "Yes" : "No"}`
  );

  if (policy.notes.length > 0) {
    console.log("Policy notes:");

    for (const note of policy.notes) {
      console.log(`- ${note}`);
    }
  }

  console.log();
  console.log("Running analyzers...");

  const rawFindings = [
    ...analyzeStructure(absoluteRoot),
    ...analyzeBuild(
      absoluteRoot,
      project,
      policy
    ),
    ...analyzeDependencies(absoluteRoot),
    ...analyzeSecurity(absoluteRoot)
  ];

  const findings = normalizeFindings(rawFindings);
  const summary = buildSummary(findings);

  const result = {
    tool: "repos-check",
    version: "1.0.0",
    generatedAt: new Date().toISOString(),
    repository: absoluteRoot,
    project,
    policy,
    summary,
    findings
  };

  fs.mkdirSync(path.join(absoluteRoot, "reports"), {
    recursive: true
  });

  const reportPath = path.join(
    absoluteRoot,
    "reports",
    "review.json"
  );

  fs.writeFileSync(
    reportPath,
    JSON.stringify(result, null, 2)
  );

  console.log();
  console.log("===== SUMMARY =====");
  console.log(`Total findings: ${summary.total}`);
  console.log(`Critical: ${summary.critical}`);
  console.log(`High: ${summary.high}`);
  console.log(`Medium: ${summary.medium}`);
  console.log(`Low: ${summary.low}`);
  console.log(`Info: ${summary.info}`);

  printFindings(findings);

  console.log(`JSON report: ${reportPath}`);

  console.log();
  console.log("Running AI reviewer...");

  const ai = await reviewWithAI(result);

  result.ai = ai;

  fs.writeFileSync(
    reportPath,
    JSON.stringify(result, null, 2)
  );

  const aiReportPath = path.join(
    absoluteRoot,
    "reports",
    "ai-review.md"
  );

  const review = ai.review || {};

  const markdown = [
    "# AI Repository Review",
    "",
    `Provider: ${ai.provider}`,
    "",
    "## Executive Summary",
    "",
    review.executiveSummary || "Not provided.",
    "",
    "## Architecture Assessment",
    "",
    review.architectureAssessment || "Not provided.",
    "",
    "## Main Issues",
    ""
  ];

  if (review.mainIssues?.length) {
    for (const issue of review.mainIssues) {
      markdown.push(
        `### [${String(issue.severity || "info").toUpperCase()}] ${issue.title || "Untitled issue"}`,
        "",
        `**Finding:** ${issue.findingId || "N/A"}`,
        "",
        issue.explanation || "No explanation provided.",
        "",
        `**Recommendation:** ${issue.recommendation || "Review this finding."}`,
        ""
      );
    }
  } else {
    markdown.push("No main issues detected.", "");
  }

  markdown.push(
    "## Security Assessment",
    "",
    `**Status:** ${review.securityAssessment?.status || "unknown"}`,
    "",
    review.securityAssessment?.summary || "Not provided.",
    ""
  );

  if (review.securityAssessment?.items?.length) {
    for (const item of review.securityAssessment.items) {
      markdown.push(
        `- **${String(item.severity || "info").toUpperCase()}** ${item.title || "Security item"}: ${item.explanation || "No explanation provided."}`,
        `  - Recommendation: ${item.recommendation || "Review this item."}`,
        ""
      );
    }
  }

  markdown.push(
    "## Build & Dependencies",
    "",
    review.buildAndDependencies?.summary || "Not provided.",
    "",
    `- Build status: ${review.buildAndDependencies?.buildStatus || "unknown"}`,
    `- Dependency status: ${review.buildAndDependencies?.dependencyStatus || "unknown"}`,
    ""
  );

  if (review.buildAndDependencies?.recommendations?.length) {
    for (const recommendation of review.buildAndDependencies.recommendations) {
      markdown.push(`- ${recommendation}`);
    }
    markdown.push("");
  }

  markdown.push(
    "## Production Readiness",
    "",
    `**Status:** ${review.productionReadiness?.status || "not-assessed"}`,
    "",
    review.productionReadiness?.summary || "Not provided.",
    ""
  );

  if (review.productionReadiness?.blockers?.length) {
    markdown.push("### Blockers", "");

    for (const blocker of review.productionReadiness.blockers) {
      markdown.push(`- ${blocker}`);
    }

    markdown.push("");
  }

  markdown.push(
    "## Recommended Fixes",
    ""
  );

  if (review.recommendedFixes?.length) {
    for (const fix of review.recommendedFixes) {
      markdown.push(
        `### ${String(fix.priority || "medium").toUpperCase()}`,
        "",
        `**Action:** ${fix.action || "Review this finding."}`,
        "",
        `**Reason:** ${fix.reason || "No reason provided."}`,
        ""
      );
    }
  } else {
    markdown.push("No corrective actions were generated.", "");
  }

  markdown.push(
    "## Next Steps",
    ""
  );

  if (review.nextSteps?.length) {
    for (const step of review.nextSteps) {
      markdown.push(`- ${step}`);
    }
  } else {
    markdown.push("No additional steps provided.");
  }

  markdown.push("");

  fs.writeFileSync(
    aiReportPath,
    markdown.join("\n")
  );

  console.log(`AI provider: ${ai.provider}`);
  console.log(`AI report: ${aiReportPath}`);

  return result;
}

const command = process.argv[2];

try {
  if (command === "repo" || command === "review") {
    await reviewRepository(process.argv[3] || ".");
  } else if (command === "all") {
    console.log("Batch repository review is not implemented yet.");
    console.log("Use: npm run review:repo -- .");
  } else {
    printUsage();
  }
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
