/**
 * Unified Reference Resolution - Public API
 */

export { buildDescription } from './formatters';
export type { ReferenceHandler } from './handler';
export type { DocumentGuard } from './registry';
export { ReferenceRegistry } from './registry';
export { createReferenceRegistry } from './setup';
export type {
  ArgoParameterDetails,
  ArgoTemplateDetails,
  ChartVariableDetails,
  CompletionResult,
  ConfigMapDetails,
  DetectedReference,
  HelmFunctionDetails,
  HelmTemplateDetails,
  HelmValuesDetails,
  ReferenceDetails,
  ReferenceKind,
  ReleaseCapabilitiesDetails,
  ResolvedReference,
  WorkflowVariableDetails,
} from './types';
