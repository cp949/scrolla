import { existsSync, readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import semver from "semver";

const rootDirectory = process.cwd();
// vitest(^22.12 || ^24 || >=26)와 jsdom(^22.22.2 || ^24.15.0 || >=26)의 engines 교집합이다.
const supportedNodeRange = "^22.22.2 || ^24.15.0 || >=26.0.0";
const toolingPackages = new Set([
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "acorn",
  "autoprefixer",
  "esbuild",
  "jsdom",
  "oxfmt",
  "oxlint",
  "oxlint-tsgolint",
  "postcss",
  "sass",
  "semver",
  "turbo",
  "typescript",
  "vite",
  "vitest",
]);

// oxlint, oxfmt로 대체했으므로 다시 추가되면 실패시킨다.
const forbiddenPackages = new Set(["@biomejs/biome", "eslint", "prettier"]);

const runtimePackages = new Set(["next", "react", "react-dom"]);

const diagnostics = [];

function report(message) {
  diagnostics.push(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function workspaceManifestPaths() {
  const paths = [join(rootDirectory, "package.json")];

  for (const directory of ["apps", "packages"]) {
    const parent = join(rootDirectory, directory);
    if (!existsSync(parent)) {
      continue;
    }

    for (const entry of readdirSync(parent, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }

      const manifestPath = join(parent, entry.name, "package.json");
      if (existsSync(manifestPath)) {
        paths.push(manifestPath);
      }
    }
  }

  return paths;
}

function dependenciesOf(manifest) {
  return Object.entries({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.optionalDependencies,
  });
}

function installedPackageManifest(manifestPath, packageName) {
  const directPackagePath = join(dirname(manifestPath), "node_modules", packageName, "package.json");
  if (existsSync(directPackagePath)) {
    return readJson(directPackagePath);
  }

  const requireFromManifest = createRequire(manifestPath);
  const entryPath = requireFromManifest.resolve(packageName);
  let packageDirectory = dirname(entryPath);

  while (packageDirectory !== dirname(packageDirectory)) {
    const packagePath = join(packageDirectory, "package.json");
    if (existsSync(packagePath)) {
      const packageManifest = readJson(packagePath);
      if (packageManifest.name === packageName) {
        return packageManifest;
      }
    }
    packageDirectory = dirname(packageDirectory);
  }

  throw new Error("package.json을 찾을 수 없습니다.");
}

const manifestPaths = workspaceManifestPaths();

if (manifestPaths.length === 0) {
  report("manifest를 찾지 못했습니다.");
}

let toolingDependencyCount = 0;

for (const manifestPath of manifestPaths) {
  const manifest = readJson(manifestPath);
  const label = relative(rootDirectory, manifestPath) || "package.json";

  if (manifestPath === join(rootDirectory, "package.json")) {
    if (manifest.engines?.node !== supportedNodeRange) {
      report(`${label}: engines.node는 ${supportedNodeRange}이어야 합니다 (현재: ${manifest.engines?.node ?? "없음"}).`);
    }
  }

  for (const [packageName, version] of dependenciesOf(manifest)) {
    if (packageName === "typescript") {
      if (version.startsWith("npm:")) {
        report(`${label}: TypeScript npm alias는 허용되지 않습니다 (${version}).`);
      } else if (version !== "6.0.3") {
        report(`${label}: TypeScript는 정확히 6.0.3이어야 합니다 (현재: ${version}).`);
      }
    }

    // 1.64.0부터 Playwright injected script가 Element.checkVisibility()를 가드 없이 호출해
    // Chrome 83(chrome83-floor e2e)에서 toBeVisible()이 실패한다. 1.63.0이 마지막 호환 버전이다.
    if (
      packageName === "@playwright/test" &&
      semver.valid(version) &&
      semver.gt(version, "1.63.0")
    ) {
      report(`${label}: @playwright/test는 1.63.0 이하여야 합니다 (현재: ${version}). Chrome 83에서 checkVisibility 오류가 발생합니다.`);
    }

    if (forbiddenPackages.has(packageName) || packageName.startsWith("eslint-")) {
      report(`${label}: ${packageName}은 허용되지 않습니다. oxlint, oxfmt를 사용하세요.`);
    }

    if (runtimePackages.has(packageName) || !toolingPackages.has(packageName)) {
      continue;
    }

    toolingDependencyCount += 1;

    if (version !== "workspace:*" && !semver.valid(version)) {
      report(`${label}: tooling dependency ${packageName}는 exact version이어야 합니다 (현재: ${version}).`);
    }

    if (semver.valid(version)) {
      try {
        const installed = installedPackageManifest(manifestPath, packageName);
        const nodeRange = installed.engines?.node;
        if (nodeRange && !semver.subset(supportedNodeRange, nodeRange)) {
          report(`${label}: ${packageName}@${installed.version}의 engines.node ${nodeRange}는 지원 범위 ${supportedNodeRange}를 모두 허용하지 않습니다.`);
        }
      } catch (error) {
        report(`${label}: ${packageName}의 설치된 package.json을 읽을 수 없습니다 (${error.message}).`);
      }
    }
  }
}

if (toolingDependencyCount === 0) {
  report("tooling dependency를 찾지 못했습니다.");
}

if (diagnostics.length > 0) {
  for (const diagnostic of diagnostics) {
    console.error(`audit-tooling: ${diagnostic}`);
  }
  process.exitCode = 1;
} else {
  console.log(`audit-tooling: ${manifestPaths.length}개 manifest와 ${toolingDependencyCount}개 tooling dependency를 확인했습니다.`);
}
