/**
 * Chart Variables Test
 */

import { describe, expect, it } from 'bun:test';
import {
  findChartVariable,
  getAllChartVariableNames,
  getAllChartVariables,
} from '../../src/features/chartVariables';

describe('chartVariables', () => {
  describe('findChartVariable', () => {
    it('should find chart variable by name', () => {
      const variable = findChartVariable('Name');
      expect(variable).toBeDefined();
      expect(variable?.name).toBe('Name');
      expect(variable?.fullPath).toBe('.Chart.Name');
    });

    it('should find Version variable', () => {
      const variable = findChartVariable('Version');
      expect(variable).toBeDefined();
      expect(variable?.name).toBe('Version');
      expect(variable?.fullPath).toBe('.Chart.Version');
    });

    it('should find AppVersion variable', () => {
      const variable = findChartVariable('AppVersion');
      expect(variable).toBeDefined();
      expect(variable?.name).toBe('AppVersion');
      expect(variable?.fullPath).toBe('.Chart.AppVersion');
    });

    it('should return undefined for non-existent variable', () => {
      const variable = findChartVariable('NonExistent');
      expect(variable).toBeUndefined();
    });
  });

  describe('getAllChartVariableNames', () => {
    it('should return all variable names', () => {
      const names = getAllChartVariableNames();
      expect(names.length).toBeGreaterThan(5);
      expect(names).toContain('Name');
      expect(names).toContain('Version');
      expect(names).toContain('AppVersion');
    });

    it('should not have duplicate names', () => {
      const names = getAllChartVariableNames();
      const uniqueNames = [...new Set(names)];
      expect(names.length).toBe(uniqueNames.length);
    });
  });

  describe('getAllChartVariables', () => {
    it('should return all variables', () => {
      const variables = getAllChartVariables();
      expect(variables.length).toBeGreaterThan(5);
    });

    it('should have all required properties', () => {
      const variables = getAllChartVariables();
      for (const variable of variables) {
        expect(variable.name).toBeDefined();
        expect(variable.fullPath).toBeDefined();
        expect(variable.description).toBeDefined();
      }
    });

    it('should have correct fullPath format', () => {
      const variables = getAllChartVariables();
      for (const variable of variables) {
        expect(variable.fullPath).toBe(`.Chart.${variable.name}`);
      }
    });
  });

  describe('variable properties', () => {
    it('Name variable should have correct properties', () => {
      const variable = findChartVariable('Name');
      expect(variable?.name).toBe('Name');
      expect(variable?.fullPath).toBe('.Chart.Name');
      expect(variable?.description).toContain('name');
    });

    it('Version variable should have correct properties', () => {
      const variable = findChartVariable('Version');
      expect(variable?.name).toBe('Version');
      expect(variable?.fullPath).toBe('.Chart.Version');
      expect(variable?.description).toContain('version');
    });

    it('Description variable should have correct properties', () => {
      const variable = findChartVariable('Description');
      expect(variable?.name).toBe('Description');
      expect(variable?.fullPath).toBe('.Chart.Description');
      expect(variable?.description).toContain('description');
    });
  });
});
