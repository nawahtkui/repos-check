import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  ".next",
  "dist",
  "build",
  "coverage"
]);

const TEXT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".jsonc",
  ".md",
  ".mdx",
  ".txt",
  ".yml",
  ".yaml",
  ".xml",
  ".html",
  ".css",
  ".scss",
  ".sh",
  ".bash",
  ".py",
  ".rb",
  ".go",
  ".java",
  ".sql",
  ".env",
  ".toml",
  ".ini"
]);

const SCRIPT_EXTENSIONS = new Set([
  ".sh",
  ".bash",
  ".mjs",
  ".cjs",
  ".js",
  ".ts",
  ".py"
]);

const LEGACY_NAME_PATTERNS = [
  /\.bak$/i,
  /\.backup$/i,
  /\.old$/i,
  /\.orig$/i,
  /\.tmp$/i,
  /\.temp$/i,
  /(^|[._-])legacy([._-]|$)/i,
  /(^|[._-])deprecated([._-]|$)/i
];

const LEGACY_DIR_NAMES = new Set([
  "archive",
  "_archive",
  "backup",
  "backups",
  "old",
  "legacy",
  "deprecated"
]);

const MAX_TEXT_SIZE = 1_000_000;
const MAX_FILES = 10_000;

function isIgnored(relativePath) {
  const parts = relativePath.split(path.sep);

  return parts.some(part =>
    IGNORED_DIRS.has(part)
  );
}

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(
    path.extname(filePath).toLowerCase()
  );
}

function isScriptFile(filePath) {
  return SCRIPT_EXTENSIONS.has(
    path.extname(filePath).toLowerCase()
  );
}

function walkRepository(root) {
  const files = [];

  function walk(current, relative = "") {
    if (files.length >= MAX_FILES) {
      return;
    }

    let entries;

    try {
      entries = fs.readdirSync(
        current,
        { withFileTypes: true }
      );
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= MAX_FILES) {
        return;
      }

      const nextRelative =
        relative
          ? path.join(relative, entry.name)
          : entry.name;

      if (isIgnored(nextRelative)) {
        continue;
      }

      const fullPath =
        path.join(current, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath, nextRelative);
        continue;
      }

      if (entry.isFile()) {
        files.push({
          absolute: fullPath,
          relative: nextRelative
        });
      }
    }
  }

  walk(root);

  return files;
}

function readText(filePath) {
  try {
    const stat =
      fs.statSync(filePath);

    if (
      !stat.isFile() ||
      stat.size > MAX_TEXT_SIZE
    ) {
      return null;
    }

    if (!isTextFile(filePath)) {
      return null;
    }

    return fs.readFileSync(
      filePath,
      "utf8"
    );
  } catch {
    return null;
  }
}

function hashFile(filePath) {
  try {
    const stat =
      fs.statSync(filePath);

    if (
      !stat.isFile() ||
      stat.size === 0 ||
      stat.size > MAX_TEXT_SIZE
    ) {
      return null;
    }

    const hash =
      crypto.createHash("sha256");

    hash.update(
      fs.readFileSync(filePath)
    );

    return hash.digest("hex");
  } catch {
    return null;
  }
}

function makeFinding({
  id,
  severity = "info",
  category,
  title,
  filePath = ".",
  evidence,
  recommendation,
  confidence = "medium"
}) {
  return {
    id,
    severity,
    category,
    title,
    path: filePath,
    evidence,
    recommendation,
    confidence
  };
}

function analyzeLegacyArtifacts(files) {
  const findings = [];

  for (const file of files) {
    const parts =
      file.relative.split(path.sep);

    const filename =
      parts.at(-1) || "";

    const legacyFile =
      LEGACY_NAME_PATTERNS.some(
        pattern => pattern.test(filename)
      );

    const legacyDirectory =
      parts
        .slice(0, -1)
        .some(part =>
          LEGACY_DIR_NAMES.has(
            part.toLowerCase()
          )
        );

    if (!legacyFile && !legacyDirectory) {
      continue;
    }

    findings.push(
      makeFinding({
        id: "AUD-LEGACY",
        severity: "low",
        category: "legacy-artifact",
        title:
          "Potential legacy, backup, or temporary artifact",
        filePath: file.relative,
        evidence:
          legacyFile
            ? `Filename matches a legacy/backup pattern: ${filename}`
            : "File is located inside a directory named archive/backup/old/legacy/deprecated.",
        recommendation:
          "Verify whether this artifact is still referenced or intentionally retained before removing it.",
        confidence:
          legacyFile
            ? "high"
            : "medium"
      })
    );
  }

  return findings;
}

function analyzeDuplicates(files) {
  const groups = new Map();

  for (const file of files) {
    if (
      file.relative === "reports" ||
      file.relative.startsWith("reports/")
    ) {
      continue;
    }

    const hash =
      hashFile(file.absolute);

    if (!hash) {
      continue;
    }

    if (!groups.has(hash)) {
      groups.set(hash, []);
    }

    groups.get(hash).push(
      file.relative
    );
  }

  const findings = [];

  for (const paths of groups.values()) {
    if (paths.length < 2) {
      continue;
    }

    findings.push(
      makeFinding({
        id: "AUD-DUPLICATE",
        severity: "medium",
        category: "duplicate",
        title:
          "Exact duplicate file content detected",
        filePath: paths.join(", "),
        evidence:
          `The files have identical SHA-256 content: ${paths.join(" | ")}`,
        recommendation:
          "Determine which copy is canonical and whether the other copies are intentionally duplicated before removing anything.",
        confidence: "high"
      })
    );
  }

  return findings;
}

function collectReferences(files) {
  const references = [];

  for (const file of files) {
    const content =
      readText(file.absolute);

    if (!content) {
      continue;
    }

    references.push({
      file,
      content
    });
  }

  return references;
}

function normalizeReference(reference) {
  return reference
    .replace(/^['"`]/, "")
    .replace(/['"`;,)]*$/, "")
    .replace(/\\/g, "/");
}

function resolveLocalReference(
  root,
  sourceFile,
  reference
) {
  let normalized =
    normalizeReference(reference);

  if (!normalized) {
    return null;
  }

  if (
    normalized.startsWith("node:") ||
    normalized.startsWith("@") ||
    /^[a-zA-Z][\w-]*$/.test(normalized)
  ) {
    return null;
  }

  let candidate;

  if (
    normalized.startsWith(".") ||
    normalized.startsWith("/")
  ) {
    candidate =
      normalized.startsWith("/")
        ? path.join(root, normalized)
        : path.resolve(
            path.dirname(sourceFile),
            normalized
          );
  } else {
    return null;
  }

  const candidates = [
    candidate,
    `${candidate}.js`,
    `${candidate}.mjs`,
    `${candidate}.cjs`,
    `${candidate}.ts`,
    `${candidate}.tsx`,
    `${candidate}.jsx`,
    `${candidate}.json`,
    path.join(candidate, "index.js"),
    path.join(candidate, "index.ts")
  ];

  return candidates.find(
    candidatePath => {
      try {
        return fs.statSync(
          candidatePath
        ).isFile();
      } catch {
        return false;
      }
    }
  ) || null;
}

function analyzeBrokenReferences(
  root,
  references
) {
  const findings = [];
  const seen = new Set();

  const importPattern =
    /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'`]([^"'`]+)["'`]/g;

  for (const item of references) {
    let match;

    while (
      (match =
        importPattern.exec(
          item.content
        ))
    ) {
      const reference =
        match[1];

      if (
        !reference.startsWith(".") &&
        !reference.startsWith("/")
      ) {
        continue;
      }

      const resolved =
        resolveLocalReference(
          root,
          item.file.absolute,
          reference
        );

      if (resolved) {
        continue;
      }

      const normalizedReference =
        reference.replace(/\\/g, "/");

      const generatedReport =
        normalizedReference.startsWith("./reports/") ||
        normalizedReference.startsWith("/reports/");

      if (
        generatedReport &&
        (
          item.file.relative.startsWith(".github/") ||
          item.file.relative === "package.json"
        )
      ) {
        continue;
      }

      const key =
        `${item.file.relative}:${reference}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);

      findings.push(
        makeFinding({
          id: "AUD-BROKEN-REF",
          severity: "medium",
          category: "broken-reference",
          title:
            "Potential broken local import/reference",
          filePath:
            item.file.relative,
          evidence:
            `Local reference "${reference}" could not be resolved from this file.`,
          recommendation:
            "Verify whether the referenced file was renamed, deleted, generated, or resolved through a mechanism not visible to static analysis.",
          confidence: "medium"
        })
      );
    }
  }

  return findings;
}

function analyzeScripts(
  root,
  files,
  references
) {
  const findings = [];

  const packagePath =
    path.join(
      root,
      "package.json"
    );

  let packageJson = null;

  try {
    packageJson =
      JSON.parse(
        fs.readFileSync(
          packagePath,
          "utf8"
        )
      );
  } catch {
    packageJson = null;
  }

  const scripts =
    packageJson?.scripts || {};

  for (const [name, command] of Object.entries(scripts)) {
    if (
      typeof command !== "string"
    ) {
      continue;
    }

    const scriptRefs = [
      ...command.matchAll(
        /\b(?:node|tsx|ts-node|python|python3)\s+([^\s;&|]+)/g
      )
    ].map(
      match => match[1]
    );

    for (const ref of scriptRefs) {
      if (
        !ref.includes("/") &&
        !ref.includes("\\")
      ) {
        continue;
      }

      const resolved =
        path.resolve(
          root,
          ref
        );

      if (
        fs.existsSync(resolved)
      ) {
        continue;
      }

      findings.push(
        makeFinding({
          id: "AUD-BROKEN-SCRIPT",
          severity: "medium",
          category: "script-cleanup",
          title:
            "Package script references a missing file",
          filePath:
            "package.json",
          evidence:
            `Script "${name}" references "${ref}", but the target does not exist.`,
          recommendation:
            "Update the script or restore the intended target after verifying whether it was intentionally removed.",
          confidence: "high"
        })
      );
    }
  }

  const scriptFiles =
    files.filter(
      file => isScriptFile(file.absolute)
    );

  for (const file of scriptFiles) {
    const base =
      path.basename(file.relative);

    const legacy =
      /backup|restore|legacy|old|archive|cleanup/i.test(
        base
      );

    if (!legacy) {
      continue;
    }

    const referenced =
      references.some(
        item =>
          item.content.includes(
            file.relative
          )
      );

    findings.push(
      makeFinding({
        id: "AUD-SCRIPT-LEGACY",
        severity:
          referenced
            ? "low"
            : "medium",
        category: "script-cleanup",
        title:
          "Potential legacy or maintenance script",
        filePath:
          file.relative,
        evidence:
          referenced
            ? "The script has a legacy-looking name and is referenced elsewhere."
            : "The script has a legacy-looking name and no textual reference was found.",
        recommendation:
          referenced
            ? "Review its callers before changing or removing it."
            : "Verify whether the script is obsolete before removing it.",
        confidence:
          referenced
            ? "medium"
            : "low"
      })
    );
  }

  return findings;
}

function analyzeGeneratedArtifacts(files) {
  const findings = [];

  const generatedPattern =
    /(\.min\.js|\.min\.css|\.map|\.generated\.[^.]+|\.gen\.[^.]+)$/i;

  for (const file of files) {
    if (
      !generatedPattern.test(
        file.relative
      )
    ) {
      continue;
    }

    findings.push(
      makeFinding({
        id: "AUD-GENERATED",
        severity: "info",
        category: "generated-artifact",
        title:
          "Generated-looking artifact detected",
        filePath:
          file.relative,
        evidence:
          "Filename matches a common generated/minified/source-map pattern.",
        recommendation:
          "Check whether the artifact is intentionally committed or should be generated during build/deployment.",
        confidence: "medium"
      })
    );
  }

  return findings;
}

function analyzeMogabArtifacts(
  files,
  references
) {
  const findings = [];

  for (const file of files) {
    if (
      !/mogab/i.test(
        file.relative
      )
    ) {
      continue;
    }

    findings.push(
      makeFinding({
        id: "AUD-MOGAB",
        severity: "info",
        category: "legacy-mogab",
        title:
          "MOGAB-related repository artifact detected",
        filePath:
          file.relative,
        evidence:
          `Path contains MOGAB-related naming: ${file.relative}`,
        recommendation:
          "Verify whether this is an active integration or a legacy embedded MOGAB implementation. Compare it with the current standalone MOGAB architecture before removing it.",
        confidence: "medium"
      })
    );
  }

  for (const item of references) {
    if (
      item.file.relative ===
      "src/analyzers/repository-audit.js" ||
      item.file.relative.startsWith("reports/")
    ) {
      continue;
    }

    if (
      !/\bmogab(?:-builder)?\b/i.test(
        item.content
      )
    ) {
      continue;
    }

    findings.push(
      makeFinding({
        id: "AUD-MOGAB-REF",
        severity: "info",
        category: "legacy-mogab",
        title:
          "MOGAB reference detected",
        filePath:
          item.file.relative,
        evidence:
          "Text contains a MOGAB or MOGAB Builder reference.",
        recommendation:
          "Classify the reference as active integration, documentation, deployment dependency, or legacy architecture before changing it.",
        confidence: "low"
      })
    );
  }

  return findings;
}

function analyzeDashboardArtifacts(
  files,
  references
) {
  const findings = [];

  for (const file of files) {
    const lower =
      file.relative.toLowerCase();

    const strong =
      lower.includes(
        "public/dashboard"
      ) ||
      lower.endsWith(
        "dashboard.html"
      );

    if (!strong) {
      continue;
    }

    findings.push(
      makeFinding({
        id: "AUD-DASHBOARD",
        severity: "medium",
        category: "legacy-dashboard-ui",
        title:
          "Legacy-looking dashboard UI artifact detected",
        filePath:
          file.relative,
        evidence:
          "Path matches a strong dashboard UI pattern.",
        recommendation:
          "Verify whether this UI is still part of the intended architecture or is a duplicate/legacy frontend before removing it.",
        confidence: "high"
      })
    );
  }

  return findings;
}

export function analyzeRepositoryAudit(root) {
  const files =
    walkRepository(root);

  const references =
    collectReferences(files);

  return [
    ...analyzeLegacyArtifacts(files),
    ...analyzeDuplicates(files),
    ...analyzeBrokenReferences(
      root,
      references
    ),
    ...analyzeScripts(
      root,
      files,
      references
    ),
    ...analyzeGeneratedArtifacts(files),
    ...analyzeMogabArtifacts(
      files,
      references
    ),
    ...analyzeDashboardArtifacts(
      files,
      references
    )
  ];
}
