/**
 * Unified Reference Resolution - Setup
 *
 * ReferenceRegistry のファクトリ関数。
 * ガードとハンドラーの登録順序を一元管理する。
 */

import { isArgoWorkflowDocument } from '@/features/documentDetection';
import { isHelmTemplate } from '@/features/valuesReferenceFeatures';
import type { ArgoTemplateIndex } from '@/services/argoTemplateIndex';
import type { ConfigMapIndex } from '@/services/configMapIndex';
import type { HelmChartIndex } from '@/services/helmChartIndex';
import type { HelmTemplateIndex } from '@/services/helmTemplateIndex';
import type { ValuesIndex } from '@/services/valuesIndex';
import type { ReferenceHandler } from './handler';
import { createArgoParameterHandler } from './handlers/argoParameterHandler';
import { createArgoTemplateHandler } from './handlers/argoTemplateHandler';
import { createChartVariableHandler } from './handlers/chartVariableHandler';
import { createConfigMapHandler } from './handlers/configMapHandler';
import { createHelmFunctionHandler } from './handlers/helmFunctionHandler';
import { createHelmTemplateHandler } from './handlers/helmTemplateHandler';
import { createHelmValuesHandler } from './handlers/helmValuesHandler';
import { createItemVariableHandler } from './handlers/itemVariableHandler';
import { createReleaseCapabilitiesHandler } from './handlers/releaseCapabilitiesHandler';
import { createWorkflowVariableHandler } from './handlers/workflowVariableHandler';
import { ReferenceRegistry } from './registry';

/**
 * 全サービスを受け取り、ReferenceRegistry を組み立てる
 *
 * ガード登録順 = 検出優先順位:
 * 1. Helm (isHelmTemplate + helmChartIndex)
 * 2. ConfigMap (always)
 * 3. Argo (isArgoWorkflowDocument)
 */
export function createReferenceRegistry(
  _argoTemplateIndex: ArgoTemplateIndex,
  _helmChartIndex?: HelmChartIndex,
  _valuesIndex?: ValuesIndex,
  _helmTemplateIndex?: HelmTemplateIndex,
  _configMapIndex?: ConfigMapIndex
): ReferenceRegistry {
  const registry = new ReferenceRegistry();

  // Phase 1: Helm guards (highest priority)
  if (_helmChartIndex) {
    const helmHandlers: ReferenceHandler[] = [];

    if (_valuesIndex) {
      helmHandlers.push(createHelmValuesHandler(_helmChartIndex, _valuesIndex));
    }
    if (_helmTemplateIndex) {
      helmHandlers.push(createHelmTemplateHandler(_helmChartIndex, _helmTemplateIndex));
    }
    helmHandlers.push(createHelmFunctionHandler());
    helmHandlers.push(createChartVariableHandler(_helmChartIndex));
    helmHandlers.push(createReleaseCapabilitiesHandler());

    registry.addGuard({
      name: 'helm',
      check: doc => isHelmTemplate(doc) && !!_helmChartIndex,
      handlers: helmHandlers,
    });
  }

  // Phase 2: ConfigMap guard (always active)
  if (_configMapIndex) {
    const configMapHandler = createConfigMapHandler(_configMapIndex);
    registry.addGuard({
      name: 'configMap',
      check: () => true,
      handlers: [configMapHandler],
    });
  }

  // Phase 3: Argo guard
  const argoTemplateHandler = createArgoTemplateHandler(_argoTemplateIndex);
  const argoParameterHandler = createArgoParameterHandler();
  const workflowVariableHandler = createWorkflowVariableHandler();
  const itemVariableHandler = createItemVariableHandler();
  registry.addGuard({
    name: 'argo',
    check: doc => isArgoWorkflowDocument(doc),
    handlers: [
      argoTemplateHandler,
      argoParameterHandler,
      workflowVariableHandler,
      itemVariableHandler,
    ],
  });

  return registry;
}
