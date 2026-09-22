import fs from "node:fs";
import path from "node:path";

const ignored = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage"
]);

const suspiciousNames = [
  "_archive",
  "archive",
  "backup",
  "backups",
  "old",
  "deprecated",
  "tmp",
  "temp"
];

function walk(root, current = root, results = []) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;

    const full = path.join(current, entry.name);

    if (entry.isDirectory()) {
      results.push(path.relative(root, full));
      walk(root, full, results);
    }
  }

  return results;
}

export function analyzeStructure(root) {
  const findings = [];
  const directories = walk(root);

  for (const directory of directories) {
    const lower = directory.toLowerCase();

    if (
      suspiciousNames.some(name =>
        lower.split(path.sep).includes(name)
      )
    ) {
      findings.push({
        severity: "low",
        category: "structure",
        title: "Archive or temporary directory detected",
        path: directory,
        evidence: directory,
        recommendation:
          "Review whether this directory is required in the active repository."
      });
    }
  }

  const rootEntries = fs.readdirSync(root);

  if (
    !rootEntries.includes("README.md") &&
    !rootEntries.includes("README")
  ) {
    findings.push({
      severity: "medium",
      category: "documentation",
      title: "README file is missing",
      path: ".",
      evidence: "No README.md or README found at repository root.",
      recommendation:
        "Add a README describing the project, setup, development and deployment."
    });
  }

  if (
    rootEntries.includes("package.json") &&
    !rootEntries.includes("package-lock.json") &&
    !rootEntries.includes("pnpm-lock.yaml") &&
    !rootEntries.includes("yarn.lock") &&
    !rootEntries.includes("bun.lock") &&
    !rootEntries.includes("bun.lockb")
  ) {
    findings.push({
      severity: "medium",
      category: "dependencies",
      title: "JavaScript package lockfile is missing",
      path: "package.json",
      evidence: "package.json exists but no recognized lockfile was found.",
      recommendation:
        "Commit the lockfile used by the project to improve reproducibility."
    });
  }

  return findings;
}
