const ACTION_LABELS = {
  'flag.created': '创建 Flag',
  'flag.updated': '更新配置',
  'flag.enabled': '启用 Flag',
  'flag.disabled': '停用 Flag',
  'rule.created': '新增规则',
  'rule.updated': '修改规则',
  'rule.deleted': '删除规则'
};

export async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers }
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error('服务未返回 JSON，请检查 Go API 是否运行。');
  }
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

export function toUiRule(rule) {
  const expected = rule.expected;
  const values = Array.isArray(expected) ? expected : [expected];
  return {
    ...rule,
    id: String(rule.id),
    name: rule.attribute,
    _originalOperator: rule.operator,
    values: values.map((value) => String(value)),
    returnValue: rule.result,
    _originalExpected: expected,
    _originalValues: values.map((value) => String(value))
  };
}

export function toUiFlagDetail(detail) {
  const { flag, rules = [], history = [] } = detail;
  return {
    ...flag,
    id: String(flag.id),
    defaultValue: flag.default_value,
    updatedAt: flag.updated_at,
    description: flag.description || '',
    owner: 'Demo Admin',
    tags: [],
    rules: rules.map(toUiRule)
  };
}

export function toFlagInput(flag) {
  return {
    name: flag.name,
    key: flag.key,
    environment: flag.environment,
    description: flag.description || '',
    enabled: Boolean(flag.enabled),
    default_value: Boolean(flag.defaultValue)
  };
}

export function toRuleInput(rule) {
  const values = (rule.values || []).map((value) => String(value).trim()).filter(Boolean);
  const unchanged = rule.operator === rule._originalOperator && JSON.stringify(values) === JSON.stringify(rule._originalValues);
  let expected;
  if (unchanged && rule._originalExpected !== undefined) {
    expected = rule._originalExpected;
  } else if (rule.operator === 'equals') {
    expected = values[0] ?? '';
  } else {
    expected = values;
  }
  return {
    attribute: rule.attribute,
    operator: rule.operator,
    expected,
    result: Boolean(rule.returnValue),
    priority: Number(rule.priority)
  };
}

export function toUiEvaluation(result) {
  const trace = (result.steps || []).map((step) => ({
    step: `规则 #${step.rule_id} · 优先级 ${step.priority}`,
    status: step.matched ? 'match' : 'skip',
    detail: step.matched ? '属性值命中，返回规则结果。' : '属性值未命中，继续判断后续规则。'
  }));
  if (!trace.length) {
    trace.push({
      step: result.reason === 'disabled' ? '检查全局开关' : '检查定向规则',
      status: result.reason === 'disabled' ? 'stop' : 'fallback',
      detail: result.explanation
    });
  } else if (result.reason === 'default') {
    trace.push({ step: '执行默认返回策略', status: 'fallback', detail: result.explanation });
  }
  return {
    value: result.value,
    reason: result.reason,
    matchedRule: result.matched_rule,
    latencyMs: '由 API 返回',
    trace
  };
}

export function toUiAuditLog(entry, flag) {
  return {
    id: String(entry.id),
    time: entry.created_at,
    actor: entry.actor,
    action: ACTION_LABELS[entry.action] || entry.action,
    target: `${flag.key} (${flag.environment})`,
    detail: entry.summary
  };
}
