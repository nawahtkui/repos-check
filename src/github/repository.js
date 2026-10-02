import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Octokit } from "@octokit/rest";

function parseRepositoryInput(input) {
  const value = String(input || "").trim();

  if (!value) {
    throw new Error(
      "GitHub repository is required. Example: nawahtkui/repos-check"
    );
  }

  const cleaned = value
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\/+$/, "");

  const parts = cleaned.split("/").filter(Boolean);

  if (parts.length !== 2) {
    throw new Error(
      "GitHub repository must use owner/repository format."
    );
  }

  return {
    owner: parts[0],
    repo: parts[1]
  };
}

function shouldSkipPath(filePath) {
  const normalized = filePath.replaceAll("\\", "/");
  const lower = normalized.toLowerCase();

  if (
    normalized.startsWith(".git/") ||
    normalized.includes("/node_modules/") ||
    normalized.includes("/.next/") ||
    normalized.includes("/dist/") ||
    normalized.includes("/build/") ||
    normalized.includes("/coverage/")
  ) {
    return true;
  }

  const binaryExtensions = [
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".webp",
    ".ico",
    ".pdf",
    ".zip",
    ".tar",
    ".gz",
    ".mp3",
    ".mp4",
    ".mov",
    ".avi",
    ".woff",
    ".woff2",
    ".ttf",
    ".otf",
    ".eot",
    ".exe",
    ".dll",
    ".so",
    ".bin"
  ];

  return binaryExtensions.some(ext =>
    lower.endsWith(ext)
  );
}

function isPriorityFile(filePath) {
  const normalized =
    filePath.replaceAll("\\", "/");

  const base =
    path.basename(normalized).toLowerCase();

  const priorityNames = new Set([
    "package.json",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "bun.lock",
    "bun.lockb",
    "requirements.txt",
    "pyproject.toml",
    "setup.py",
    "cargo.toml",
    "go.mod",
    "dockerfile",
    "readme.md",
    ".env.example",
    "tsconfig.json",
    "jsconfig.json",
    "next.config.js",
    "next.config.mjs",
    "next.config.ts",
    "vite.config.js",
    "vite.config.ts",
    "nuxt.config.js",
    "nuxt.config.ts",
    "nest-cli.json",
    "hardhat.config.js",
    "hardhat.config.ts"
  ]);

  if (priorityNames.has(base)) {
    return true;
  }

  return (
    normalized.startsWith(".github/workflows/") ||
    normalized.startsWith(".github/actions/")
  );
}

function safeWriteFile(root, relativePath, content) {
  const normalized =
    path.normalize(relativePath);

  const destination =
    path.resolve(root, normalized);

  const rootResolved =
    path.resolve(root);

  if (
    destination !== rootResolved &&
    !destination.startsWith(
      `${rootResolved}${path.sep}`
    )
  ) {
    throw new Error(
      `Unsafe repository path: ${relativePath}`
    );
  }

  fs.mkdirSync(
    path.dirname(destination),
    { recursive: true }
  );

  fs.writeFileSync(
    destination,
    content
  );
}

export async function downloadGitHubRepository(
  input,
  options = {}
) {
  const { owner, repo } =
    parseRepositoryInput(input);

  const token =
    options.token ||
    process.env.GITHUB_TOKEN ||
    undefined;

  const maxFiles = Number(
    options.maxFiles ||
    process.env.REVIEW_MAX_FILES ||
    200
  );

  const maxFileSize = Number(
    options.maxFileSize ||
    process.env.REVIEW_MAX_FILE_SIZE ||
    200000
  );

  const octokit = new Octokit(
    token
      ? { auth: token }
      : {}
  );

  const repositoryResponse =
    await octokit.rest.repos.get({
      owner,
      repo
    });

  const repository =
    repositoryResponse.data;

  const defaultBranch =
    repository.default_branch || "main";

  const branchResponse =
    await octokit.rest.repos.getBranch({
      owner,
      repo,
      branch: defaultBranch
    });

  const treeSha =
    branchResponse.data.commit.sha;

  const treeResponse =
    await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
      recursive: "1"
    });

  const tree =
    treeResponse.data;

  if (tree.truncated) {
    throw new Error(
      "GitHub returned a truncated repository tree. " +
      "The repository is too large for this initial review mode."
    );
  }

  const allFiles =
    tree.tree
      .filter(item => item.type === "blob")
      .filter(item => !shouldSkipPath(item.path));

  const priorityFiles =
    allFiles.filter(item =>
      isPriorityFile(item.path)
    );

  const normalFiles =
    allFiles.filter(
      item => !isPriorityFile(item.path)
    );

  const selected = [];
  const selectedPaths = new Set();

  function addFile(file) {
    if (
      selected.length >= maxFiles ||
      selectedPaths.has(file.path)
    ) {
      return;
    }

    if (
      typeof file.size === "number" &&
      file.size > maxFileSize
    ) {
      return;
    }

    selected.push(file);
    selectedPaths.add(file.path);
  }

  for (const file of priorityFiles) {
    addFile(file);
  }

  for (const file of normalFiles) {
    addFile(file);
  }

  if (selected.length === 0) {
    throw new Error(
      "No reviewable source files were found in the repository."
    );
  }

  const tempRoot =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "repos-check-github-"
      )
    );

  const skippedLargeFiles =
    allFiles.filter(
      item =>
        typeof item.size === "number" &&
        item.size > maxFileSize
    ).length;

  for (const file of selected) {
    const blobResponse =
      await octokit.rest.git.getBlob({
        owner,
        repo,
        file_sha: file.sha
      });

    const blob =
      blobResponse.data;

    if (blob.encoding !== "base64") {
      continue;
    }

    const content =
      Buffer.from(
        blob.content.replace(/\n/g, ""),
        "base64"
      );

    if (content.includes(0)) {
      continue;
    }

    safeWriteFile(
      tempRoot,
      file.path,
      content.toString("utf8")
    );
  }

  return {
    root: tempRoot,
    owner,
    repo,
    branch: defaultBranch,
    sha: treeSha,
    url: repository.html_url,
    defaultBranch,
    totalTreeEntries: tree.tree.length,
    totalFiles: allFiles.length,
    priorityFiles: priorityFiles.length,
    downloadedFiles: selected.length,
    skippedLargeFiles,

    downloadedPaths:
      selected.map(file => file.path),

    cleanup() {
      fs.rmSync(
        tempRoot,
        {
          recursive: true,
          force: true
        }
      );
    }
  };
}
