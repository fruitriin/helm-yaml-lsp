/**
 * ConfigMap Index Tests
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import * as path from 'node:path';
import { ConfigMapIndex } from '@/services/configMapIndex';

describe('ConfigMapIndex', () => {
  let index: ConfigMapIndex;
  // Use samples/argo directory which contains configmap-data.yaml
  const samplesPath = path.join(__dirname, '../../../../samples/argo');

  beforeEach(() => {
    index = new ConfigMapIndex();
  });

  describe('initialize', () => {
    it('should initialize and index ConfigMap definitions', async () => {
      await index.initialize([samplesPath]);

      const configMap = index.findConfigMap('app-config', 'ConfigMap');
      expect(configMap).toBeDefined();
      expect(configMap?.name).toBe('app-config');
      expect(configMap?.kind).toBe('ConfigMap');
    });

    it('should initialize and index Secret definitions', async () => {
      await index.initialize([samplesPath]);

      const secret = index.findConfigMap('app-secrets', 'Secret');
      expect(secret).toBeDefined();
      expect(secret?.name).toBe('app-secrets');
      expect(secret?.kind).toBe('Secret');
    });
  });

  describe('findConfigMap', () => {
    beforeEach(async () => {
      await index.initialize([samplesPath]);
    });

    it('should find ConfigMap by name', () => {
      const configMap = index.findConfigMap('app-config', 'ConfigMap');
      expect(configMap).toBeDefined();
      expect(configMap?.name).toBe('app-config');
    });

    it('should find Secret by name', () => {
      const secret = index.findConfigMap('app-secrets', 'Secret');
      expect(secret).toBeDefined();
      expect(secret?.name).toBe('app-secrets');
    });

    it('should return undefined for non-existent ConfigMap', () => {
      const configMap = index.findConfigMap('non-existent', 'ConfigMap');
      expect(configMap).toBeUndefined();
    });

    it('should return undefined when searching Secret as ConfigMap', () => {
      const result = index.findConfigMap('app-secrets', 'ConfigMap');
      expect(result).toBeUndefined();
    });
  });

  describe('findKey', () => {
    beforeEach(async () => {
      await index.initialize([samplesPath]);
    });

    it('should find key in ConfigMap', () => {
      const key = index.findKey('app-config', 'database-url', 'ConfigMap');
      expect(key).toBeDefined();
      expect(key?.keyName).toBe('database-url');
      expect(key?.configMapName).toBe('app-config');
    });

    it('should find key in Secret', () => {
      const key = index.findKey('app-secrets', 'db-password', 'Secret');
      expect(key).toBeDefined();
      expect(key?.keyName).toBe('db-password');
    });

    it('should return undefined for non-existent key', () => {
      const key = index.findKey('app-config', 'non-existent-key', 'ConfigMap');
      expect(key).toBeUndefined();
    });

    it('should return undefined for non-existent ConfigMap', () => {
      const key = index.findKey('non-existent', 'somekey', 'ConfigMap');
      expect(key).toBeUndefined();
    });
  });

  describe('getKeys', () => {
    beforeEach(async () => {
      await index.initialize([samplesPath]);
    });

    it('should return all keys from ConfigMap', () => {
      const keys = index.getKeys('app-config', 'ConfigMap');
      expect(keys.length).toBeGreaterThan(0);
      expect(keys).toContain('database-url');
      expect(keys).toContain('api-endpoint');
    });

    it('should return empty array for non-existent ConfigMap', () => {
      const keys = index.getKeys('non-existent', 'ConfigMap');
      expect(keys.length).toBe(0);
    });
  });

  describe('getAll', () => {
    beforeEach(async () => {
      await index.initialize([samplesPath]);
    });

    it('should return all ConfigMaps', () => {
      const configMaps = index.getAll('ConfigMap');
      expect(configMaps.length).toBeGreaterThan(0);
      expect(configMaps.some(cm => cm.name === 'app-config')).toBe(true);
    });

    it('should return all Secrets', () => {
      const secrets = index.getAll('Secret');
      expect(secrets.length).toBeGreaterThan(0);
      expect(secrets.some(s => s.name === 'app-secrets')).toBe(true);
    });

    it('should return all ConfigMaps and Secrets when no kind specified', () => {
      const all = index.getAll();
      const configMaps = index.getAll('ConfigMap');
      const secrets = index.getAll('Secret');
      expect(all.length).toBe(configMaps.length + secrets.length);
    });
  });

  describe('removeFile', () => {
    beforeEach(async () => {
      await index.initialize([samplesPath]);
    });

    it('should remove ConfigMap definitions from a file', () => {
      const configMapUri = `file://${path.join(samplesPath, 'configmap-data.yaml')}`;

      // Verify it exists
      let configMap = index.findConfigMap('app-config', 'ConfigMap');
      expect(configMap).toBeDefined();

      // Remove the file
      index.removeFile(configMapUri);

      // Verify it's removed
      configMap = index.findConfigMap('app-config', 'ConfigMap');
      expect(configMap).toBeUndefined();
    });
  });
});
