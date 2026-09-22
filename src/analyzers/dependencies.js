import fs from "node:fs";
import path from "node:path";

export function analyzeDependencies(root) {
  const findings = [];
  const packagePath = path.join(root, "package.json");

  if (!fs.existsSync(packagePath)) {
    return findings;
  }

  let pkg;

  try {
    pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } catch {
    return findings;
  }

  const dependencies = pkg.dependencies || {};
  const devDependencies = pkg.devDependencies || {};

  const all = {
    ...dependencies,
    ...devDependencies
  };

  const dependencyCount = Object.keys(all).length;

  if (dependencyCount === 0) {
    findings.push({
      severity: "info",
      category: "dependencies",
      title: "No npm dependencies detected",
      path: "package.json",
      evidence: "No dependencies or devDependencies were found.",
      recommendation:
        "Confirm that this is intentional for the project."
    });
  }

  const lockfiles = [
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb"
  ].filter(file =>
    fs.existsSync(path.join(root, file))
  );

  if (lockfiles.length > 1) {
    findings.push({
      severity: "medium",
      category: "dependencies",
      title: "Multiple package manager lockfiles detected",
      path: ".",
      evidence: lockfiles.join(", "),
      recommendation:
        "Choose one package manager and keep only its canonical lockfile unless multiple lockfiles are explicitly required."
    });
  }

  if (
    fs.existsSync(path.join(root, "package-lock.json")) &&
    !fs.existsSync(path.join(root, "node_modules"))
  ) {
    findings.push({
      severity: "info",
      category: "dependencies",
      title: "Dependencies are not currently installed",
      path: "node_modules",
      evidence:
        "package-lock.json exists but node_modules is absent.",
      recommendation:
        "Run npm ci before build/test analysis."
    });
  }

  return findings;
}
