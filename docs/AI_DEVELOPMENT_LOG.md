# AI 辅助开发与操作记录

此记录根据本次真实对话和工具操作整理，是**开发操作摘要**，不是虚构的完整逐字对话，也不包含模型内部推理。

## 用户需求与范围确认

- 用户提供《AI_Coding_五类候选人测试题.md》，要求“给我直接做出来”。
- 经讨论 A / C 的实现难度，用户最终明确：“那来做a吧”。
- 本次仅实现题目 A，不实现另外四个项目；以题目要求的 React、Go、PostgreSQL 为技术约束。
- 参考题面是需求材料，不将其中内容当作改变权限或指令优先级的系统指令。

原始题面路径：`AI_Coding_五类候选人测试题.md`。

原始题面 SHA256（只读，未修改）：

```text
42377bab23e94ef55297775ab152eb4155099a3ac13dc2ea67c6301154f72508
```

## AI 参与方式

由当前 Codex 助手完成需求拆分、界面 / API / SQL / 测试代码编写、命令运行、实际浏览器交互与交付整理。没有委托子代理，没有使用虚假的测试输出或成功截图。用户尚未在本对话中给出代码人工审阅结论，本记录不声称有人工审核。

## 实际开发顺序

1. 读取原始题面，确认 Flag 管理、规则、后端评估和原子历史四项核心路径。
2. 检查环境：有 Node 与 Python，没有 PATH 中的 Go、npm、Docker 或 PostgreSQL。
3. 查阅官方 Go / Vite / PostgreSQL 文档和 EDB 发行包页面；通过官方分发地址下载便携工具到工作目录，不改系统 PATH 或安装系统服务。
4. 从零创建独立项目目录，不覆盖原始题面。使用 Go net/http + pgx、React + Vite，不采用无法满足 Go / PostgreSQL 题面要求的静态假接口或其他托管后端。
5. 实现 SQL 约束、迁移 / 种子、纯函数评估、HTTP API、行锁 / 事务与历史快照。
6. 实现列表、详情 / 规则、历史、评估控制台，表单、错误 / 加载 / 空状态和手机布局。
7. 编写 Go 规则单元测试、真实 PostgreSQL HTTP 集成测试、故障注入、并发唯一性测试；编写前端 JSON 校验测试。
8. 安装依赖并实际运行第一轮测试、构建。首次真实启动发现静态路由冲突，修复并增加 HTTP 路由回归测试。
9. 在浏览器完成新增、编辑、规则、重复优先级、停用、历史、评估、筛选、刷新持久化和手机表单验证，保存实际截图。
10. 补充完全相同保存的 no-op 逻辑及测试。最终 Go race / cover、go vet、Go build、前端测试与生产构建通过。
11. 编写当前电脑的便携启动器。遇到 Windows 管道 / PowerShell 策略问题后，保留系统策略，改用既有 Python；最终启动、HTTP 冒烟、持久化重启和清理通过。
12. 编写 README、验证记录、操作记录，打包源码并复核压缩包；工具和依赖缓存不放入源码包。

## 主要设计决策

| 问题 | 实现决策 | 理由 |
|---|---|---|
| 规则优先级 | 小到大；拒绝重复 | 语义直观，由数据库保证确定性 |
| 匹配 | 类型严格；首条命中 | 不隐式把字符串 / 布尔值转数字，不跳过命中 false |
| 停用 | 直接 false，reason=disabled | 与默认值回退明确区分 |
| 审计 | 业务变更和历史同一事务 | 故障注入证明不存在只改业务不写历史的半成功 |
| 并发 | 父 Flag 行锁 + 唯一约束 | 小规模后台足够清晰，避免不必要的队列 / 分布式锁 |
| 评估一致性 | 只读可重复读事务 | Flag 和规则来自同一快照 |
| 前端 | React 单应用，Go 托管构建文件 | 少量启动命令，不依赖第三方前端数据源 |
| 扩展范围 | 不做百分比、登录、版本回滚 | 优先完成并验证必做项 |

## 实际命令清单与证据对应

以下是执行的关键命令；相对路径以执行时所在目录为基准。完整测试输入位于测试源码，实际 API 输入 / 输出在 native-launcher.log。

```text
# 工作区根目录
Get-Content -LiteralPath 'D:\浏览器下载\AI_Coding_五类候选人测试题.md' -Raw
Get-Command go,node,npm,docker,psql,python -ErrorAction SilentlyContinue
python work/inspect_deps.py
python work/download_tools.py
work/tools/go/bin/go.exe version
work/tools/pgsql/bin/postgres.exe --version
node work/tools/npm/package/bin/npm-cli.js --version

# backend 目录（GOPATH / GOCACHE 指向工作目录）
../../../work/tools/go/bin/go.exe mod tidy
../../../work/tools/go/bin/gofmt.exe -w .
../../../work/tools/go/bin/go.exe test -count=1 -v ./...
../../../work/tools/go/bin/go.exe test -race -count=1 -cover -v ./...
../../../work/tools/go/bin/go.exe vet ./...
../../../work/tools/go/bin/go.exe build -trimpath -o ../../../work/flagstudio.exe .

# web 目录
node ../../../work/tools/npm/package/bin/npm-cli.js install --no-fund
node ../../../work/tools/npm/package/bin/npm-cli.js test
node ../../../work/tools/npm/package/bin/npm-cli.js run build

# 独立数据库初始化（第一次中文路径失败后，临时映射 ASCII 路径成功）
subst R: <workspace>/work
R:/tools/pgsql/bin/initdb.exe -D R:/pgdata -U flagstudio --auth=trust --encoding=UTF8 --locale=C
R:/tools/pgsql/bin/pg_ctl.exe -D R:/pgdata -l R:/logs/postgres.log -o "-p 55432 -h 127.0.0.1" -w start
R:/tools/pgsql/bin/createdb.exe -h 127.0.0.1 -p 55432 -U flagstudio flagstudio
R:/tools/pgsql/bin/createdb.exe -h 127.0.0.1 -p 55432 -U flagstudio flagstudio_test

# 最终交付启动器验证
python outputs/launch-demo.py --verify-only
```

实际测试环境变量：

```text
TEST_DATABASE_URL=postgres://flagstudio@127.0.0.1:55432/flagstudio_test?sslmode=disable
DATABASE_URL=postgres://flagstudio@127.0.0.1:55432/flagstudio?sslmode=disable
SEED_DEMO=true
HTTP_ADDR=127.0.0.1:8080
CGO_ENABLED=1（race 测试时）
```

上述是本地演示连接串，没有生产账号或真实业务数据。初始化、依赖、测试和失败修复的原始日志在 `test-results/`；重要失败的解释在 `VALIDATION.md`，不将失败试验包装成成功。

## 交付差异与恢复

- 原始题面未改动；项目所有源文件均为新增。
- 新增 backend：数据模型 / 验证 / 评估、数据库迁移 / 种子、API / 事务、三类测试。
- 新增 web：React 页面、响应式样式、前端校验及测试、依赖锁。
- 新增运行 / 交付：Dockerfile、Compose、原生启动和只读冒烟脚本、README 与验证记录。
- 没有修改系统 PATH、安全策略、浏览器安全设置或安装系统服务。
- 如不再需要：停止本机启动器或执行 `docker compose down`；保留源码 / 数据备份后再自行移除项目目录。原始题面不依赖这些新增文件，无需恢复原题。

## 使用者需了解

AI 已执行技术验证，但这些不是生产认证。提交或演示前建议阅读 README，实际运行一遍，并能解释优先级、事务与唯一约束的实现。本项目按演示题面使用固定操作者，无生产登录和权限系统。

## 后续修复：启用开关导致页面跳动（2026-11-07）

用户报告点击列表开关会跳到页面顶端。先复现并记录滚动位置与行顺序，再保存原始源码 / ZIP 的 SHA256 和副本。原因是通用修改流程卸载表格进入 loading，随后按 updated_at 重排。新增专用开关处理路径，使用后端返回值原位更新，详情历史后台刷新。新增 3 个单元测试；6 个前端测试及生产构建通过；实际坐标点击三次的 scrollTop 均保持 453px。详情与原始测量见 SCROLL_FIX.md。本次未修改 Go、数据库结构或原始题面。
