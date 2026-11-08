export function parseExpected(operator, text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('期望值不是合法 JSON；字符串需要双引号，例如 "CN"。'); }
  const scalar = x => typeof x === 'string' || typeof x === 'boolean' || (typeof x === 'number' && Number.isFinite(x));
  if (operator === 'equals' && !scalar(value)) throw new Error('equals 只接受字符串、数字或布尔值。');
  if (operator === 'in' && (!Array.isArray(value) || value.length < 1 || value.length > 100 || !value.every(scalar))) throw new Error('in 需要包含 1～100 项字符串、数字或布尔值的数组。');
  if (!['equals','in'].includes(operator)) throw new Error('不支持的操作符。');
  return value;
}
export function parseAttributes(text) {
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('用户属性不是合法 JSON，请检查引号、逗号和括号。'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('用户属性必须是 JSON 对象，不能是数组或 null。');
  return value;
}
