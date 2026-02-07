/**
 * itemVariableHandler tests
 */

import { describe, expect, it } from 'bun:test';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Position } from 'vscode-languageserver-types';
import { createItemVariableHandler } from '../../src/references/handlers/itemVariableHandler';

function makeDoc(content: string, uri = 'file:///test.yaml') {
  return TextDocument.create(uri, 'yaml', 1, content);
}

describe('itemVariableHandler', () => {
  const handler = createItemVariableHandler();

  it('should detect {{item}} reference', () => {
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
              - "apple"
              - "banana"
`);
    const detected = handler.detect(doc, Position.create(9, 28));
    expect(detected).toBeDefined();
    expect(detected!.kind).toBe('itemVariable');
    expect(detected!.details.kind).toBe('itemVariable');
  });

  it('should resolve item variable with withItems source', async () => {
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
              - "apple"
              - "banana"
`);
    const detected = handler.detect(doc, Position.create(9, 28));
    expect(detected).toBeDefined();

    const resolved = await handler.resolve(doc, detected!);
    expect(resolved.definitionLocation).not.toBeNull();
    expect(resolved.hoverMarkdown).toContain('withItems');
    expect(resolved.hoverMarkdown).toContain('apple');
    expect(resolved.exists).toBe(true);
  });

  it('should resolve item.property with object withItems', async () => {
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
    const detected = handler.detect(doc, Position.create(9, 28));
    expect(detected).toBeDefined();
    expect(detected!.details.kind).toBe('itemVariable');

    const resolved = await handler.resolve(doc, detected!);
    expect(resolved.definitionLocation).not.toBeNull();
    expect(resolved.hoverMarkdown).toContain('item.name');
    expect(resolved.hoverMarkdown).toContain('Available properties');
    expect(resolved.hoverMarkdown).toContain('`name`');
    expect(resolved.hoverMarkdown).toContain('`count`');
  });

  it('should resolve item with withParam source', async () => {
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
    const detected = handler.detect(doc, Position.create(9, 28));
    expect(detected).toBeDefined();

    const resolved = await handler.resolve(doc, detected!);
    expect(resolved.definitionLocation).not.toBeNull();
    expect(resolved.hoverMarkdown).toContain('withParam');
    expect(resolved.hoverMarkdown).toContain('workflow.parameters.items-json');
  });

  it('should provide property completion for object items', () => {
    const doc = makeDoc(`spec:
  templates:
    - name: main
      steps:
        - - name: process
            template: echo
            arguments:
              parameters:
                - name: n
                  value: "{{item.}}"
            withItems:
              - { name: "foo", count: 1 }
`);
    // cursor after "{{item."
    const completions = handler.complete!(doc, Position.create(9, 33));
    expect(completions).toBeDefined();
    expect(completions!.length).toBe(2);
    const labels = completions!.map(c => c.label);
    expect(labels).toContain('name');
    expect(labels).toContain('count');
  });

  it('should return null for item outside withItems/withParam context', async () => {
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
    const detected = handler.detect(doc, Position.create(9, 28));
    expect(detected).toBeDefined();

    const resolved = await handler.resolve(doc, detected!);
    expect(resolved.definitionLocation).toBeNull();
    expect(resolved.hoverMarkdown).toBeNull();
  });

  it('should not return completion when not in {{item. prefix', () => {
    const doc = makeDoc(`spec:
  templates:
    - name: main
      steps:
        - - name: process
            template: echo
            arguments:
              parameters:
                - name: msg
                  value: "hello"
            withItems:
              - { name: "foo" }
`);
    const completions = handler.complete!(doc, Position.create(9, 20));
    expect(completions).toBeUndefined();
  });
});
