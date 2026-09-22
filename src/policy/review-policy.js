export function getReviewPolicy(project) {
  const languages = project?.languages || [];
  const frameworks = project?.frameworks || [];
  const types = project?.projectType || [];
  const packageManagers = project?.packageManagers || [];

  const isNode = languages.includes("JavaScript/TypeScript");
  const isPython = languages.includes("Python");
  const isNext = frameworks.includes("Next.js");
  const isReact = frameworks.includes("React");
  const isExpress = frameworks.includes("Express");
  const isVue = frameworks.includes("Vue");
  const isNest = frameworks.includes("NestJS");
  const isMonorepo = types.includes("Monorepo");
  const isLibrary = types.includes("Library");
  const isCli = types.includes("CLI");

  const policy = {
    requireBuild: false,
    requireTests: false,
    requireLint: false,
    requireReadme: true,
    allowMissingLockfile: false,
    executionAllowed: true,
    notes: []
  };

  /*
   * Framework/application rules
   */
  if (isNext || isReact || isVue || isNest) {
    policy.requireBuild = true;
    policy.requireTests = true;
  }

  if (isNext) {
    policy.notes.push("Next.js applications should provide a production build.");
  }

  if (isNest) {
    policy.requireBuild = true;
    policy.notes.push("NestJS applications normally require a compiled production build.");
  }

  if (isExpress) {
    policy.notes.push(
      "Express applications may run directly from JavaScript and do not universally require a build script."
    );
  }

  /*
   * Python rules
   */
  if (isPython) {
    policy.requireTests = true;
    policy.notes.push(
      "Python projects should expose an appropriate test strategy when production readiness is evaluated."
    );
  }

  /*
   * Libraries
   */
  if (isLibrary) {
    policy.requireTests = true;

    if (isNode) {
      policy.requireBuild = true;
    }

    policy.notes.push(
      "Libraries should provide reproducible test and package/build workflows."
    );
  }

  /*
   * CLI applications
   */
  if (isCli) {
    policy.requireBuild = false;
    policy.notes.push(
      "CLI projects do not automatically require a build script when they execute directly."
    );
  }

  /*
   * Monorepos
   */
  if (isMonorepo) {
    policy.notes.push(
      "Monorepo validation should inspect workspace/package-level scripts instead of assuming root-level build commands."
    );
  }

  /*
   * Lockfile expectations
   */
  if (packageManagers.length > 1) {
    policy.allowMissingLockfile = false;
  }

  return policy;
}
