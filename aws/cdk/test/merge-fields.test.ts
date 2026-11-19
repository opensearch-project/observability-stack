import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { mergeFields, parseStoredFields } from '../custom-resources/field-resync/merge-fields';

const f = (name: string, extra: object = {}) => ({ name, type: 'string', ...extra });

describe('mergeFields', () => {
  it('returns undefined when the stored list already has every live field', () => {
    assert.equal(mergeFields([f('a'), f('b')], [f('b'), f('a')]), undefined);
  });

  it('appends live fields the stored list lacks', () => {
    const merged = mergeFields([f('traceId')], [f('traceId'), f('attributes.gen_ai.agent.name')]);
    assert.deepEqual(merged?.map((x) => x.name), ['traceId', 'attributes.gen_ai.agent.name']);
  });

  it('keeps stored entries untouched, including user customisations', () => {
    const stored = [f('traceId', { customLabel: 'Trace', count: 7 })];
    const merged = mergeFields(stored, [f('traceId'), f('new')]);
    assert.deepEqual(merged?.[0], stored[0]);
  });

  it('does not drop stored fields that are no longer live', () => {
    const merged = mergeFields([f('a'), f('scripted', { scripted: true })], [f('a'), f('b')]);
    assert.deepEqual(merged?.map((x) => x.name), ['a', 'scripted', 'b']);
  });

  it('treats an empty stored list as everything missing', () => {
    assert.equal(mergeFields([], [f('a')])?.length, 1);
  });
});

describe('parseStoredFields', () => {
  it('parses a JSON field list', () => {
    assert.deepEqual(parseStoredFields(JSON.stringify([f('a')])).map((x) => x.name), ['a']);
  });

  it('treats missing, malformed and non-array values as empty', () => {
    assert.deepEqual(parseStoredFields(undefined), []);
    assert.deepEqual(parseStoredFields('nope'), []);
    assert.deepEqual(parseStoredFields('{"a":1}'), []);
  });

  it('drops entries without a name', () => {
    assert.deepEqual(parseStoredFields(JSON.stringify([{ type: 'x' }, f('a')])).map((x) => x.name), ['a']);
  });
});
