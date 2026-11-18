import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import { pipelineNameFor, MAX_PIPELINE_NAME_LENGTH } from '../lib/pipeline-name';

const VALID = /^[a-z][a-z0-9-]{2,27}$/;

describe('pipelineNameFor', () => {
  it('keeps a name that fits unchanged (existing deployments keep their pipeline)', () => {
    assert.equal(pipelineNameFor('ObservabilityStack'), 'obs-stack-observabilitystack');
    assert.equal(pipelineNameFor('test-ObsStack'), 'obs-stack-test-obsstack');
  });

  it('gives different prefixes different names instead of one cut name', () => {
    const aos = pipelineNameFor('obs-evals-test-aos-ObservabilityStack');
    const aoss = pipelineNameFor('obs-evals-test-aoss-ObservabilityStack');
    assert.notEqual(aos, aoss);
    for (const n of [aos, aoss]) assert.match(n, VALID);
  });

  it('keeps long names valid OSIS names with a stable hash suffix', () => {
    const name = pipelineNameFor('team-a-ObservabilityStack');
    assert.equal(name, pipelineNameFor('team-a-ObservabilityStack'));
    assert.ok(name.length <= MAX_PIPELINE_NAME_LENGTH);
    assert.match(name, /^obs-stack-team-a-obse-[0-9a-f]{6}$/);
  });

  it('never leaves a double hyphen before the hash', () => {
    // The cut lands on a hyphen: obs-stack-abcdefghij- (21 characters).
    const name = pipelineNameFor('abcdefghij-klmnopqrstuvwxyz');
    assert.match(name, VALID);
    assert.doesNotMatch(name, /--/);
  });

  it('lowercases and replaces characters OSIS does not allow', () => {
    assert.equal(pipelineNameFor('My_Stack'), 'obs-stack-my-stack');
    assert.match(pipelineNameFor('My_Very.Long_Stack_Name_With_Dots'), VALID);
  });

  it('tells apart stack names that differ only in case past the cut', () => {
    assert.notEqual(pipelineNameFor('obs-evals-test-aos-StackA'), pipelineNameFor('obs-evals-test-aos-StackB'));
  });
});
