import { buildReviewPrompt } from "./prompt-builder.js";

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

async function requestOpenRouter(prompt) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model =
    process.env.OPENROUTER_MODEL || "openai/gpt-5";

  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is required when AI_PROVIDER=openrouter."
    );
  }

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a precise software repository reviewer. Return only valid JSON."
          },
          {
            role: "user",
            content: prompt
          }
        ]
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `OpenRouter API error ${response.status}: ${
        data?.error?.message || JSON.stringify(data)
      }`
    );
  }

  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error(
      "OpenRouter returned an empty response."
    );
  }

  return content;
}

async function requestOpenAI(prompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  const model =
    process.env.OPENAI_MODEL || "gpt-5";

  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is required when AI_PROVIDER=openai."
    );
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: prompt
      })
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `OpenAI API error ${response.status}: ${
        data?.error?.message || JSON.stringify(data)
      }`
    );
  }

  const content = data?.output_text;

  if (!content) {
    throw new Error(
      "OpenAI returned an empty response."
    );
  }

  return content;
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

  const prompt = buildReviewPrompt(result);

  if (provider === "openrouter") {
    return {
      provider: "openrouter",
      content: await requestOpenRouter(prompt)
    };
  }

  if (provider === "openai") {
    return {
      provider: "openai",
      content: await requestOpenAI(prompt)
    };
  }

  throw new Error(
    `AI provider "${provider}" is not implemented yet. ` +
    `Supported providers: mock, openrouter, openai.`
  );
}
