export interface ComplexityDisable {
  file: string;
  line: number;
  next: string;
}
export interface ComplexityException {
  file: string;
  function: string;
  justification: string;
  reviewer: string;
}
export interface ModuleComplexity {
  module: string;
  functions: number;
  average: number;
  max: number;
}
export function listSourceFiles(root: string, dirs?: string[]): string[];
export function findDisables(root: string, files: string[]): ComplexityDisable[];
export function validateExceptions(disables: ComplexityDisable[], exceptions: ComplexityException[]): string[];
export function check(root?: string): string[];
export function moduleOf(file: string): string;
export function aggregate(entries: { file: string; complexity: number }[]): ModuleComplexity[];
