import { describe, expect, it } from 'bun:test';
import {
  findValueByPath,
  findValuesByPrefix,
  parseValuesYaml,
  type ValueDefinition,
} from '@/features/valuesYamlParser';

describe('Values YAML Parser', () => {
  describe('parseValuesYaml', () => {
    it('should parse simple values', () => {
      const content = `
replicaCount: 1
namespace: default
enabled: true
`;
      const uri = 'file:///test/values.yaml';
      const definitions = parseValuesYaml(content, uri);

      expect(definitions).toHaveLength(3);

      const replicaCount = definitions.find(d => d.path === 'replicaCount');
      expect(replicaCount).toBeDefined();
      expect(replicaCount?.value).toBe(1);
      expect(replicaCount?.valueType).toBe('number');

      const namespace = definitions.find(d => d.path === 'namespace');
      expect(namespace).toBeDefined();
      expect(namespace?.value).toBe('default');
      expect(namespace?.valueType).toBe('string');

      const enabled = definitions.find(d => d.path === 'enabled');
      expect(enabled).toBeDefined();
      expect(enabled?.value).toBe(true);
      expect(enabled?.valueType).toBe('boolean');
    });

    it('should parse nested objects', () => {
      const content = `
image:
  repository: nginx
  tag: latest
  pullPolicy: IfNotPresent
`;
      const uri = 'file:///test/values.yaml';
      const definitions = parseValuesYaml(content, uri);

      // Should have: image, image.repository, image.tag, image.pullPolicy
      expect(definitions.length).toBeGreaterThanOrEqual(4);

      const imageRepo = definitions.find(d => d.path === 'image.repository');
      expect(imageRepo).toBeDefined();
      expect(imageRepo?.value).toBe('nginx');
      expect(imageRepo?.valueType).toBe('string');
      expect(imageRepo?.parentPath).toBe('image');

      const imageTag = definitions.find(d => d.path === 'image.tag');
      expect(imageTag).toBeDefined();
      expect(imageTag?.value).toBe('latest');
    });

    it('should parse arrays', () => {
      const content = `
ports:
  - 80
  - 443
tags:
  - web
  - api
`;
      const uri = 'file:///test/values.yaml';
      const definitions = parseValuesYaml(content, uri);

      const ports = definitions.find(d => d.path === 'ports');
      expect(ports).toBeDefined();
      expect(ports?.valueType).toBe('array');
      expect(Array.isArray(ports?.value)).toBe(true);

      const tags = definitions.find(d => d.path === 'tags');
      expect(tags).toBeDefined();
      expect(tags?.valueType).toBe('array');
    });

    it.skip('should extract comments', () => {
      const content = `# Number of replicas
replicaCount: 1

# Container image configuration
image:
  # Docker repository
  repository: nginx
  tag: latest  # Image tag
`;
      const uri = 'file:///test/values.yaml';
      const definitions = parseValuesYaml(content, uri);

      const replicaCount = definitions.find(d => d.path === 'replicaCount');
      expect(replicaCount?.description).toBeDefined();
      if (replicaCount?.description) {
        expect(replicaCount.description).toContain('Number of replicas');
      }

      const image = definitions.find(d => d.path === 'image');
      expect(image?.description).toBeDefined();
      if (image?.description) {
        expect(image.description).toContain('Container image configuration');
      }

      const imageRepo = definitions.find(d => d.path === 'image.repository');
      expect(imageRepo?.description).toBeDefined();
      if (imageRepo?.description) {
        expect(imageRepo.description).toContain('Docker repository');
      }

      const imageTag = definitions.find(d => d.path === 'image.tag');
      expect(imageTag?.description).toBeDefined();
      if (imageTag?.description) {
        expect(imageTag.description).toContain('Image tag');
      }
    });

    it('should handle deeply nested objects', () => {
      const content = `
app:
  config:
    database:
      host: localhost
      port: 5432
`;
      const uri = 'file:///test/values.yaml';
      const definitions = parseValuesYaml(content, uri);

      const dbHost = definitions.find(d => d.path === 'app.config.database.host');
      expect(dbHost).toBeDefined();
      expect(dbHost?.value).toBe('localhost');
      expect(dbHost?.parentPath).toBe('app.config.database');
    });

    it('should handle null values', () => {
      const content = `
optional: null
`;
      const uri = 'file:///test/values.yaml';
      const definitions = parseValuesYaml(content, uri);

      const optional = definitions.find(d => d.path === 'optional');
      expect(optional).toBeDefined();
      expect(optional?.value).toBeNull();
      expect(optional?.valueType).toBe('null');
    });

    it('should return empty array for empty values.yaml', () => {
      const content = '';
      const uri = 'file:///test/values.yaml';
      const definitions = parseValuesYaml(content, uri);

      expect(definitions).toEqual([]);
    });

    it('should return empty array for invalid YAML', () => {
      const content = 'invalid: yaml: content:';
      const uri = 'file:///test/values.yaml';
      const definitions = parseValuesYaml(content, uri);

      expect(definitions).toEqual([]);
    });

    it('should handle values.yaml with only comments', () => {
      const content = `
# This is a comment
# Another comment
`;
      const uri = 'file:///test/values.yaml';
      const definitions = parseValuesYaml(content, uri);

      expect(definitions).toEqual([]);
    });
  });

  describe('findValuesByPrefix', () => {
    const definitions: ValueDefinition[] = [
      {
        path: 'image',
        value: {},
        valueType: 'object',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 5 } },
        uri: 'file:///test/values.yaml',
      },
      {
        path: 'image.repository',
        value: 'nginx',
        valueType: 'string',
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 10 } },
        uri: 'file:///test/values.yaml',
        parentPath: 'image',
      },
      {
        path: 'image.tag',
        value: 'latest',
        valueType: 'string',
        range: { start: { line: 2, character: 0 }, end: { line: 2, character: 3 } },
        uri: 'file:///test/values.yaml',
        parentPath: 'image',
      },
      {
        path: 'replicaCount',
        value: 1,
        valueType: 'number',
        range: { start: { line: 3, character: 0 }, end: { line: 3, character: 12 } },
        uri: 'file:///test/values.yaml',
      },
    ];

    it('should find values by prefix', () => {
      const results = findValuesByPrefix(definitions, 'image');

      expect(results).toHaveLength(3);
      expect(results.map(d => d.path).sort()).toEqual(['image', 'image.repository', 'image.tag']);
    });

    it('should find values by exact match', () => {
      const results = findValuesByPrefix(definitions, 'image.tag');

      expect(results).toHaveLength(1);
      expect(results[0].path).toBe('image.tag');
    });

    it('should be case-insensitive', () => {
      const results = findValuesByPrefix(definitions, 'IMAGE');

      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-matching prefix', () => {
      const results = findValuesByPrefix(definitions, 'nonexistent');

      expect(results).toEqual([]);
    });
  });

  describe('findValueByPath', () => {
    const definitions: ValueDefinition[] = [
      {
        path: 'image.repository',
        value: 'nginx',
        valueType: 'string',
        range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
        uri: 'file:///test/values.yaml',
      },
      {
        path: 'replicaCount',
        value: 1,
        valueType: 'number',
        range: { start: { line: 1, character: 0 }, end: { line: 1, character: 12 } },
        uri: 'file:///test/values.yaml',
      },
    ];

    it('should find value by exact path', () => {
      const result = findValueByPath(definitions, 'image.repository');

      expect(result).toBeDefined();
      expect(result?.value).toBe('nginx');
    });

    it('should return undefined for non-existent path', () => {
      const result = findValueByPath(definitions, 'nonexistent');

      expect(result).toBeUndefined();
    });

    it('should be case-sensitive', () => {
      const result = findValueByPath(definitions, 'IMAGE.REPOSITORY');

      expect(result).toBeUndefined();
    });
  });
});
