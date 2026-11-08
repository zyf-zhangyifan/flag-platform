import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseExpected, parseAttributes } from './validation.mjs';
test('equals accepts typed scalars only',()=>{
  assert.equal(parseExpected('equals','"CN"'),'CN');
  assert.equal(parseExpected('equals','false'),false);
  assert.equal(parseExpected('equals','42'),42);
  for(const value of ['CN','null','{}','[]','1e999']) assert.throws(()=>parseExpected('equals',value));
});
test('in requires a nonempty scalar array',()=>{
  assert.deepEqual(parseExpected('in','["CN", 1, true]'),['CN',1,true]);
  for(const value of ['[]','[null]','[{}]','"CN"',JSON.stringify(Array(101).fill('x'))]) assert.throws(()=>parseExpected('in',value));
});
test('attributes must be a JSON object',()=>{
  assert.deepEqual(parseAttributes('{}'),{});
  assert.deepEqual(parseAttributes('{"plan":"pro"}'),{plan:'pro'});
  for(const value of ['null','[]','false','{bad}']) assert.throws(()=>parseAttributes(value));
});
