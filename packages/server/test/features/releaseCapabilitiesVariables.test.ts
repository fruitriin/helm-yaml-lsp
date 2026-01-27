/**
 * Release and Capabilities Variables Test
 */

import { describe, expect, it } from 'bun:test';
import {
  findReleaseVariable,
  findCapabilitiesVariable,
  getAllReleaseVariableNames,
  getAllCapabilitiesVariableNames,
  getAllReleaseVariables,
  getAllCapabilitiesVariables,
} from '../../src/features/releaseCapabilitiesVariables';

describe('releaseCapabilitiesVariables', () => {
  describe('findReleaseVariable', () => {
    it('should find Release.Name variable', () => {
      const variable = findReleaseVariable('Name');
      expect(variable).toBeDefined();
      expect(variable?.name).toBe('Name');
      expect(variable?.fullPath).toBe('.Release.Name');
      expect(variable?.category).toBe('release');
    });

    it('should find Release.Namespace variable', () => {
      const variable = findReleaseVariable('Namespace');
      expect(variable).toBeDefined();
      expect(variable?.name).toBe('Namespace');
      expect(variable?.fullPath).toBe('.Release.Namespace');
    });

    it('should find Release.IsUpgrade variable', () => {
      const variable = findReleaseVariable('IsUpgrade');
      expect(variable).toBeDefined();
      expect(variable?.name).toBe('IsUpgrade');
      expect(variable?.category).toBe('release');
    });

    it('should return undefined for non-existent variable', () => {
      const variable = findReleaseVariable('NonExistent');
      expect(variable).toBeUndefined();
    });
  });

  describe('findCapabilitiesVariable', () => {
    it('should find Capabilities.KubeVersion variable', () => {
      const variable = findCapabilitiesVariable('KubeVersion');
      expect(variable).toBeDefined();
      expect(variable?.name).toBe('KubeVersion');
      expect(variable?.fullPath).toBe('.Capabilities.KubeVersion');
      expect(variable?.category).toBe('capabilities');
    });

    it('should find Capabilities.APIVersions variable', () => {
      const variable = findCapabilitiesVariable('APIVersions');
      expect(variable).toBeDefined();
      expect(variable?.name).toBe('APIVersions');
      expect(variable?.category).toBe('capabilities');
    });

    it('should find nested KubeVersion.Version variable', () => {
      const variable = findCapabilitiesVariable('KubeVersion.Version');
      expect(variable).toBeDefined();
      expect(variable?.name).toBe('KubeVersion.Version');
      expect(variable?.fullPath).toBe('.Capabilities.KubeVersion.Version');
    });

    it('should return undefined for non-existent variable', () => {
      const variable = findCapabilitiesVariable('NonExistent');
      expect(variable).toBeUndefined();
    });
  });

  describe('getAllReleaseVariableNames', () => {
    it('should return all Release variable names', () => {
      const names = getAllReleaseVariableNames();
      expect(names.length).toBeGreaterThan(3);
      expect(names).toContain('Name');
      expect(names).toContain('Namespace');
      expect(names).toContain('IsUpgrade');
    });

    it('should not have duplicate names', () => {
      const names = getAllReleaseVariableNames();
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });
  });

  describe('getAllCapabilitiesVariableNames', () => {
    it('should return all Capabilities variable names', () => {
      const names = getAllCapabilitiesVariableNames();
      expect(names.length).toBeGreaterThan(2);
      expect(names).toContain('KubeVersion');
      expect(names).toContain('APIVersions');
    });

    it('should not have duplicate names', () => {
      const names = getAllCapabilitiesVariableNames();
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });
  });

  describe('getAllReleaseVariables', () => {
    it('should return all Release variables', () => {
      const variables = getAllReleaseVariables();
      expect(variables.length).toBeGreaterThan(3);
    });

    it('should have all required properties', () => {
      const variables = getAllReleaseVariables();
      for (const variable of variables) {
        expect(variable.name).toBeDefined();
        expect(variable.fullPath).toBeDefined();
        expect(variable.description).toBeDefined();
        expect(variable.category).toBe('release');
      }
    });

    it('should have correct fullPath format', () => {
      const variables = getAllReleaseVariables();
      for (const variable of variables) {
        expect(variable.fullPath).toBe(`.Release.${variable.name}`);
      }
    });
  });

  describe('getAllCapabilitiesVariables', () => {
    it('should return all Capabilities variables', () => {
      const variables = getAllCapabilitiesVariables();
      expect(variables.length).toBeGreaterThan(2);
    });

    it('should have all required properties', () => {
      const variables = getAllCapabilitiesVariables();
      for (const variable of variables) {
        expect(variable.name).toBeDefined();
        expect(variable.fullPath).toBeDefined();
        expect(variable.description).toBeDefined();
        expect(variable.category).toBe('capabilities');
      }
    });

    it('should have correct fullPath format', () => {
      const variables = getAllCapabilitiesVariables();
      for (const variable of variables) {
        expect(variable.fullPath).toBe(`.Capabilities.${variable.name}`);
      }
    });
  });

  describe('variable properties', () => {
    it('Release.Name should have correct properties', () => {
      const variable = findReleaseVariable('Name');
      expect(variable?.name).toBe('Name');
      expect(variable?.fullPath).toBe('.Release.Name');
      expect(variable?.description).toContain('name');
      expect(variable?.category).toBe('release');
    });

    it('Release.Namespace should have correct properties', () => {
      const variable = findReleaseVariable('Namespace');
      expect(variable?.name).toBe('Namespace');
      expect(variable?.fullPath).toBe('.Release.Namespace');
      expect(variable?.description).toContain('namespace');
    });

    it('Capabilities.KubeVersion should have correct properties', () => {
      const variable = findCapabilitiesVariable('KubeVersion');
      expect(variable?.name).toBe('KubeVersion');
      expect(variable?.fullPath).toBe('.Capabilities.KubeVersion');
      expect(variable?.description).toContain('Kubernetes');
      expect(variable?.category).toBe('capabilities');
    });
  });
});
