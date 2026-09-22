import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function analyzeBuild(root, project, policy) {
  const findings = [];
  const packagePath = path.join(root, "package.json");

  if (!fs.existsSync(packagePath)) {
    return findings;
  }

  let pkg;

  try {
    pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  } catch {
    findings.push({
      severity: "high",
      category: "build",
      title: "Invalid package.json",
      path: "package.json",
      evidence: "package.json could not be parsed as valid JSON.",
      recommendation:
        "Fix package.json syntax before relying on automated builds."
    });

    return findings;
  }

  const scripts = pkg.scripts || {};
  const hasBuild =
    typeof scripts.build === "string" &&
    scripts.build.trim() !== "";

  if (policy.requireBuild && !hasBuild) {
    findings.push({
      severity: "medium",
      category: "build",
      title: "Expected build script is missing",
      path: "package.json",
      evidence:
        "The detected project type or framework normally expects a production build, but package.json does not define one.",
      recommendation:
        "Add a deterministic production build command appropriate for the detected framework."
    });

    return findings;
  }

  if (!hasBuild) {
    findings.push({
      severity: "info",
      category: "build",
      title: "No build script detected",
      path: "package.json",
      evidence:
        "The project does not define a build command, and the current project policy does not require one.",
      recommendation:
        "Keep the project as-is if it executes directly; otherwise define a reproducible build command."
    });

    return findings;
  }

  if (policy.executionAllowed !== true) {
    return findings;
  }

  try {
    const packageManager =
      project.packageManagers?.includes("pnpm")
        ? "pnpm"
        : project.packageManagers?.includes("yarn")
          ? "yarn"
          : project.packageManagers?.includes("bun")
            ? "bun"
            : "npm";

    const command = packageManager;
    const args = ["run", "build"];

    execFileSync(command, args, {
      cwd: root,
      stdio: "pipe",
      timeout: 180000,
      env: {
        ...process.env,
        CI: "1"
      }
    });
  } catch (error) {
    const stdout = error.stdout?.toString?.() || "";
    const stderr = error.stderr?.toString?.() || "";
    const output = `${stdout}\n${stderr}`.trim();

    findings.push({
      severity: "high",
      category: "build",
      title: "Build command failed",
      path: "package.json",
      evidence:
        output.slice(-6000) ||
        "Build command exited with an error.",
      recommendation:
        "Fix the build failure and verify the production build in a clean environment."
    });
  }

  return findings;
}
