export interface PackageAuditDiagnostic {
  category: string;
  code: string;
  message: string;
  path: string;
}

export interface PackageAuditResult {
  diagnostics: PackageAuditDiagnostic[];
  targets: {
    core: number;
    css: number;
    declarations: number;
    javascript: number;
  };
}

export declare class PackageAuditError extends Error {
  diagnostics: PackageAuditDiagnostic[];
}

export declare function auditPackage(rootPath: string): Promise<PackageAuditResult>;
