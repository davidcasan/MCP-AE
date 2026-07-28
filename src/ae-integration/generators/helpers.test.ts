import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatKeyframeValue } from './helpers.js';

describe('formatKeyframeValue', () => {
  it('passes through numbers', () => {
    assert.equal(formatKeyframeValue(50), '50');
    assert.equal(formatKeyframeValue(-1.5), '-1.5');
  });

  it('passes through real arrays', () => {
    assert.equal(formatKeyframeValue([100, 100]), '[100, 100]');
    assert.equal(formatKeyframeValue([540, 960, 0]), '[540, 960, 0]');
  });

  it('recovers stringified numeric arrays from MCP transports', () => {
    assert.equal(formatKeyframeValue('[100, 100]'), '[100, 100]');
    assert.equal(formatKeyframeValue(' [50,50] '), '[50, 50]');
    assert.equal(formatKeyframeValue('[1e-3, 2.5]'), '[0.001, 2.5]');
  });

  it('recovers stringified numbers', () => {
    assert.equal(formatKeyframeValue('780'), '780');
    assert.equal(formatKeyframeValue('-12.5'), '-12.5');
  });

  it('recovers stringified {x,y,z} objects', () => {
    assert.equal(formatKeyframeValue('{"x":10,"y":20}'), '[10, 20]');
    assert.equal(formatKeyframeValue('{"x":1,"y":2,"z":3}'), '[1, 2, 3]');
  });

  it('accepts real {x,y,z} objects', () => {
    assert.equal(formatKeyframeValue({ x: 10, y: 20 }), '[10, 20]');
    assert.equal(formatKeyframeValue({ x: 1, y: 2, z: 3 }), '[1, 2, 3]');
  });

  it('keeps genuine non-JSON strings quoted', () => {
    assert.equal(formatKeyframeValue('hello'), '"hello"');
    assert.equal(formatKeyframeValue('[not json]'), '"[not json]"');
    assert.equal(formatKeyframeValue('opacity'), '"opacity"');
  });

  it('does not recover nested arrays that fail the numeric gate', () => {
    // Nested arrays are not valid AE multi-dim keyframe values via this path;
    // they remain quoted strings so AE fails loudly rather than emitting junk.
    assert.equal(formatKeyframeValue('[[1,2],[3,4]]'), '"[[1,2],[3,4]]"');
  });
});
