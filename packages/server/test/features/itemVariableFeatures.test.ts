/**
 * itemVariableFeatures tests
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import {
  findItemSourceDefinition,
  findItemVariableAtPosition,
} from '../../src/features/itemVariableFeatures';

function makeDoc(content: string, uri = 'file:///test.yaml') {
  return TextDocument.create(uri, 'yaml', 1, content);
}

describe('findItemVariableAtPosition', () => {
  it('should detect {{item}} reference', () => {
    const doc = makeDoc('  value: "{{item}}"');
    const result = findItemVariableAtPosition(doc, Position.create(0, 12));
    expect(result).toBeDefined();
    expect(result!.type).toBe('item');
    expect(result!.propertyName).toBeUndefined();
    expect(result!.range.start.character).toBe(10);
    expect(result!.range.end.character).toBe(18);
  });

  it('should detect {{item.name}} property reference', () => {
    const doc = makeDoc('  value: "{{item.name}}"');
    const result = findItemVariableAtPosition(doc, Position.create(0, 15));
    expect(result).toBeDefined();
    expect(result!.type).toBe('item.property');
    expect(result!.propertyName).toBe('name');
    expect(result!.range.start.character).toBe(10);
    expect(result!.range.end.character).toBe(23);
  });

  it('should return undefined for non-item position', () => {
    const doc = makeDoc('  value: "hello world"');
    const result = findItemVariableAtPosition(doc, Position.create(0, 12));
    expect(result).toBeUndefined();
  });

  it('should handle multiple item references on same line', () => {
    const doc = makeDoc('  args: ["{{item.name}}", "{{item.count}}"]');
    // First reference
    const result1 = findItemVariableAtPosition(doc, Position.create(0, 15));
    expect(result1).toBeDefined();
    expect(result1!.propertyName).toBe('name');

    // Second reference
    const result2 = findItemVariableAtPosition(doc, Position.create(0, 32));
    expect(result2).toBeDefined();
    expect(result2!.propertyName).toBe('count');
  });

  it('should not match {{item}} inside {{item.xxx}}', () => {
    const doc = makeDoc('  value: "{{item.name}}"');
    // Position is on "item" part within {{item.name}}
    const result = findItemVariableAtPosition(doc, Position.create(0, 13));
    expect(result).toBeDefined();
    // Should match as item.property, not bare item
    expect(result!.type).toBe('item.property');
    expect(result!.propertyName).toBe('name');
  });

  it('should detect item with hyphenated property', () => {
    const doc = makeDoc('  value: "{{item.my-prop}}"');
    const result = findItemVariableAtPosition(doc, Position.create(0, 15));
    expect(result).toBeDefined();
    expect(result!.type).toBe('item.property');
    expect(result!.propertyName).toBe('my-prop');
  });
});

describe('findItemSourceDefinition', () => {
  it('should find withItems source with string values', () => {
    const doc = makeDoc(`apiVersion: argoproj.io/v1alpha1
kind: Workflow
spec:
  templates:
    - name: main
      steps:
        - - name: process
            template: echo
            arguments:
              parameters:
                - name: msg
                  value: "{{item}}"
            withItems:
              - "apple"
              - "banana"
              - "cherry"
`);
    // Position on {{item}} line
    const result = findItemSourceDefinition(doc, Position.create(11, 20));
    expect(result).toBeDefined();
    expect(result!.type).toBe('withItems');
    expect(result!.items).toBeDefined();
    expect(result!.items!.length).toBe(3);
    expect(result!.items![0].value).toBe('apple');
    expect(result!.items![0].valueType).toBe('string');
  });

  it('should find withItems source with object values', () => {
    const doc = makeDoc(`spec:
  templates:
    - name: main
      steps:
        - - name: process
            template: echo
            arguments:
              parameters:
                - name: n
                  value: "{{item.name}}"
            withItems:
              - { name: "foo", count: 1 }
              - { name: "bar", count: 2 }
`);
    const result = findItemSourceDefinition(doc, Position.create(9, 25));
    expect(result).toBeDefined();
    expect(result!.type).toBe('withItems');
    expect(result!.items!.length).toBe(2);
    expect(result!.items![0].valueType).toBe('object');
    expect(result!.items![0].properties).toContain('name');
    expect(result!.items![0].properties).toContain('count');
  });

  it('should find withParam source', () => {
    const doc = makeDoc(`spec:
  templates:
    - name: main
      steps:
        - - name: process
            template: echo
            arguments:
              parameters:
                - name: msg
                  value: "{{item}}"
            withParam: "{{workflow.parameters.items-json}}"
`);
    const result = findItemSourceDefinition(doc, Position.create(9, 25));
    expect(result).toBeDefined();
    expect(result!.type).toBe('withParam');
    expect(result!.paramExpression).toBe('{{workflow.parameters.items-json}}');
  });

  it('should return undefined when no withItems/withParam', () => {
    const doc = makeDoc(`spec:
  templates:
    - name: main
      steps:
        - - name: process
            template: echo
            arguments:
              parameters:
                - name: msg
                  value: "{{item}}"
`);
    const result = findItemSourceDefinition(doc, Position.create(9, 25));
    expect(result).toBeUndefined();
  });

  it('should find withItems in DAG tasks', () => {
    const doc = makeDoc(`spec:
  templates:
    - name: dag-main
      dag:
        tasks:
          - name: parallel-process
            template: echo
            arguments:
              parameters:
                - name: msg
                  value: "{{item}}"
            withItems:
              - "a"
              - "b"
`);
    const result = findItemSourceDefinition(doc, Position.create(10, 25));
    expect(result).toBeDefined();
    expect(result!.type).toBe('withItems');
    expect(result!.items!.length).toBe(2);
  });

  it('should find withItems with number values', () => {
    const doc = makeDoc(`spec:
  templates:
    - name: main
      steps:
        - - name: process
            template: echo
            arguments:
              parameters:
                - name: msg
                  value: "{{item}}"
            withItems:
              - 10
              - 20
              - 30
`);
    const result = findItemSourceDefinition(doc, Position.create(9, 25));
    expect(result).toBeDefined();
    expect(result!.items!.length).toBe(3);
    expect(result!.items![0].value).toBe('10');
    expect(result!.items![0].valueType).toBe('number');
  });
});
