import test from 'node:test';
import assert from 'node:assert/strict';
import { toFlagInput, toRuleInput, toUiEvaluation, toUiFlagDetail } from './flag-api.js';

test('maps persisted flag and rule fields into the candidate UI shape', () => {
  const ui = toUiFlagDetail({
    flag: { id: 4, name: 'Checkout', key: 'checkout_v2', environment: 'production', description: 'desc', enabled: true, default_value: false, updated_at: '2026-01-01T00:00:00Z' },
    rules: [{ id: 8, flag_id: 4, attribute: 'plan', operator: 'equals', expected: 'enterprise', result: true, priority: 10 }],
    history: []
  });
  assert.equal(ui.id, '4');
  assert.equal(ui.defaultValue, false);
  assert.equal(ui.description, 'desc');
  assert.deepEqual(ui.rules[0].values, ['enterprise']);
  assert.deepEqual(toFlagInput(ui), { name: 'Checkout', key: 'checkout_v2', environment: 'production', description: 'desc', enabled: true, default_value: false });
  assert.deepEqual(toRuleInput({ ...ui.rules[0], returnValue: false }).expected, 'enterprise');
});

test('encodes changed rule values to the supported operator shapes', () => {
  assert.deepEqual(toRuleInput({ attribute: 'country', operator: 'in', values: ['CN', 'SG'], returnValue: true, priority: 20 }), {
    attribute: 'country', operator: 'in', expected: ['CN', 'SG'], result: true, priority: 20
  });
  assert.deepEqual(toRuleInput({ attribute: 'plan', operator: 'equals', values: ['enterprise'], returnValue: true, priority: 10 }), {
    attribute: 'plan', operator: 'equals', expected: 'enterprise', result: true, priority: 10
  });
});

test('maps the actual Go evaluation result and trace', () => {
  assert.deepEqual(toUiEvaluation({ value: true, reason: 'rule', explanation: 'matched', steps: [{ rule_id: 2, priority: 10, matched: true }] }), {
    value: true, reason: 'rule', matchedRule: undefined, latencyMs: '由 API 返回',
    trace: [{ step: '规则 #2 · 优先级 10', status: 'match', detail: '属性值命中，返回规则结果。' }]
  });
});
