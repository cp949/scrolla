import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PackageAuditError, auditPackage } from "./package-audit.mjs";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const result = await auditPackage(packageDirectory);
  console.log(
    `audit-package: JavaScript ${result.targets.javascript}개, declaration ${result.targets.declarations}개, CSS ${result.targets.css}개, sourcemap ${result.targets.sourcemaps}개, core source ${result.targets.core}개를 확인했습니다.`,
  );
} catch (error) {
  if (error instanceof PackageAuditError) {
    for (const diagnostic of error.diagnostics) {
      console.error(
        `audit-package [${diagnostic.code}] ${diagnostic.category} ${diagnostic.path}: ${diagnostic.message}`,
      );
    }
    process.exitCode = 1;
  } else {
    throw error;
  }
}
