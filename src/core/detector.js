import fs from "node:fs";
import path from "node:path";

const exists = (root, file) =>
  fs.existsSync(path.join(root, file));

export function detectProject(root) {
  const result = {
    languages: [],
    frameworks: [],
    projectType: [],
    packageManagers: [],
    hasGitHubActions: false,
    hasDocker: false,
    hasReadme: false,
    hasEnvExample: false,
    packageFiles: [],
    buildScripts: [],
    testScripts: [],
    lintScripts: []
  };

  if (exists(root, "package.json")) {
    result.languages.push("JavaScript/TypeScript");
    result.packageFiles.push("package.json");

    try {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(root, "package.json"), "utf8")
      );

      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {})
      };

      if (deps.next) {
        result.frameworks.push("Next.js");
      }

      if (deps.react) {
        result.frameworks.push("React");
      }

      if (deps.express) {
        result.frameworks.push("Express");
      }

      if (deps.vue) {
        result.frameworks.push("Vue");
      }

      if (deps["@nestjs/core"]) {
        result.frameworks.push("NestJS");
      }

      const scripts = pkg.scripts || {};

      if (scripts.build) result.buildScripts.push("build");
      if (scripts.test) result.testScripts.push("test");
      if (scripts.lint) result.lintScripts.push("lint");

      if (exists(root, "pnpm-lock.yaml")) {
        result.packageManagers.push("pnpm");
      }

      if (exists(root, "yarn.lock")) {
        result.packageManagers.push("yarn");
      }

      if (exists(root, "package-lock.json")) {
        result.packageManagers.push("npm");
      }

      if (exists(root, "bun.lockb") || exists(root, "bun.lock")) {
        result.packageManagers.push("bun");
      }
    } catch {
      result.projectType.push("Invalid package.json");
    }
  }

  if (
    exists(root, "requirements.txt") ||
    exists(root, "pyproject.toml") ||
    exists(root, "setup.py")
  ) {
    result.languages.push("Python");
    result.packageFiles.push(
      ...["requirements.txt", "pyproject.toml", "setup.py"]
        .filter(file => exists(root, file))
    );
  }

  if (
    exists(root, "hardhat.config.js") ||
    exists(root, "hardhat.config.ts")
  ) {
    result.languages.push("Solidity");
    result.frameworks.push("Hardhat");
  }

  if (
    exists(root, "go.mod")
  ) {
    result.languages.push("Go");
    result.packageFiles.push("go.mod");
  }

  if (
    exists(root, "Cargo.toml")
  ) {
    result.languages.push("Rust");
    result.packageFiles.push("Cargo.toml");
  }

  if (exists(root, ".github/workflows")) {
    result.hasGitHubActions = true;
  }

  if (
    exists(root, "Dockerfile") ||
    exists(root, "docker-compose.yml") ||
    exists(root, "docker-compose.yaml")
  ) {
    result.hasDocker = true;
  }

  result.hasReadme =
    exists(root, "README.md") ||
    exists(root, "README");

  result.hasEnvExample =
    exists(root, ".env.example") ||
    exists(root, ".env.sample");

  if (
    exists(root, "src") ||
    exists(root, "app")
  ) {
    result.projectType.push("Application");
  }

  if (
    exists(root, "apps") ||
    exists(root, "packages")
  ) {
    result.projectType.push("Monorepo / Multi-package");
  }

  if (result.languages.length === 0) {
    result.languages.push("Unknown");
  }

  return result;
}
