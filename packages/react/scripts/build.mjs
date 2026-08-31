import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";
import autoprefixer from "autoprefixer";
import postcss from "postcss";
import { compile } from "sass";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(packageDirectory, "src");
const distDirectory = resolve(packageDirectory, "dist");
const stylesPath = resolve(sourceDirectory, "styles.scss");
const cssPath = resolve(distDirectory, "styles.css");
const cssMapPath = resolve(distDirectory, "styles.css.map");
const jsPath = resolve(distDirectory, "index.js");
const jsMapPath = resolve(distDirectory, "index.js.map");
const tsconfigPath = resolve(packageDirectory, "tsconfig.json");
const dtsBundleGeneratorPath = resolve(
  packageDirectory,
  "node_modules/dts-bundle-generator/dist/bin/dts-bundle-generator.js",
);

// dist/core/*.d.ts로 private core 선언이 물리적으로 노출되는 것을 막기 위해 tsc의
// per-file 선언 emit 대신 단일 dist/index.d.ts로 번들링한다. package-audit.mjs의
// CORE_PATH_SEGMENT와 같은 패턴이다.
const CORE_PATH_SEGMENT = /(?:^|[/\\])core(?:[/\\]|$)/u;

const jsBanner = "/*! @cp949/scrolla-react provisional artifact */";

async function buildJavaScript() {
  await build({
    banner: { js: jsBanner },
    bundle: true,
    entryPoints: [resolve(sourceDirectory, "index.ts")],
    external: ["react", "react-dom", "react/jsx-runtime"],
    format: "esm",
    minify: false,
    outfile: jsPath,
    platform: "browser",
    sourcemap: "external",
    target: "chrome75",
  });
}

// esbuild가 index.js.map의 sourcesContent에 core 원본 TypeScript 전체를 그대로
// 임베드하므로, core에 해당하는 항목만 null로 치환해 원본 노출을 막는다. source-map
// v3 스펙상 sourcesContent 항목은 null일 수 있고 line/column mapping 자체는 유지된다.
async function scrubCoreSourcemap() {
  const map = JSON.parse(await readFile(jsMapPath, "utf8"));
  if (!Array.isArray(map.sourcesContent)) {
    return;
  }

  map.sourcesContent = map.sources.map((source, index) =>
    CORE_PATH_SEGMENT.test(source) ? null : map.sourcesContent[index],
  );
  await writeFile(jsMapPath, JSON.stringify(map));
}

function buildDeclarations() {
  const result = spawnSync(
    process.execPath,
    [
      dtsBundleGeneratorPath,
      "--no-banner",
      "--external-types",
      "react",
      "--project",
      tsconfigPath,
      "-o",
      resolve(distDirectory, "index.d.ts"),
      resolve(sourceDirectory, "index.ts"),
    ],
    {
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(
      `TypeScript declaration bundle 생성이 실패했습니다 (exit code ${result.status}).`,
    );
  }
}

async function buildStyles() {
  const sassResult = compile(stylesPath, {
    sourceMap: true,
    sourceMapIncludeSources: true,
    style: "expanded",
  });
  const result = await postcss([autoprefixer()]).process(sassResult.css, {
    from: stylesPath,
    map: {
      annotation: false,
      inline: false,
      prev: sassResult.sourceMap,
    },
    to: cssPath,
  });

  const sourceMap = result.map.toJSON();
  sourceMap.sources = sourceMap.sources.map((source) => {
    const sourcePath = source.startsWith("file:")
      ? fileURLToPath(source)
      : resolve(dirname(cssMapPath), source);
    return relative(packageDirectory, sourcePath).replaceAll("\\", "/");
  });

  await writeFile(
    cssPath,
    `${result.css}\n/*# sourceMappingURL=styles.css.map */\n`,
  );
  await writeFile(cssMapPath, JSON.stringify(sourceMap));
}

await rm(distDirectory, { force: true, recursive: true });
await mkdir(distDirectory, { recursive: true });
await buildJavaScript();
await scrubCoreSourcemap();
buildDeclarations();
await buildStyles();
