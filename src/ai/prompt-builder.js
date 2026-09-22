export function buildReviewPrompt(result) {
  return `
You are an expert software repository reviewer.

Analyze the repository information below.

Your responsibilities:
- explain the project architecture
- identify important technical risks
- interpret static-analysis findings
- distinguish real problems from intentional design choices
- suggest practical fixes
- avoid inventing files, dependencies, vulnerabilities or runtime behavior
- prioritize findings by impact
- clearly state uncertainty when evidence is insufficient

Repository:
${result.repository}

Project detection:
${JSON.stringify(result.project, null, 2)}

Static findings:
${JSON.stringify(result.findings, null, 2)}

Return a concise engineering review containing:
1. Executive summary
2. Architecture assessment
3. Important issues
4. Security considerations
5. Build and dependency considerations
6. Recommended next steps
`;
}
