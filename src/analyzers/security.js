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

const secretPatterns = [
  /-----BEGIN (RSA|EC|OPENSSH|DSA|PRIVATE) KEY-----/,
  /AKIA[0-9A-Z]{16}/,
  /(?:api[_-]?key|secret|token|password)\s*[:=]\s*["'][^"']{12,}["']/i
];

function scanDirectory(root, current = root, findings = []) {
  let entries;

  try {
    entries = fs.readdirSync(current, { withFileTypes: true });
  } catch {
    return findings;
  }

  for (const entry of entries) {
    if (ignored.has(entry.name)) continue;

    const full = path.join(current, entry.name);

    if (entry.isDirectory()) {
      scanDirectory(root, full, findings);
      continue;
    }

    let content;

    try {
      const stat = fs.statSync(full);

      if (stat.size > 200000) continue;

      content = fs.readFileSync(full, "utf8");
    } catch {
      continue;
    }

    for (const pattern of secretPatterns) {
      if (pattern.test(content)) {
        findings.push({
          severity: "critical",
          category: "security",
          title: "Potential hardcoded secret detected",
          path: path.relative(root, full),
          evidence:
            "A pattern resembling a credential or private key was detected.",
          recommendation:
            "Remove the secret from source control, rotate it if it is real, and use environment or secret-management facilities."
        });

        break;
      }
    }
  }

  return findings;
}

export function analyzeSecurity(root) {
  const findings = [];

  if (
    fs.existsSync(path.join(root, ".env")) &&
    !fs.existsSync(path.join(root, ".gitignore"))
  ) {
    findings.push({
      severity: "high",
      category: "security",
      title: ".env exists without a .gitignore",
      path: ".env",
      evidence:
        ".env exists and no .gitignore was detected.",
      recommendation:
        "Add .env and other local secret files to .gitignore."
    });
  }

  scanDirectory(root, root, findings);

  return findings;
}
