import { test } from 'node:test';
import assert from 'node:assert/strict';
import { updateFlagInPlace } from './flag-state.mjs';

test('toggle updates the matching row without moving it to the top', () => {
  const flags = [{id:1,enabled:true},{id:2,enabled:false},{id:3,enabled:true}];
  const updated = {id:2,enabled:true,updated_at:'2026-11-07T06:00:00Z'};
  const result = updateFlagInPlace(flags, updated);
  assert.deepEqual(result.map(flag => flag.id), [1,2,3]);
  assert.equal(result[1], updated);
  assert.equal(result[0], flags[0]);
  assert.equal(result[2], flags[2]);
  assert.equal(flags[1].enabled, false);
});

test('repeated enable/disable preserves row order and uses server values', () => {
  let flags = [{id:10,enabled:true},{id:20,enabled:true}];
  for (const enabled of [false,true,false,true]) {
    flags = updateFlagInPlace(flags, {id:20,enabled});
    assert.deepEqual(flags.map(flag => flag.id), [10,20]);
    assert.equal(flags[1].enabled, enabled);
  }
});

test('an update does not insert unrelated rows into the current list', () => {
  const flags = [{id:1,enabled:true}];
  const result = updateFlagInPlace(flags, {id:99,enabled:false});
  assert.deepEqual(result, flags);
  assert.equal(result[0], flags[0]);
  assert.deepEqual(updateFlagInPlace([], {id:99,enabled:true}), []);
});
