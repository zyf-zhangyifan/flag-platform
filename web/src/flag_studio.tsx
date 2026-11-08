import React, { useState, useMemo, useEffect } from 'react';
import { api, toFlagInput, toRuleInput, toUiAuditLog, toUiEvaluation, toUiFlagDetail, toUiRule } from './flag-api.js';
import {
  Flag,
  Code2,
  Plus,
  Search,
  RefreshCw,
  Check,
  Copy,
  ChevronRight,
  Sliders,
  Zap,
  Layers,
  ShieldCheck,
  Play,
  Trash2,
  Edit3,
  X,
  Terminal,
  Activity,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  Download,
  Filter,
  ArrowUpRight,
  UserCheck,
  Server,
  History,
  Info,
  Eye
} from 'lucide-react';

// ============================================================================
// 初始演示数据（严格对齐项目 Seed 数据与截图状态）
// ============================================================================
const INITIAL_FLAGS = [
  {
    id: 'flag-1',
    name: '视频演示 · 灰度结算',
    key: 'video_demo_checkout',
    environment: 'production',
    enabled: true,
    defaultValue: true,
    rolloutPercentage: 100,
    updatedAt: '2026/11/7 14:53:41',
    description: '生产环境灰度结算链路，针对华东/华南核心大区及 VIP 会员开放新版收银台体验。',
    owner: 'Demo Admin',
    tags: ['核心链路', '收银台'],
    rules: [
      {
        id: 'r-101',
        name: '核心大区白名单',
        attribute: 'region',
        operator: 'in',
        values: ['cn-east', 'cn-south'],
        returnValue: true
      },
      {
        id: 'r-102',
        name: '高价值 VIP 会员',
        attribute: 'plan',
        operator: 'eq',
        values: ['vip'],
        returnValue: true
      }
    ]
  },
  {
    id: 'flag-2',
    name: '视频演示 · 环境隔离',
    key: 'video_demo_checkout',
    environment: 'staging',
    enabled: true,
    defaultValue: false,
    rolloutPercentage: 40,
    updatedAt: '2026/11/7 14:51:27',
    description: '预发布环境隔离验证配置，默认返回 false，仅对 QA 团队与自动化回归账号定向开启。',
    owner: 'Demo Admin',
    tags: ['环境隔离', 'QA验证'],
    rules: [
      {
        id: 'r-201',
        name: 'QA 内部测试角色',
        attribute: 'role',
        operator: 'in',
        values: ['qa', 'tester', 'admin'],
        returnValue: true
      }
    ]
  },
  {
    id: 'flag-3',
    name: '新版结算流程 · 预发布',
    key: 'checkout_v2',
    environment: 'staging',
    enabled: true,
    defaultValue: true,
    rolloutPercentage: 50,
    updatedAt: '2026/11/7 14:06:53',
    description: '支持分期免息与一步式地址智能校验的新版结算流程，预发布环境全量开启默认评估。',
    owner: 'Demo Admin',
    tags: ['结算V2', '预发布'],
    rules: [
      {
        id: 'r-301',
        name: 'iOS 客户端优先体验',
        attribute: 'platform',
        operator: 'eq',
        values: ['ios'],
        returnValue: true
      }
    ]
  },
  {
    id: 'flag-4',
    name: '会员专属推荐',
    key: 'member_recommendations',
    environment: 'development',
    enabled: true,
    defaultValue: false,
    rolloutPercentage: 25,
    updatedAt: '2026/11/7 14:53:44',
    description: '首页信息流接入个性化会员推荐引擎，当用户具备 VIP/SVIP 标识时返回新版推荐结果。',
    owner: 'Demo Admin',
    tags: ['推荐算法', '会员增长'],
    rules: [
      {
        id: 'r-401',
        name: '会员等级定向',
        attribute: 'plan',
        operator: 'in',
        values: ['vip', 'svip'],
        returnValue: true
      }
    ]
  },
  {
    id: 'flag-5',
    name: '智能搜索',
    key: 'smart_search',
    environment: 'development',
    enabled: true,
    defaultValue: false,
    rolloutPercentage: 0,
    updatedAt: '2026/11/7 13:41:27',
    description: '基于向量检索与语义重排的智能搜索框实时补全，当前在开发环境进行联调测试。',
    owner: 'Demo Admin',
    tags: ['AI搜索', '联调中'],
    rules: []
  },
  {
    id: 'flag-6',
    name: '结账页新版优惠券',
    key: 'coupon_drawer_v2',
    environment: 'development',
    enabled: true,
    defaultValue: true,
    rolloutPercentage: 100,
    updatedAt: '2026/11/7 13:20:10',
    description: '结账抽屉内自动计算最优优惠券组合并高亮立减金额，开发环境默认开启。',
    owner: 'Demo Admin',
    tags: ['营销促活', 'UI改版'],
    rules: []
  }
];

// 预设测试用户画像（用于评估控制台一键填入）
const TEST_PERSONAS = [
  {
    id: 'p-vip',
    label: '华东 VIP 会员',
    desc: '命中生产/开发 VIP 与华东规则',
    userKey: 'user_8842_vip',
    attributes: { plan: 'enterprise', country: 'CN', region: 'cn-east', platform: 'ios', role: 'member' }
  },
  {
    id: 'p-qa',
    label: 'QA 自动化测试员',
    desc: '命中预发布环境 QA 定向规则',
    userKey: 'qa_bot_01',
    attributes: { plan: 'free', country: 'US', region: 'cn-north', platform: 'web', role: 'qa' }
  },
  {
    id: 'p-normal',
    label: '普通匿名访客',
    desc: '不命中特定属性规则，走默认返回值',
    userKey: 'guest_90210',
    attributes: { plan: 'free', country: 'US', region: 'us-west', platform: 'android', role: 'guest' }
  }
];

// 环境视觉规范配置（保留原图色彩基因并强化精致度）
const ENV_META = {
  production: {
    label: 'production',
    cnLabel: '生产环境',
    badgeBg: 'bg-violet-50/90 text-violet-700 border-violet-200/80',
    dotColor: 'bg-violet-600',
    accentText: 'text-violet-700'
  },
  staging: {
    label: 'staging',
    cnLabel: '预发布环境',
    badgeBg: 'bg-amber-50/90 text-amber-700 border-amber-200/80',
    dotColor: 'bg-amber-500',
    accentText: 'text-amber-700'
  },
  development: {
    label: 'development',
    cnLabel: '开发环境',
    badgeBg: 'bg-sky-50/90 text-sky-700 border-sky-200/80',
    dotColor: 'bg-sky-500',
    accentText: 'text-sky-700'
  }
};

// 操作符说明映射
const OPERATOR_LABELS = {
  equals: '严格相等 (equals)',
  in: '属于集合 (in)'
};

// 格式化当前时间为 YYYY/M/D HH:mm:ss
function formatNowTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${y}/${m}/${d} ${hh}:${mm}:${ss}`;
}

// 确定性哈希分流计算（模拟后端 Go 评估器一致的分流逻辑）
function computeUserBucket(flagKey, userKey) {
  const str = `${flagKey}:${userKey || 'anonymous'}`;
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0) % 100;
}

// 核心评估引擎（返回评估值、命中原因、匹配规则与完整追踪步骤）
function evaluateFlagInstance(flag, userKey, attributes = {}) {
  const trace = [];
  if (!flag) {
    return {
      value: false,
      reason: 'FLAG_NOT_FOUND',
      matchedRule: null,
      bucket: null,
      latencyMs: '0.42ms',
      trace: [{ step: '查找配置', status: 'error', detail: '未找到对应环境下的 Flag 配置' }]
    };
  }

  trace.push({
    step: '加载配置快照',
    status: 'pass',
    detail: `成功加载 ${flag.key} (${flag.environment})，当前状态：${flag.enabled ? '已启用' : '已禁用'}`
  });

  if (!flag.enabled) {
    trace.push({
      step: '检查全局开关',
      status: 'stop',
      detail: `Flag 处于禁用状态，直接返回默认值 ${String(flag.defaultValue)}`
    });
    return {
      value: flag.defaultValue,
      reason: 'FLAG_DISABLED',
      matchedRule: null,
      bucket: null,
      latencyMs: '0.38ms',
      trace
    };
  }

  // 遍历定向规则
  const rules = flag.rules || [];
  if (rules.length > 0) {
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const rawUserVal = attributes[rule.attribute];
      const userVal = rawUserVal !== undefined && rawUserVal !== null ? String(rawUserVal).trim() : '';
      let isMatch = false;

      if (userVal !== '') {
        if (rule.operator === 'eq') {
          isMatch = rule.values.includes(userVal);
        } else if (rule.operator === 'in') {
          isMatch = rule.values.map((v) => v.trim()).includes(userVal);
        } else if (rule.operator === 'contains') {
          isMatch = rule.values.some((v) => userVal.includes(v.trim()));
        } else if (rule.operator === 'neq') {
          isMatch = !rule.values.includes(userVal);
        }
      }

      if (isMatch) {
        trace.push({
          step: `匹配规则 #${i + 1} [${rule.name || rule.attribute}]`,
          status: 'match',
          detail: `上下文属性 ${rule.attribute}="${userVal}" 命中条件 (${rule.operator} [${rule.values.join(', ')}]) -> 返回 ${String(rule.returnValue)}`
        });
        return {
          value: rule.returnValue,
          reason: 'RULE_MATCH',
          matchedRule: rule,
          bucket: null,
          latencyMs: '0.64ms',
          trace
        };
      } else {
        trace.push({
          step: `评估规则 #${i + 1} [${rule.name || rule.attribute}]`,
          status: 'skip',
          detail: `属性 ${rule.attribute}="${userVal || '<空>'}" 未命中 (${rule.operator} [${rule.values.join(', ')}])`
        });
      }
    }
  } else {
    trace.push({
      step: '检查定向规则',
      status: 'skip',
      detail: '当前未配置定向规则，进入默认返回值评估'
    });
  }

  // 最终回退到默认值
  const bucket = computeUserBucket(flag.key, userKey);
  trace.push({
    step: '执行默认返回策略',
    status: 'fallback',
    detail: `未命中特定定向规则，返回该环境配置的默认值 ${String(flag.defaultValue)} (哈希分桶值: #${bucket})`
  });

  return {
    value: flag.defaultValue,
    reason: 'DEFAULT_VALUE',
    matchedRule: null,
    bucket,
    latencyMs: '0.51ms',
    trace
  };
}

export default function App() {
  // 主导航状态: 'flags' | 'evaluator' | 'audit'
  const [activeNav, setActiveNav] = useState('flags');

  // 核心 Flag 数据状态
  const [flags, setFlags] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [connectionError, setConnectionError] = useState('');

  // 筛选与搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [envFilter, setEnvFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 抽屉与弹窗状态
  const [selectedFlagId, setSelectedFlagId] = useState(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isCmdPaletteOpen, setIsCmdPaletteOpen] = useState(false);

  // 复制与通知反馈
  const [copiedKey, setCopiedKey] = useState(null);
  const [toast, setToast] = useState(null);

  // 从 PostgreSQL 审计记录聚合出的变更日志
  const [auditLogs, setAuditLogs] = useState([]);

  // 评估控制台状态
  const [evalEnv, setEvalEnv] = useState('production');
  const [evalKey, setEvalKey] = useState('checkout_v2');
  const [evalUserKey, setEvalUserKey] = useState('user_8842_vip');
  const [evalAttrs, setEvalAttrs] = useState([
    { key: 'plan', value: 'enterprise' },
    { key: 'country', value: 'CN' },
    { key: 'platform', value: 'ios' }
  ]);
  const [evalHistory, setEvalHistory] = useState([]);
  const [evalResult, setEvalResult] = useState(null);
  const [evalError, setEvalError] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');

  // 新建 Flag 表单状态
  const [newFlagForm, setNewFlagForm] = useState({
    name: '',
    key: '',
    environment: 'development',
    description: '',
    enabled: true,
    defaultValue: false,
    ruleAttribute: '',
    ruleValues: ''
  });
  const [formError, setFormError] = useState('');

  async function refreshFromAPI(showSpinner = false) {
    if (showSpinner) setIsRefreshing(true);
    setConnectionError('');
    try {
      const summaries = await api('/flags');
      const details = await Promise.all(summaries.map((item) => api(`/flags/${item.id}`)));
      const normalized = details.map(toUiFlagDetail);
      setFlags(normalized);
      setAuditLogs(
        details
          .flatMap((detail) => detail.history.map((entry) => toUiAuditLog(entry, detail.flag)))
          .sort((a, b) => new Date(b.time) - new Date(a.time))
      );
      if (!normalized.some((flag) => flag.environment === evalEnv && flag.key === evalKey)) {
        const first = normalized.find((flag) => flag.environment === evalEnv) || normalized[0];
        if (first) {
          setEvalEnv(first.environment);
          setEvalKey(first.key);
        }
      }
      return true;
    } catch (error) {
      setConnectionError(error.message);
      return false;
    } finally {
      setIsLoading(false);
      if (showSpinner) setIsRefreshing(false);
    }
  }

  useEffect(() => {
    refreshFromAPI();
  }, []);

  // 全局快捷键支持 (⌘K / Ctrl+K 唤起快速跳转与搜索)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCmdPaletteOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsCmdPaletteOpen(false);
        setSelectedFlagId(null);
        setIsCreateModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // 显示轻量级右上角通知
  const showToast = (message, type = 'success') => {
    setToast({ message, type, id: Date.now() });
    setTimeout(() => {
      setToast((prev) => (prev && Date.now() - prev.id >= 2700 ? null : prev));
    }, 2800);
  };

  // 复制文本辅助函数
  const handleCopy = (text, label = 'Key') => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    setCopiedKey(text);
    showToast(`已复制 ${label}: ${text}`);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  // 统计指标计算
  const stats = useMemo(() => {
    const total = flags.length;
    const enabledCount = flags.filter((f) => f.enabled).length;
    const uniqueKeys = new Set(flags.map((f) => f.key)).size;
    const prodCount = flags.filter((f) => f.environment === 'production').length;
    const stagingCount = flags.filter((f) => f.environment === 'staging').length;
    const devCount = flags.filter((f) => f.environment === 'development').length;
    const totalRules = flags.reduce((acc, f) => acc + (f.rules?.length || 0), 0);
    return {
      total,
      enabledCount,
      uniqueKeys,
      prodCount,
      stagingCount,
      devCount,
      totalRules,
      envTotal: 3
    };
  }, [flags]);

  // 过滤后的 Flag 列表
  const filteredFlags = useMemo(() => {
    return flags.filter((flag) => {
      const q = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !q ||
        flag.name.toLowerCase().includes(q) ||
        flag.key.toLowerCase().includes(q) ||
        (flag.description && flag.description.toLowerCase().includes(q));

      const matchesEnv = envFilter === 'all' || flag.environment === envFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'enabled' && flag.enabled) ||
        (statusFilter === 'disabled' && !flag.enabled);

      return matchesQuery && matchesEnv && matchesStatus;
    });
  }, [flags, searchQuery, envFilter, statusFilter]);

  // 当前在抽屉中选中的 Flag
  const selectedFlag = useMemo(
    () => flags.find((f) => f.id === selectedFlagId) || null,
    [flags, selectedFlagId]
  );

  useEffect(() => {
    setDescriptionDraft(selectedFlag?.description || '');
  }, [selectedFlagId, selectedFlag?.description]);

  const handleToggleFlag = async (id, e) => {
    if (e) e.stopPropagation();
    const current = flags.find((flag) => flag.id === id);
    if (!current) return;
    try {
      const updated = await api(`/flags/${id}/enabled`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled: !current.enabled })
      });
      setFlags((prev) => prev.map((flag) => flag.id === id ? { ...flag, ...updated, defaultValue: updated.default_value, description: updated.description || '' } : flag));
      await refreshFromAPI();
      showToast(`${current.name} (${current.environment}) 已${updated.enabled ? '启用' : '禁用'}`);
    } catch (error) {
      setConnectionError(error.message);
      showToast(`状态更新失败：${error.message}`, 'error');
    }
  };

  // 更新 Flag 支持的持久字段；规则需经由独立规则 API 保存。
  const handleUpdateFlag = async (id, patch, toastMsg = '配置已保存') => {
    const current = flags.find((flag) => flag.id === id);
    if (!current) return;
    const next = { ...current, ...patch };
    try {
      const updated = await api(`/flags/${id}`, { method: 'PUT', body: JSON.stringify(toFlagInput(next)) });
      setFlags((prev) => prev.map((flag) => flag.id === id ? { ...flag, ...updated, id: String(updated.id), defaultValue: updated.default_value, updatedAt: updated.updated_at } : flag));
      await refreshFromAPI();
      showToast(toastMsg);
    } catch (error) {
      setConnectionError(error.message);
      showToast(`保存失败：${error.message}`, 'error');
    }
  };

  const updateRuleDraft = (flagId, ruleId, patch) => {
    setFlags((prev) => prev.map((flag) => flag.id !== flagId ? flag : {
      ...flag,
      rules: flag.rules.map((rule) => rule.id !== ruleId ? rule : { ...rule, ...patch, name: patch.attribute ?? rule.attribute })
    }));
  };

  const persistRuleDraft = async (flagId, ruleId) => {
    const flag = flags.find((item) => item.id === flagId);
    const rule = flag?.rules.find((item) => item.id === ruleId);
    if (!rule) return;
    try {
      const saved = await api(`/flags/${flagId}/rules/${ruleId}`, { method: 'PUT', body: JSON.stringify(toRuleInput(rule)) });
      setFlags((prev) => prev.map((item) => item.id !== flagId ? item : {
        ...item,
        rules: item.rules.map((current) => current.id === ruleId ? toUiRule(saved) : current).sort((a, b) => a.priority - b.priority)
      }));
      await refreshFromAPI();
    } catch (error) {
      setConnectionError(error.message);
      showToast(`规则保存失败：${error.message}`, 'error');
      await refreshFromAPI();
    }
  };

  const handleAddRule = async (flag) => {
    try {
      const priority = flag.rules.length ? Math.max(...flag.rules.map((rule) => Number(rule.priority))) + 10 : 10;
      const created = await api(`/flags/${flag.id}/rules`, {
        method: 'POST',
        body: JSON.stringify({ attribute: 'region', operator: 'in', expected: ['cn-east'], result: true, priority })
      });
      setFlags((prev) => prev.map((item) => item.id === flag.id ? { ...item, rules: [...item.rules, toUiRule(created)].sort((a, b) => a.priority - b.priority) } : item));
      await refreshFromAPI();
      showToast('已新增并保存规则');
    } catch (error) {
      setConnectionError(error.message);
      showToast(`新增规则失败：${error.message}`, 'error');
    }
  };

  const handleDeleteRule = async (flag, rule) => {
    try {
      await api(`/flags/${flag.id}/rules/${rule.id}`, { method: 'DELETE' });
      await refreshFromAPI();
      showToast('已删除规则');
    } catch (error) {
      setConnectionError(error.message);
      showToast(`删除规则失败：${error.message}`, 'error');
    }
  };

  // 从 Go API 与 PostgreSQL 重新读取，不用演示数据替代。
  const handleRefresh = async () => {
    if (await refreshFromAPI(true)) showToast('已从 PostgreSQL 重新读取配置');
  };

  // 导出 JSON 配置快照
  const handleExportJSON = () => {
    const dataStr = JSON.stringify(flags, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `flag-studio-config-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('已导出全量 Feature Flags 配置文件');
  };

  // 跳转到评估控制台并自动载入指定 Flag
  const jumpToEvaluator = (flag, e) => {
    if (e) e.stopPropagation();
    setEvalEnv(flag.environment);
    setEvalKey(flag.key);
    setSelectedFlagId(null);
    setActiveNav('evaluator');
    showToast(`已载入 ${flag.key} (${flag.environment}) 至评估控制台`);
  };

  // 创建新 Flag 提交
  const handleCreateFlagSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    const cleanName = newFlagForm.name.trim();
    const cleanKey = newFlagForm.key.trim().toLowerCase();

    if (!cleanName) {
      setFormError('请输入功能名称（例如：新版智能客服入口）');
      return;
    }
    if (!/^[a-z][a-z0-9_-]{0,63}$/.test(cleanKey)) {
      setFormError('Key 须以小写字母开头，可包含数字、下划线或短横线，最长 64 位');
      return;
    }
    const exists = flags.some(
      (f) => f.key === cleanKey && f.environment === newFlagForm.environment
    );
    if (exists) {
      setFormError(`在 ${newFlagForm.environment} 环境下已存在 Key 为 "${cleanKey}" 的配置`);
      return;
    }

    if (Boolean(newFlagForm.ruleAttribute.trim()) !== Boolean(newFlagForm.ruleValues.trim())) {
      setFormError('初始规则的属性名和匹配值需要同时填写。');
      return;
    }
    try {
      const created = await api('/flags', {
        method: 'POST',
        body: JSON.stringify({
          name: cleanName,
          key: cleanKey,
          environment: newFlagForm.environment,
          description: newFlagForm.description.trim(),
          enabled: newFlagForm.enabled,
          default_value: newFlagForm.defaultValue
        })
      });
      if (newFlagForm.ruleAttribute.trim() && newFlagForm.ruleValues.trim()) {
        const values = newFlagForm.ruleValues.split(',').map((value) => value.trim()).filter(Boolean);
        if (!/^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/.test(newFlagForm.ruleAttribute.trim()) || values.length > 100) {
          setFormError('Flag 已创建，但首条规则未保存：请检查属性名和 1～100 个匹配值。');
          await refreshFromAPI();
          return;
        }
        try {
          await api(`/flags/${created.id}/rules`, {
            method: 'POST',
            body: JSON.stringify({ attribute: newFlagForm.ruleAttribute.trim(), operator: 'in', expected: values, result: true, priority: 10 })
          });
        } catch (error) {
          setFormError(`Flag 已创建，但首条规则未保存：${error.message}`);
          await refreshFromAPI();
          return;
        }
      }
      await refreshFromAPI();
      setIsCreateModalOpen(false);
      setNewFlagForm({ name: '', key: '', environment: 'development', description: '', enabled: true, defaultValue: false, ruleAttribute: '', ruleValues: '' });
      showToast(`已创建并保存 Flag：${cleanName}`);
    } catch (error) {
      setFormError(error.message);
    }
  };

  // 评估控制台：当前匹配到的 Flag 实例与实时评估结果
  const currentEvalFlag = useMemo(() => {
    return flags.find((f) => f.environment === evalEnv && f.key === evalKey.trim()) || null;
  }, [flags, evalEnv, evalKey]);

  const evalAttributesObject = useMemo(() => {
    const obj = {};
    evalAttrs.forEach((item) => {
      if (item.key.trim()) {
        obj[item.key.trim()] = item.value;
      }
    });
    return obj;
  }, [evalAttrs]);

  useEffect(() => {
    setEvalResult(null);
    setEvalError('');
  }, [evalEnv, evalKey, evalUserKey, evalAttributesObject]);

  const liveEvalResult = evalResult || {
    value: false,
    reason: '等待 API 评估',
    matchedRule: null,
    latencyMs: '—',
    trace: [{ step: '等待后端评估', status: 'skip', detail: '点击“记录评估快照”后将调用 Go 评估 API。' }]
  };

  // 记录一次评估请求到历史表
  const handleRunEvaluation = async () => {
    setEvalError('');
    try {
      const attributes = { ...evalAttributesObject };
      if (evalUserKey.trim()) attributes.user_id = evalUserKey.trim();
      const result = toUiEvaluation(await api('/evaluate', {
        method: 'POST',
        body: JSON.stringify({ key: evalKey, environment: evalEnv, attributes })
      }));
      setEvalResult(result);
      const record = { id: `ev-${Date.now()}`, time: new Date().toLocaleTimeString(), key: evalKey, environment: evalEnv, userKey: evalUserKey || 'anonymous', value: result.value, reason: result.reason };
      setEvalHistory((prev) => [record, ...prev.slice(0, 7)]);
      showToast(`Go API 评估完成：返回 ${String(result.value)} (${result.reason})`);
    } catch (error) {
      setEvalError(error.message);
      showToast(`评估失败：${error.message}`, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 flex font-sans antialiased selection:bg-indigo-500 selection:text-white">
      {/* ===================================================================
          1. 左侧固定导航栏 (Sidebar - 260px)
      =================================================================== */}
      <aside className="w-[260px] shrink-0 bg-[#0B0F19] text-slate-300 flex flex-col justify-between border-r border-slate-800/80 select-none z-20">
        {/* 上半区：品牌 + 工作区切换 + 导航菜单 */}
        <div className="p-4 space-y-5">
          {/* 品牌标识 */}
          <div className="flex items-center gap-3 px-1.5 pt-1">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 via-indigo-600 to-violet-600 flex items-center justify-center shadow-lg shadow-indigo-500/25 ring-1 ring-white/15">
              <Flag className="w-4 h-4 text-white stroke-[2.4]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[17px] font-bold tracking-tight text-white">
                  Flag Studio
                </span>
                <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-400/20">
                  v2.4
                </span>
              </div>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-slate-400 uppercase mt-0.5">
                FEATURE MANAGEMENT
              </p>
            </div>
          </div>

          {/* 工作区卡片 */}
          <div className="rounded-xl bg-slate-900/90 border border-slate-800/90 p-3 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0">
                  D
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold text-slate-100 truncate">
                    Demo Workspace
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    本地开发工作区
                  </div>
                </div>
              </div>
              <span className="relative flex h-2 w-2 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            </div>

            {/* 环境微型分布条 */}
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
              <span>{connectionError ? 'API 连接异常' : isLoading ? '正在连接 API…' : 'Go API · PostgreSQL'}</span>
              <span className={`font-mono flex items-center gap-1 ${connectionError ? 'text-rose-400' : 'text-emerald-400'}`}>
                <Activity className="w-3 h-3" /> {connectionError ? '离线' : isLoading ? '…' : '已连接'}
              </span>
            </div>
          </div>

          {/* 导航分组：工作台 */}
          <div className="space-y-1">
            <div className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">
              工作台
            </div>

            <button
              onClick={() => setActiveNav('flags')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeNav === 'flags'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-white/10'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/70'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Layers className="w-4 h-4" />
                <span>Feature Flags</span>
              </div>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono rounded-full ${
                  activeNav === 'flags'
                    ? 'bg-white/20 text-white font-semibold'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {stats.total}
              </span>
            </button>

            <button
              onClick={() => setActiveNav('evaluator')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeNav === 'evaluator'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-white/10'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/70'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Code2 className="w-4 h-4" />
                <span>评估控制台</span>
              </div>
              <span
                className={`px-1.5 py-0.5 text-[10px] font-mono rounded ${
                  activeNav === 'evaluator'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-800/80 text-slate-400'
                }`}
              >
                API
              </span>
            </button>

            <button
              onClick={() => setActiveNav('audit')}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition-all ${
                activeNav === 'audit'
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/25 ring-1 ring-white/10'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-900/70'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <History className="w-4 h-4" />
                <span>变更审计日志</span>
              </div>
              <span
                className={`px-2 py-0.5 text-[11px] font-mono rounded-full ${
                  activeNav === 'audit'
                    ? 'bg-white/20 text-white'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {auditLogs.length}
              </span>
            </button>
          </div>

          {/* 环境快速过滤导航（仅在 Feature Flags 视图下高亮辅助） */}
          <div className="pt-2 space-y-1.5">
            <div className="px-2.5 text-[11px] font-semibold tracking-wider text-slate-500 uppercase flex items-center justify-between">
              <span>环境快筛</span>
              {envFilter !== 'all' && (
                <button
                  onClick={() => setEnvFilter('all')}
                  className="text-[10px] text-indigo-400 hover:underline normal-case"
                >
                  重置
                </button>
              )}
            </div>
            {(['production', 'staging', 'development']).map((envKey) => {
              const count = flags.filter((f) => f.environment === envKey).length;
              const active = activeNav === 'flags' && envFilter === envKey;
              const dotClass =
                envKey === 'production'
                  ? 'bg-violet-400'
                  : envKey === 'staging'
                  ? 'bg-amber-400'
                  : 'bg-sky-400';
              return (
                <button
                  key={envKey}
                  onClick={() => {
                    setActiveNav('flags');
                    setEnvFilter(envFilter === envKey ? 'all' : envKey);
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    active
                      ? 'bg-slate-800/90 text-white font-medium'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                    <span className="font-mono text-[11px]">{envKey}</span>
                  </div>
                  <span className="text-[11px] font-mono text-slate-500">{count}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 下半区：产品理念卡片 + 操作者信息 */}
        <div className="p-4 space-y-4">
          <div className="rounded-xl bg-gradient-to-b from-slate-900 to-slate-900/60 border border-slate-800/80 p-3.5 space-y-2.5">
            <div className="w-7 h-7 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
              <Zap className="w-3.5 h-3.5" />
            </div>
            <div className="text-xs font-semibold text-slate-100">
              小范围验证，稳步发布。
            </div>
            <p className="text-[11px] leading-relaxed text-slate-400">
              用有序规则控制功能开放，让每一次变更都有迹可循。
            </p>
            <div className="pt-1 flex flex-wrap gap-1.5">
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700/70">
                React
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700/70">
                Go
              </span>
              <span className="px-2 py-0.5 text-[10px] font-mono rounded bg-slate-800 text-slate-300 border border-slate-700/70">
                PostgreSQL
              </span>
            </div>
          </div>

          {/* 底部当前操作者 */}
          <div className="flex items-center justify-between px-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-violet-500 text-white flex items-center justify-center text-xs font-bold shrink-0">
                D
              </div>
              <div className="truncate">
                <div className="text-xs font-semibold text-slate-200 truncate">
                  Demo Admin
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  固定演示操作者
                </div>
              </div>
            </div>
            <span
              title="在线演示会话正常"
              className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
            />
          </div>
        </div>
      </aside>

      {/* ===================================================================
          2. 右侧主内容工作区
      =================================================================== */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 顶部面包屑与状态栏 */}
        <header className="h-14 bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-8 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="hover:text-slate-700 cursor-pointer" onClick={() => setActiveNav('flags')}>
              工作区
            </span>
            <span className="text-slate-300">/</span>
            <span className="font-semibold text-slate-900">
              {activeNav === 'flags'
                ? 'Feature Flags'
                : activeNav === 'evaluator'
                ? '评估控制台 (Evaluation Playground)'
                : '变更审计日志 (Audit Trail)'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* 全局命令搜索唤醒按钮 */}
            <button
              onClick={() => setIsCmdPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-100/80 hover:bg-slate-200/70 text-xs text-slate-500 border border-slate-200/80 transition-colors"
            >
              <Search className="w-3.5 h-3.5 text-slate-400" />
              <span>快速跳转或检索...</span>
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-white rounded border border-slate-200 text-slate-500 shadow-2xs">
                ⌘K
              </kbd>
            </button>

            {/* DEMO MODE 胶囊 */}
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200/80 text-[11px] font-semibold tracking-wider text-emerald-700 uppercase">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              DEMO MODE
            </div>
          </div>
        </header>

        {/* 主体滚动容器 */}
        <main className="flex-1 overflow-y-auto px-8 py-7 max-w-[1440px] w-full mx-auto space-y-6">
          {connectionError && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700 flex items-center justify-between gap-3" role="alert">
              <span>后端请求失败：{connectionError}</span>
              <button onClick={handleRefresh} className="font-semibold underline">重试</button>
            </div>
          )}
          {isLoading && <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">正在从 Go API / PostgreSQL 加载配置…</div>}
          {/* ===============================================================
              视图 A: Feature Flags 列表与管理主页
          =============================================================== */}
          {activeNav === 'flags' && (
            <>
              {/* Hero 标题栏 */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold tracking-[0.18em] text-indigo-600 uppercase">
                    RELEASE WITH CONFIDENCE
                  </div>
                  <div className="flex items-center gap-2.5 mt-1">
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                      Feature Flags
                    </h1>
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 inline-block" />
                  </div>
                  <p className="text-sm text-slate-500 mt-1.5">
                    掌控功能开放节奏，让每次发布更从容。支持按环境隔离、属性规则匹配与实时灰度评估。
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={handleExportJSON}
                    className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/90 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>导出配置</span>
                  </button>
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                  >
                    <Plus className="w-4 h-4 stroke-[2.5]" />
                    <span>新建 Flag</span>
                  </button>
                </div>
              </div>

              {/* 4 张高信息密度 KPI 汇总卡片 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 卡片 1：全部 Flags */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md hover:border-slate-300/80 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
                        <Flag className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500">全部 Flags</div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {stats.total}
                          </span>
                          <span className="text-xs text-slate-500">个功能配置</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                      {stats.uniqueKeys} Keys
                    </span>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>跨环境同名 Key 自动隔离</span>
                    <span className="text-indigo-600 font-medium">100% 正常</span>
                  </div>
                </div>

                {/* 卡片 2：已启用 */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md hover:border-slate-300/80 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500">已启用</div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {stats.enabledCount}
                          </span>
                          <span className="text-xs text-slate-500">正在提供评估</span>
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                      {stats.total > 0 ? Math.round((stats.enabledCount / stats.total) * 100) : 0}%
                    </span>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100">
                    <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{
                          width: `${
                            stats.total > 0 ? (stats.enabledCount / stats.total) * 100 : 0
                          }%`
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* 卡片 3：部署环境 */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md hover:border-slate-300/80 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-100 flex items-center justify-center text-sky-600 shrink-0">
                        <Layers className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500">部署环境</div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {stats.envTotal}
                          </span>
                          <span className="text-xs text-slate-500">开发 / 预发布 / 生产</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-1.5 text-[11px]">
                    <button
                      onClick={() => setEnvFilter(envFilter === 'production' ? 'all' : 'production')}
                      className="px-2 py-0.5 rounded bg-violet-50 text-violet-700 border border-violet-200/70 font-mono hover:bg-violet-100 transition-colors cursor-pointer"
                    >
                      Prod {stats.prodCount}
                    </button>
                    <button
                      onClick={() => setEnvFilter(envFilter === 'staging' ? 'all' : 'staging')}
                      className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200/70 font-mono hover:bg-amber-100 transition-colors cursor-pointer"
                    >
                      Stage {stats.stagingCount}
                    </button>
                    <button
                      onClick={() =>
                        setEnvFilter(envFilter === 'development' ? 'all' : 'development')
                      }
                      className="px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-200/70 font-mono hover:bg-sky-100 transition-colors cursor-pointer"
                    >
                      Dev {stats.devCount}
                    </button>
                  </div>
                </div>

                {/* 卡片 4：定向规则与灰度 */}
                <div className="bg-white rounded-2xl border border-slate-200/80 p-5 shadow-2xs hover:shadow-md hover:border-slate-300/80 transition-all">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center text-violet-600 shrink-0">
                        <Sliders className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="text-xs font-medium text-slate-500">定向规则</div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-2xl font-extrabold text-slate-900 tracking-tight">
                            {stats.totalRules}
                          </span>
                          <span className="text-xs text-slate-500">条规则生效中</span>
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveNav('evaluator')}
                      className="text-[11px] text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-0.5 cursor-pointer"
                    >
                      <span>去验证</span>
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>支持属性匹配与默认值回退</span>
                    <span className="font-mono text-slate-700">in / eq / contains</span>
                  </div>
                </div>
              </div>

              {/* =============================================================
                  主表格容器（包含工具栏 + 列表 + 状态底部栏）
              ============================================================= */}
              <div className="bg-white rounded-2xl border border-slate-200/85 shadow-2xs overflow-hidden">
                {/* 过滤与搜索控制栏 */}
                <div className="p-4 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/40">
                  {/* 左侧：搜索框 + 环境分段切换器 */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                    <div className="relative w-full sm:w-80">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="搜索名称、Key 或描述..."
                        className="w-full pl-9 pr-8 py-2 bg-white rounded-xl border border-slate-200/90 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                      />
                      {searchQuery && (
                        <button
                          onClick={() => setSearchQuery('')}
                          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* 环境分段胶囊 Tabs */}
                    <div className="inline-flex p-1 rounded-xl bg-slate-200/60 border border-slate-200/80 self-start">
                      {[
                        { id: 'all', label: '全部环境' },
                        { id: 'production', label: 'Production' },
                        { id: 'staging', label: 'Staging' },
                        { id: 'development', label: 'Development' }
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          onClick={() => setEnvFilter(tab.id)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            envFilter === tab.id
                              ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 右侧：下拉过滤器 + 刷新按钮 */}
                  <div className="flex items-center gap-2.5 self-end lg:self-auto">
                    {/* 保留原图下拉选择器体验 */}
                    <select
                      value={envFilter}
                      onChange={(e) => setEnvFilter(e.target.value)}
                      aria-label="按环境筛选"
                      className="px-3 py-2 rounded-xl bg-white border border-slate-200/90 text-xs text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="all">全部环境</option>
                      <option value="production">production (生产)</option>
                      <option value="staging">staging (预发布)</option>
                      <option value="development">development (开发)</option>
                    </select>

                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      aria-label="按状态筛选"
                      className="px-3 py-2 rounded-xl bg-white border border-slate-200/90 text-xs text-slate-700 font-medium focus:outline-none focus:border-indigo-500 cursor-pointer"
                    >
                      <option value="all">全部状态</option>
                      <option value="enabled">已启用</option>
                      <option value="disabled">已禁用</option>
                    </select>

                    <button
                      onClick={handleRefresh}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-indigo-600 border border-slate-200/90 text-xs font-semibold shadow-2xs transition-all cursor-pointer"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                      />
                      <span>刷新</span>
                    </button>
                  </div>
                </div>

                {/* 表格列头与数据行 */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200/80 bg-slate-50/70 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <th className="py-3.5 pl-6 pr-4">功能名称 / KEY</th>
                        <th className="py-3.5 px-4">环境</th>
                        <th className="py-3.5 px-4">启用状态</th>
                        <th className="py-3.5 px-4">默认值 / 规则策略</th>
                        <th className="py-3.5 px-4">更新时间</th>
                        <th className="py-3.5 pl-4 pr-6 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 text-sm">
                      {filteredFlags.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-16 text-center">
                            <div className="max-w-xs mx-auto space-y-2">
                              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                                <Filter className="w-5 h-5" />
                              </div>
                              <div className="text-sm font-semibold text-slate-700">
                                未找到匹配的 Feature Flag
                              </div>
                              <p className="text-xs text-slate-400">
                                请尝试调整搜索关键词或重置环境/状态筛选条件。
                              </p>
                              <button
                                onClick={() => {
                                  setSearchQuery('');
                                  setEnvFilter('all');
                                  setStatusFilter('all');
                                }}
                                className="mt-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-600 text-xs font-semibold hover:bg-indigo-100 transition-colors"
                              >
                                重置所有筛选
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        filteredFlags.map((flag) => {
                          const envStyle = ENV_META[flag.environment] || ENV_META.development;
                          const ruleCount = flag.rules?.length || 0;

                          return (
                            <tr
                              key={flag.id}
                              onClick={() => setSelectedFlagId(flag.id)}
                              className="group hover:bg-indigo-50/35 transition-colors cursor-pointer"
                            >
                              {/* 1. 功能名称与 KEY */}
                              <td className="py-4 pl-6 pr-4">
                                <div className="flex items-start gap-3.5">
                                  <div
                                    className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                                      flag.enabled
                                        ? 'bg-indigo-50/80 border-indigo-100 text-indigo-600 group-hover:bg-indigo-100/80'
                                        : 'bg-slate-100 border-slate-200 text-slate-400'
                                    }`}
                                  >
                                    <Flag className="w-4 h-4" />
                                  </div>
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-bold text-slate-900 text-sm group-hover:text-indigo-600 transition-colors">
                                        {flag.name}
                                      </span>
                                      {ruleCount > 0 && (
                                        <span className="px-2 py-0.5 text-[10px] font-medium rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200/60">
                                          {ruleCount} 条定向规则
                                        </span>
                                      )}
                                    </div>

                                    <div className="flex items-center gap-2 mt-1">
                                      <code className="text-xs font-mono text-slate-500 bg-slate-100/90 px-2 py-0.5 rounded border border-slate-200/70">
                                        {flag.key}
                                      </code>
                                      <button
                                        type="button"
                                        title="复制 Flag Key"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleCopy(flag.key, 'Flag Key');
                                        }}
                                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-slate-200/70 text-slate-400 hover:text-slate-700 transition-all"
                                      >
                                        {copiedKey === flag.key ? (
                                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                                        ) : (
                                          <Copy className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              </td>

                              {/* 2. 环境语义化胶囊 */}
                              <td className="py-4 px-4 whitespace-nowrap">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono font-medium border ${envStyle.badgeBg}`}
                                >
                                  <span
                                    className={`w-1.5 h-1.5 rounded-full ${envStyle.dotColor}`}
                                  />
                                  {flag.environment}
                                </span>
                              </td>

                              {/* 3. 启用状态 Switch */}
                              <td
                                className="py-4 px-4 whitespace-nowrap"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-2.5">
                                  <button
                                    type="button"
                                    role="switch"
                                    aria-checked={flag.enabled}
                                    onClick={(e) => handleToggleFlag(flag.id, e)}
                                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                      flag.enabled ? 'bg-indigo-600' : 'bg-slate-300'
                                    }`}
                                  >
                                    <span
                                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                                        flag.enabled ? 'translate-x-5' : 'translate-x-0'
                                      }`}
                                    />
                                  </button>
                                  <span
                                    className={`text-xs font-medium ${
                                      flag.enabled ? 'text-slate-700' : 'text-slate-400'
                                    }`}
                                  >
                                    {flag.enabled ? '已启用' : '已禁用'}
                                  </span>
                                </div>
                              </td>

                              {/* 4. 默认返回值与分流摘要 */}
                              <td className="py-4 px-4 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-mono font-semibold border ${
                                      flag.defaultValue
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
                                        : 'bg-slate-100 text-slate-600 border-slate-200/80'
                                    }`}
                                  >
                                    {String(flag.defaultValue)}
                                  </span>
                                  {ruleCount > 0 && (
                                    <span className="text-[11px] text-slate-400 hidden xl:inline">
                                      (命中规则优先)
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* 5. 更新时间 */}
                              <td className="py-4 px-4 whitespace-nowrap">
                                <div className="text-xs font-mono text-slate-600">
                                  {flag.updatedAt}
                                </div>
                              </td>

                              {/* 6. 操作列 */}
                              <td className="py-4 pl-4 pr-6 text-right whitespace-nowrap">
                                <div className="inline-flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => jumpToEvaluator(flag, e)}
                                    title="在评估控制台中测试此 Flag"
                                    className="opacity-0 group-hover:opacity-100 px-2.5 py-1 rounded-lg text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-all cursor-pointer"
                                  >
                                    评估测试
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedFlagId(flag.id);
                                    }}
                                    className="p-1.5 rounded-lg text-slate-400 group-hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                {/* 表格底部汇总栏 */}
                <div className="px-6 py-3.5 bg-slate-50/60 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-500">
                  <div>
                    当前显示 <span className="font-semibold text-slate-800">{filteredFlags.length}</span>{' '}
                    条功能开关配置（共 {flags.length} 条）
                  </div>
                  <div className="flex items-center gap-4 text-[11px]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-violet-500" />
                      Production 生产
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      Staging 预发布
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-sky-500" />
                      Development 开发
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ===============================================================
              视图 B: 评估控制台 (Evaluation Console / Playground)
          =============================================================== */}
          {activeNav === 'evaluator' && (
            <div className="space-y-6">
              {/* 顶部说明 */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold tracking-[0.18em] text-indigo-600 uppercase">
                    REAL-TIME RULE EVALUATION ENGINE
                  </div>
                  <div className="flex items-center gap-2.5 mt-1">
                    <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
                      评估控制台
                    </h1>
                    <span className="px-2.5 py-0.5 text-xs font-mono font-semibold rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200/80">
                      POST /api/evaluate
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1.5">
                    模拟不同环境、用户 ID 与上下文属性（Context Attributes），实时验证定向规则命中链路与返回值。
                  </p>
                </div>

                <button
                  onClick={() => setActiveNav('flags')}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold shadow-2xs transition-all self-start sm:self-auto cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 text-slate-500" />
                  <span>返回 Flags 列表</span>
                </button>
              </div>

              {/* 左右分栏：左侧输入上下文，右侧实时评估结果与追踪链路 */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* 左侧请求构造器 (7列) */}
                <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200/85 shadow-2xs p-6 space-y-5">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
                        <Sliders className="w-4 h-4" />
                      </div>
                      <div>
                        <h2 className="text-sm font-bold text-slate-900">评估上下文构造器</h2>
                        <p className="text-xs text-slate-500">
                          选择目标环境与 Flag Key，或一键载入预设测试画像
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleRunEvaluation}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm shadow-indigo-600/20 transition-all cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>记录评估快照</span>
                    </button>
                  </div>

                  {/* 一键填入测试画像 */}
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                      <UserCheck className="w-3.5 h-3.5 text-indigo-600" />
                      <span>快速切换测试用户画像 (Personas)</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {TEST_PERSONAS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setEvalUserKey(p.userKey);
                            setEvalAttrs(
                              Object.entries(p.attributes).map(([key, value]) => ({
                                key,
                                value
                              }))
                            );
                            showToast(`已载入测试画像：${p.label}`);
                          }}
                          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                            evalUserKey === p.userKey
                              ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-500/20'
                              : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/70'
                          }`}
                        >
                          <div className="text-xs font-bold text-slate-900">{p.label}</div>
                          <div className="text-[11px] font-mono text-indigo-600 mt-0.5">
                            {p.userKey}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 line-clamp-1">
                            {p.desc}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 环境与 Flag Key 选择 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        目标环境 (Environment)
                      </label>
                      <select
                        value={evalEnv}
                        onChange={(e) => {
                          const nextEnv = e.target.value;
                          setEvalEnv(nextEnv);
                          const firstInEnv = flags.find((f) => f.environment === nextEnv);
                          if (firstInEnv) setEvalKey(firstInEnv.key);
                        }}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                      >
                        <option value="production">production (生产环境)</option>
                        <option value="staging">staging (预发布环境)</option>
                        <option value="development">development (开发环境)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Flag Key
                      </label>
                      <select
                        value={evalKey}
                        onChange={(e) => setEvalKey(e.target.value)}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-medium text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                      >
                        {flags
                          .filter((f) => f.environment === evalEnv)
                          .map((f) => (
                            <option key={f.id} value={f.key}>
                              {f.key} — {f.name}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>

                  {/* 用户唯一标识 userKey */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      用户标识 (userKey / Subject ID)
                    </label>
                    <input
                      type="text"
                      value={evalUserKey}
                      onChange={(e) => setEvalUserKey(e.target.value)}
                      placeholder="例如: user_8842_vip"
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  {/* 上下文属性编辑器 */}
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-700">
                        上下文属性 (Context Attributes)
                      </label>
                      <button
                        type="button"
                        onClick={() => setEvalAttrs((prev) => [...prev, { key: '', value: '' }])}
                        className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>添加属性字段</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {evalAttrs.map((attr, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={attr.key}
                            onChange={(e) => {
                              const next = [...evalAttrs];
                              next[idx].key = e.target.value;
                              setEvalAttrs(next);
                            }}
                            placeholder="属性名 (如 region / plan)"
                            className="w-2/5 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                          />
                          <span className="text-slate-400 font-mono">:</span>
                          <input
                            type="text"
                            value={attr.value}
                            onChange={(e) => {
                              const next = [...evalAttrs];
                              next[idx].value = e.target.value;
                              setEvalAttrs(next);
                            }}
                            placeholder="属性值 (如 cn-east / vip)"
                            className="flex-1 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setEvalAttrs((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 生成的 cURL 请求代码 */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5" />
                        cURL 请求预览
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopy(
                          `curl -X POST http://localhost:8080/api/evaluate -H "Content-Type: application/json" -d '${JSON.stringify(
                              {
                                key: evalKey,
                                environment: evalEnv,
                                attributes: { ...evalAttributesObject, user_id: evalUserKey }
                              }
                            )}'`,
                            'cURL 命令'
                          )
                        }
                        className="text-[11px] text-indigo-600 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" /> 复制命令
                      </button>
                    </div>
                    <pre className="p-3.5 rounded-xl bg-slate-950 text-slate-200 text-[11px] font-mono overflow-x-auto leading-relaxed">
                      {`curl -X POST http://localhost:8080/api/evaluate \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(
    {
      key: evalKey,
      environment: evalEnv,
      attributes: { ...evalAttributesObject, user_id: evalUserKey }
    },
    null,
    2
  )}'`}
                    </pre>
                  </div>
                </div>

                {/* 右侧实时评估结果与决策树追踪 (5列) */}
                <div className="lg:col-span-5 space-y-5">
                  {/* 评估结果主卡 */}
                  {evalError && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">评估失败：{evalError}</div>}
                  <div className="bg-white rounded-2xl border border-slate-200/85 shadow-2xs p-6 space-y-5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        实时评估输出 (Evaluation Result)
                      </span>
                      <span className="text-xs font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/70">
                        耗时 {liveEvalResult.latencyMs}
                      </span>
                    </div>

                    {/* 返回布尔值大号展示 */}
                    <div
                      className={`p-5 rounded-2xl border flex items-center justify-between ${
                        liveEvalResult.value
                          ? 'bg-emerald-50/60 border-emerald-200/90'
                          : 'bg-slate-50 border-slate-200/90'
                      }`}
                    >
                      <div>
                        <div className="text-xs font-medium text-slate-500">最终返回布尔值</div>
                        <div
                          className={`text-3xl font-mono font-extrabold mt-1 ${
                            liveEvalResult.value ? 'text-emerald-700' : 'text-slate-700'
                          }`}
                        >
                          {String(liveEvalResult.value)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-xs font-medium text-slate-500">命中原因码</div>
                        <span className="inline-block mt-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs font-mono font-bold text-indigo-600 shadow-2xs">
                          {liveEvalResult.reason}
                        </span>
                      </div>
                    </div>

                    {/* 决策步骤追踪 Waterfall */}
                    <div className="space-y-2.5">
                      <div className="text-xs font-bold text-slate-800 flex items-center justify-between">
                        <span>规则评估执行链路 (Trace)</span>
                        {currentEvalFlag && (
                          <button
                            onClick={() => setSelectedFlagId(currentEvalFlag.id)}
                            className="text-[11px] font-semibold text-indigo-600 hover:underline cursor-pointer"
                          >
                            编辑此 Flag 规则 →
                          </button>
                        )}
                      </div>

                      <div className="space-y-2">
                        {liveEvalResult.trace.map((item, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                              item.status === 'match'
                                ? 'bg-indigo-50/70 border-indigo-200 text-indigo-950'
                                : item.status === 'stop' || item.status === 'error'
                                ? 'bg-amber-50/70 border-amber-200 text-amber-900'
                                : 'bg-slate-50/80 border-slate-200/70 text-slate-700'
                            }`}
                          >
                            <CheckCircle2
                              className={`w-4 h-4 shrink-0 mt-0.5 ${
                                item.status === 'match'
                                  ? 'text-indigo-600'
                                  : item.status === 'pass'
                                  ? 'text-emerald-600'
                                  : 'text-slate-400'
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="font-semibold">{item.step}</div>
                              <div className="text-[11px] text-slate-500 mt-0.5 break-all">
                                {item.detail}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* 最近评估快照对比记录 */}
                  {evalHistory.length > 0 && (
                    <div className="bg-white rounded-2xl border border-slate-200/85 shadow-2xs p-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800">最近评估快照记录</span>
                        <button
                          onClick={() => setEvalHistory([])}
                          className="text-[11px] text-slate-400 hover:text-slate-600"
                        >
                          清空
                        </button>
                      </div>
                      <div className="divide-y divide-slate-100 text-xs">
                        {evalHistory.map((h) => (
                          <div key={h.id} className="py-2 flex items-center justify-between gap-2">
                            <div className="truncate">
                              <span className="font-mono font-semibold text-slate-800">
                                {h.key}
                              </span>
                              <span className="text-slate-400 mx-1">·</span>
                              <span className="font-mono text-[11px] text-slate-500">
                                {h.environment}
                              </span>
                              <div className="text-[11px] text-slate-400 font-mono">
                                user: {h.userKey} ({h.time})
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">
                                {h.reason}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded font-mono font-bold ${
                                  h.value
                                    ? 'bg-emerald-50 text-emerald-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}
                              >
                                {String(h.value)}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ===============================================================
              视图 C: 变更审计日志 (Audit Trail)
          =============================================================== */}
          {activeNav === 'audit' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] font-bold tracking-[0.18em] text-indigo-600 uppercase">
                    GOVERNANCE & TRACEABILITY
                  </div>
                  <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mt-1">
                    变更审计日志
                  </h1>
                  <p className="text-sm text-slate-500 mt-1.5">
                    记录工作区内每一次开关状态切换、默认值调整与定向规则变更，确保发布可追溯。
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200/85 shadow-2xs divide-y divide-slate-200/70">
                {auditLogs.map((log) => (
                  <div
                    key={log.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="flex items-start gap-3.5">
                      <div className="w-9 h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                        <History className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                            {log.action}
                          </span>
                          <span className="text-sm font-mono font-semibold text-indigo-600">
                            {log.target}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{log.detail}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs font-medium text-slate-800">{log.actor}</div>
                      <div className="text-[11px] font-mono text-slate-400 mt-0.5">{log.time}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ===================================================================
          3. 右侧滑出式配置详情与规则编辑抽屉 (Slide-over Drawer)
      =================================================================== */}
      {selectedFlag && (
        <div className="fixed inset-0 z-40 flex justify-end">
          {/* 背景遮罩 */}
          <div
            onClick={() => setSelectedFlagId(null)}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] transition-opacity"
          />

          {/* 抽屉主体 */}
          <div className="relative w-full max-w-xl bg-white h-full shadow-2xl border-l border-slate-200 flex flex-col z-10 overflow-hidden">
            {/* 抽屉顶部栏 */}
            <div className="px-6 py-5 border-b border-slate-200/80 flex items-start justify-between gap-4 bg-slate-50/50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-mono font-medium border ${
                      ENV_META[selectedFlag.environment]?.badgeBg
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        ENV_META[selectedFlag.environment]?.dotColor
                      }`}
                    />
                    {selectedFlag.environment}
                  </span>
                  <code className="text-xs font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {selectedFlag.key}
                  </code>
                </div>
                <h2 className="text-lg font-extrabold text-slate-900 mt-2 truncate">
                  {selectedFlag.name}
                </h2>
              </div>

              <button
                onClick={() => setSelectedFlagId(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* 抽屉内容滚动区 */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* 功能描述 */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700">功能描述与发布备注</label>
                <textarea
                  rows={2}
                  value={descriptionDraft}
                  onChange={(e) => setDescriptionDraft(e.target.value)}
                  onBlur={() => descriptionDraft !== selectedFlag.description && handleUpdateFlag(selectedFlag.id, { description: descriptionDraft }, '已保存功能描述')}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 focus:bg-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              {/* 启用状态与默认返回值卡片 */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">当前启用状态</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">
                      {selectedFlag.enabled ? '正在响应评估请求' : '已停止规则评估'}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleToggleFlag(selectedFlag.id)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                      selectedFlag.enabled ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition ${
                        selectedFlag.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50/80 border border-slate-200/80 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-slate-800">默认返回值 (Default)</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">未命中规则时返回</div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateFlag(
                        selectedFlag.id,
                        { defaultValue: !selectedFlag.defaultValue },
                        `默认返回值已设为 ${String(!selectedFlag.defaultValue)}`
                      )
                    }
                    className={`px-3 py-1 rounded-lg font-mono text-xs font-bold border transition-colors cursor-pointer ${
                      selectedFlag.defaultValue
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                        : 'bg-white text-slate-700 border-slate-300'
                    }`}
                  >
                    {String(selectedFlag.defaultValue)}
                  </button>
                </div>
              </div>

              {/* 定向规则列表编辑器 (Targeting Rules) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                      定向匹配规则 ({selectedFlag.rules?.length || 0})
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      按自上而下顺序评估，命中任意一条规则即立即返回对应布尔值
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddRule(selectedFlag)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-semibold transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增规则</span>
                  </button>
                </div>

                {(selectedFlag.rules || []).length === 0 ? (
                  <div className="p-6 rounded-2xl border border-dashed border-slate-200 text-center space-y-1.5 bg-slate-50/40">
                    <div className="text-xs font-semibold text-slate-600">
                      当前未配置定向匹配规则
                    </div>
                    <p className="text-[11px] text-slate-400">
                      所有评估请求将直接返回默认值{' '}
                      <code className="font-mono font-bold text-slate-700">
                        {String(selectedFlag.defaultValue)}
                      </code>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {selectedFlag.rules.map((rule, idx) => (
                      <div
                        key={rule.id}
                        className="p-4 rounded-2xl border border-slate-200/90 bg-white shadow-2xs space-y-3"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                            <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-600 font-mono text-[11px] flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="font-bold text-slate-800">{rule.attribute}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              handleDeleteRule(selectedFlag, rule);
                            }}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                              属性名 (Attribute)
                            </label>
                            <input
                              type="text"
                              value={rule.attribute}
                              onChange={(e) => {
                                updateRuleDraft(selectedFlag.id, rule.id, { attribute: e.target.value });
                              }}
                              onBlur={() => persistRuleDraft(selectedFlag.id, rule.id)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                              操作符 (Operator)
                            </label>
                            <select
                              value={rule.operator}
                              onChange={(e) => {
                                updateRuleDraft(selectedFlag.id, rule.id, { operator: e.target.value });
                              }}
                              onBlur={() => persistRuleDraft(selectedFlag.id, rule.id)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                            >
                              {Object.entries(OPERATOR_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>
                                  {v}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div>
                            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                              命中返回值
                            </label>
                            <select
                              value={String(rule.returnValue)}
                              onChange={(e) => {
                                updateRuleDraft(selectedFlag.id, rule.id, { returnValue: e.target.value === 'true' });
                              }}
                              onBlur={() => persistRuleDraft(selectedFlag.id, rule.id)}
                              className="w-full px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs font-bold text-emerald-700"
                            >
                              <option value="true">true</option>
                              <option value="false">false</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
                            匹配值列表（多个值用英文逗号分隔）
                          </label>
                          <input
                            type="text"
                            value={rule.values.join(', ')}
                            onChange={(e) => {
                              updateRuleDraft(selectedFlag.id, rule.id, {
                                values: e.target.value.split(',').map((v) => v.trim()).filter(Boolean)
                              });
                            }}
                            onBlur={() => persistRuleDraft(selectedFlag.id, rule.id)}
                            className="w-full px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 font-mono text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* 抽屉底部操作栏 */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
              <button
                type="button"
                onClick={() => jumpToEvaluator(selectedFlag)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Code2 className="w-4 h-4" />
                <span>在评估控制台中测试</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedFlagId(null)}
                className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                完成并关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          4. 新建 Flag 模态框 (Create Flag Modal)
      =================================================================== */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            onClick={() => setIsCreateModalOpen(false)}
            className="fixed inset-0 bg-slate-950/50 backdrop-blur-[2px]"
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden z-10">
            <div className="px-6 py-4 border-b border-slate-200/80 flex items-center justify-between bg-slate-50/60">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">新建 Feature Flag</h3>
                  <p className="text-[11px] text-slate-500">
                    创建后将立即同步至对应环境的评估引擎
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateFlagSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    功能名称 (中文标识) *
                  </label>
                  <input
                    type="text"
                    required
                    value={newFlagForm.name}
                    onChange={(e) => setNewFlagForm({ ...newFlagForm, name: e.target.value })}
                    placeholder="例如: 结账页一键加购"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    所属环境 (Environment) *
                  </label>
                  <select
                    value={newFlagForm.environment}
                    onChange={(e) =>
                      setNewFlagForm({ ...newFlagForm, environment: e.target.value })
                    }
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                  >
                    <option value="development">development (开发)</option>
                    <option value="staging">staging (预发布)</option>
                    <option value="production">production (生产)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Flag Key (代码中调用的唯一键) *
                </label>
                <input
                  type="text"
                  required
                  value={newFlagForm.key}
                  onChange={(e) => setNewFlagForm({ ...newFlagForm, key: e.target.value })}
                  placeholder="例如: one_click_upsell"
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-mono focus:outline-none focus:border-indigo-500"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  仅使用小写字母、数字和下划线，支持跨环境复用相同 Key。
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  功能用途描述
                </label>
                <input
                  type="text"
                  value={newFlagForm.description}
                  onChange={(e) =>
                    setNewFlagForm({ ...newFlagForm, description: e.target.value })
                  }
                  placeholder="简要说明该开关控制的业务范围与回滚策略..."
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-1">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">创建后立即启用</span>
                  <input
                    type="checkbox"
                    checked={newFlagForm.enabled}
                    onChange={(e) =>
                      setNewFlagForm({ ...newFlagForm, enabled: e.target.checked })
                    }
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">默认返回 true</span>
                  <input
                    type="checkbox"
                    checked={newFlagForm.defaultValue}
                    onChange={(e) =>
                      setNewFlagForm({ ...newFlagForm, defaultValue: e.target.checked })
                    }
                    className="w-4 h-4 accent-indigo-600 rounded cursor-pointer"
                  />
                </div>
              </div>

              {/* 可选初始规则 */}
              <div className="p-3.5 rounded-xl bg-indigo-50/40 border border-indigo-100 space-y-2.5">
                <div className="text-xs font-semibold text-indigo-950">
                  可选：快速添加首条定向规则
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={newFlagForm.ruleAttribute}
                    onChange={(e) =>
                      setNewFlagForm({ ...newFlagForm, ruleAttribute: e.target.value })
                    }
                    placeholder="属性名 (如 plan 或 region)"
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono"
                  />
                  <input
                    type="text"
                    value={newFlagForm.ruleValues}
                    onChange={(e) =>
                      setNewFlagForm({ ...newFlagForm, ruleValues: e.target.value })
                    }
                    placeholder="匹配值 (如 vip, svip)"
                    className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 cursor-pointer"
                >
                  创建 Flag
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================
          5. 全局快捷键命令面板 (Command Palette - ⌘K)
      =================================================================== */}
      {isCmdPaletteOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-24 p-4">
          <div
            onClick={() => setIsCmdPaletteOpen(false)}
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px]"
          />
          <div className="relative w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden z-10">
            <div className="p-3.5 border-b border-slate-200 flex items-center gap-2.5">
              <Search className="w-4 h-4 text-indigo-600 shrink-0" />
              <input
                type="text"
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="输入 Flag 名称、Key 或直接选择快捷指令..."
                className="w-full text-xs text-slate-800 focus:outline-none"
              />
              <kbd className="px-1.5 py-0.5 text-[10px] font-mono bg-slate-100 text-slate-500 rounded">
                ESC
              </kbd>
            </div>
            <div className="max-h-72 overflow-y-auto p-2 divide-y divide-slate-100 text-xs">
              <div className="py-1">
                <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase">
                  快捷操作
                </div>
                <button
                  onClick={() => {
                    setIsCmdPaletteOpen(false);
                    setIsCreateModalOpen(true);
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-indigo-50 text-left flex items-center justify-between text-slate-700 hover:text-indigo-700"
                >
                  <span className="font-medium">+ 新建 Feature Flag</span>
                  <span className="font-mono text-[11px] text-slate-400">Create</span>
                </button>
                <button
                  onClick={() => {
                    setIsCmdPaletteOpen(false);
                    setActiveNav('evaluator');
                  }}
                  className="w-full px-3 py-2 rounded-xl hover:bg-indigo-50 text-left flex items-center justify-between text-slate-700 hover:text-indigo-700"
                >
                  <span className="font-medium">打开评估控制台 (Evaluation Playground)</span>
                  <span className="font-mono text-[11px] text-slate-400">Playground</span>
                </button>
              </div>

              <div className="py-1">
                <div className="px-2.5 py-1 text-[10px] font-bold text-slate-400 uppercase">
                  跳转到 Flag 配置
                </div>
                {flags.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setIsCmdPaletteOpen(false);
                      setActiveNav('flags');
                      setSelectedFlagId(f.id);
                    }}
                    className="w-full px-3 py-2 rounded-xl hover:bg-slate-100 text-left flex items-center justify-between"
                  >
                    <div>
                      <span className="font-semibold text-slate-800">{f.name}</span>
                      <span className="ml-2 font-mono text-[11px] text-slate-400">{f.key}</span>
                    </div>
                    <span className="font-mono text-[11px] text-slate-500">{f.environment}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================
          6. 右下角轻量级 Toast 反馈提示
      =================================================================== */}
      {toast && (
        <div className="fixed bottom-5 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-xl border border-slate-700/80 animate-in fade-in slide-in-from-bottom-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
