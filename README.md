# Flag Studio — Feature Flag 与灰度规则平台

题目 A 的完整实现。**React + Go + PostgreSQL**，前端真实调用 Go API，业务数据和操作历史都持久化到 PostgreSQL；没有内存数据库或前端假数据替代。

## 1. 快速运行

### 方式一：Docker Compose（适合交付给其他人）

前提：安装并启动 Docker Engine / Docker Desktop，包含 Compose V2。进入本 README 所在的项目根目录：

```sh
docker compose up --build -d
```

打开 **http://localhost:8080**。等待首次镜像下载及构建完成；Go 启动时自动迁移数据库并幂等导入演示数据。

```sh
docker compose logs -f app           # 查看日志
docker compose down                  # 停止；保留数据库卷
docker compose --profile test run --rm tests  # 运行 Go 单元 + PostgreSQL 集成测试
```

默认端口：应用 8080、数据库 5432，仅绑定本机回环地址。若占用，可在 `compose.yaml` 修改宿主机端口；容器间 DATABASE_URL 无需跟随宿主机端口修改。

**验证边界：本次环境没有 Docker，未实际执行 Docker 构建和 Compose 启动。已实际通过的是下面的原生 Go / PostgreSQL / Node 路径、生产构建与浏览器验证。**

### 方式二：本地工具链

前提：Go 1.24+、Node.js 24（含 npm）、PostgreSQL。实际验证版本：Go 1.27.3、Node 24.22.1、PostgreSQL 18.6。

先使用 PostgreSQL 管理账号建立独立数据库和用户，例如在 psql 中执行：

```sql
CREATE USER flagstudio WITH PASSWORD 'flagstudio';
CREATE DATABASE flagstudio OWNER flagstudio;
```

用户名和口令仅用于本地演示。服务器启动时需要该数据库内建表权限。

在项目根目录执行：

```sh
cd web
npm ci
npm run build
cd ../backend
```

PowerShell：

```powershell
$env:DATABASE_URL = 'postgres://flagstudio:flagstudio@localhost:5432/flagstudio?sslmode=disable'
$env:SEED_DEMO = 'true'
go run .
```

macOS / Linux shell：

```sh
DATABASE_URL='postgres://flagstudio:flagstudio@localhost:5432/flagstudio?sslmode=disable' SEED_DEMO=true go run .
```

打开 http://localhost:8080。Go 同时托管前端构建文件，无需单独配置 Nginx。若使用允许运行本地脚本的 PowerShell，也可在项目根目录运行 `./scripts/run-local.ps1`；若系统策略禁止脚本，按上面的逐条命令启动即可，无需修改执行策略。数据库仍需预先准备。

### 开发模式

在 backend 目录启动 Go，在另一个终端进入 web 目录执行 `npm ci && npm run dev`。Vite 默认 http://localhost:5173，并将 `/api` 转发到 Go 的 8080 端口。

### 当前电脑的便携演示

项目外、与项目目录同级的 `launch-demo.py` 和 `启动本机演示.cmd` 复用本次验证时下载到工作目录的便携 Go 编译产物、PostgreSQL 和前端构建文件。双击 `.cmd` 或执行 `python launch-demo.py` 会启动并打开 http://127.0.0.1:8080；Ctrl+C 停止，数据保留。使用当前电脑已有的 Python，不修改 PowerShell 执行策略。

这个便捷入口**只适用于当前工作区**，不要把它当作跨电脑安装包。移动项目或换电脑时使用上述 Docker / 原生启动方式。便携数据库仅监听 127.0.0.1:55432，使用本地 trust 认证；不能对外开放。脚本临时映射空闲盘符以绕过 PostgreSQL Windows 中文路径问题，退出时解除自己创建的映射，不安装系统服务。

## 2. 演示路径（约 3 分钟）

初始种子数据：

| 名称 / Key | 环境 | 启用 | 默认值 | 规则 |
|---|---|---|---|---|
| 新版结算流程 / checkout_v2 | production | true | false | 10: plan equals "enterprise" → true；20: country in ["CN","SG"] → true |
| 新版结算流程 · 预发布 / checkout_v2 | staging | true | true | 无 |
| 智能搜索 / smart_search | development | false | false | 无 |

1. 列表搜索 `checkout`，筛选 production，点击「新版结算流程」。
2. 查看规则顺序；点击「测试评估」，默认属性命中优先级 10，只计算第一条规则。
3. 改成 `{"country":"SG"}`，命中优先级 20；改成 `{"country":"US","plan":"free"}`，返回默认 false。
4. 停用 Flag 后再次评估，即便匹配规则也返回 false，页面明确显示“已停用”，而不是误报默认值。
5. 添加、编辑、删除一条规则；尝试重复优先级，得到错误且不会产生假历史。
6. 编辑名称或默认值，切到「操作历史」查看操作者、时间、摘要、before / after。
7. 在 staging 使用同一个 Key，看到环境隔离和默认 true。

种子导入是幂等的：按 `(environment,key)` 跳过已存在记录，不覆盖已有配置。截图中的第四个 Flag 是浏览器验证时新建的样例，不属于全新数据库的种子数据。

## 3. 已完成范围

- [x] Flag 列表、名称 / Key 搜索、环境和启用状态筛选。
- [x] 创建、编辑名称 / Key / 环境 / 默认值、启停、详情、创建与更新时间。
- [x] equals / in 规则的新增、编辑、删除和优先级管理。
- [x] 数据库保证环境内 Key 唯一、Flag 内优先级唯一。
- [x] 后端评估，展示最终布尔值、命中规则、默认回退、停用原因和实际执行路径。
- [x] JSON、字段类型、非法值、404、409 和服务错误反馈。
- [x] 七种业务事件的事务性历史记录、固定操作者、before / after。
- [x] 加载、空状态、成功反馈、表单校验、删除确认与移动端布局。
- [x] 迁移、演示数据、锁定依赖、单元测试、真实 PostgreSQL 集成测试、只读 API 冒烟脚本。
- [x] 开发记录、实际验证记录和截图。

题目 A 必做项无已知未完成项。以下**可选扩展未实现**：百分比灰度、配置版本 / 回滚、乐观锁、拖拽排序、跨环境复制、登录与角色权限、线上部署。没有因完成可选项而牺牲核心路径。

## 4. 数据模型与一致性

```text
flags 1 ── N rules
flags 1 ── N history
schema_migrations：数据库版本记录
```

- `flags`：名称、key、environment、enabled、default_value、created_at、updated_at。`UNIQUE(environment,key)` 防止并发重复。
- `rules`：所属 Flag、属性名、operator、JSONB expected、result、priority。`UNIQUE(flag_id,priority)` 在数据库内拒绝重复优先级。
- `history`：action、actor、summary、JSONB changes、created_at。使用固定操作者 `demo-admin`。
- `(flag_id, priority)` 唯一索引用于规则排序；`history(flag_id, created_at DESC, id DESC)` 用于历史查询。
- 全部 SQL 参数化。输入验证在 Go 中执行；名称、Key、环境、操作符、优先级、唯一性等另有数据库约束。
- 启动迁移使用事务 + PostgreSQL advisory lock，避免多实例同时建表；种子在同一迁移事务中导入。

### 业务写入与历史

每个写操作只有一个数据库事务；创建 Flag、修改基本信息、启停、增删改规则和对应历史写入，要么共同提交，要么共同回滚。修改已有 Flag / 规则前，先对父 Flag 行 `SELECT ... FOR UPDATE`，串行化该 Flag 的变更；规则变更同时刷新父 Flag 的 updated_at。

编辑基本信息时若同时改变 enabled，会在同一事务内分别记录 `flag.updated` 和 `flag.enabled` / `flag.disabled`。完全相同的基本信息保存、或设置为当前启用状态，视为幂等 no-op：不刷新时间，不制造操作历史。规则保存记录当前提交的规则快照。

详情与评估使用 `REPEATABLE READ READ ONLY` 事务读取 Flag 和规则，避免把两个提交版本的配置混在同一次评估中。评估不写历史。

**并发边界**：有行锁和数据库唯一约束，但没有版本号或乐观锁；同时提交不同的整份基本信息时，后提交生效，历史记录两次变更。它不是多人实时编辑系统。

## 5. 规则语义（前后端一致）

1. **优先级数字越小越先匹配**，范围 0～1,000,000。同一 Flag 的重复优先级返回 409；前端也预先校验。
2. **首条命中即返回**。返回 false 的规则同样算命中，不能继续寻找后面的 true。
3. 没有规则命中（包括零规则），返回默认值。
4. 停用时直接返回 false，不执行规则，亦不使用默认值。
5. 属性名是顶层、区分大小写的键；`user.plan` 表示字面键名，不是嵌套对象路径。
6. equals 接受单个 JSON 字符串、数字或布尔值。in 接受 1～100 项上述标量构成的非空数组。
7. 字符串区分大小写；不转换类型：`"1"` 不等于 `1`，`true` 不等于 `1`。Go 使用 `json.Number` 和精确有理数比较，所以 `1` 与 `1.0` 相等，不把大整数先转成 float64。
8. 属性缺失、null、对象、数组不匹配标量规则。期望值不允许 null 或嵌套对象 / 数组。
9. 前端 JSON 编辑器使用浏览器的 JSON.parse / stringify；业务 ID 建议使用字符串，数字遵循 JavaScript 精度。超大整数请以字符串传递，避免浏览器先行舍入。

请求体上限 64 KiB，超出返回 413；不支持额外未知字段。所有时间在数据库中为 timestamptz，API 输出带时区的时间，界面按浏览器所在时区显示。

## 6. API

所有接口前缀 `/api`。成功返回对象或列表；错误统一为 `{"error":"可读信息"}`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /health | 检查数据库连接；正常 200，异常 503 |
| GET | /flags?q=&environment=&enabled= | 列表 / 搜索 / 筛选 |
| POST | /flags | 创建，201 |
| GET | /flags/{id} | flag、rules、history 的一致性快照 |
| PUT | /flags/{id} | 完整更新基本字段，200 |
| PATCH | /flags/{id}/enabled | `{"enabled":true}`，200 |
| POST | /flags/{id}/rules | 创建规则，200 |
| PUT | /flags/{id}/rules/{ruleID} | 更新规则，200 |
| DELETE | /flags/{id}/rules/{ruleID} | 删除规则，200 |
| POST | /evaluate | 后端评估，200 |

Flag 输入：

```json
{"name":"新版结算流程","key":"checkout_v2","environment":"production","enabled":true,"default_value":false}
```

规则输入：

```json
{"attribute":"country","operator":"in","expected":["CN","SG"],"result":true,"priority":20}
```

评估调用（macOS / Linux shell）：

```sh
curl -s http://localhost:8080/api/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"key":"checkout_v2","environment":"production","attributes":{"plan":"enterprise"}}'
```

PowerShell：

```powershell
Invoke-RestMethod http://localhost:8080/api/evaluate -Method Post -ContentType 'application/json' -Body '{"key":"checkout_v2","environment":"production","attributes":{"plan":"enterprise"}}'
```

返回包含 `value`、`matched`、`reason`（rule/default/disabled）、`explanation`、`matched_rule` 和 `steps`。在同一 Flag 路径下修改另一 Flag 的规则会返回 404；不会跨资源修改。

## 7. 测试

```sh
cd backend
go test -v ./...                      # 不设置 TEST_DATABASE_URL 时，数据库测试会明确 SKIP
go vet ./...
```

运行真实数据库集成测试：先创建一个可写测试数据库；测试账号需具有 CREATE SCHEMA 权限。每次测试创建独立 schema，结束仅清理该 schema，不 truncate 业务数据。

```powershell
$env:TEST_DATABASE_URL = 'postgres://flagstudio:flagstudio@localhost:5432/flagstudio?sslmode=disable'
go test -count=1 -v ./...
go test -race -count=1 -cover -v ./... # race 需要对应平台的 C 编译器；普通测试不需要
```

```sh
cd web
npm ci
npm test
npm run build
```

启动应用后，在项目根目录执行只读 API 冒烟测试（Python 3 标准库，无额外依赖）：

```sh
python scripts/smoke.py http://127.0.0.1:8080
```

冒烟脚本依赖未被修改的默认种子配置，不会为测试重置用户数据。更全面的自动化业务测试在隔离 schema 内执行。

本次结果：**10 个 Go 顶层测试全部通过（含 5 个 PostgreSQL 集成测试和 8 个评估子用例），race 通过，Go 总语句覆盖率 80.0%；6 个前端测试通过，Vite 生产构建通过。** 前端包含 3 个 JSON 校验测试和 3 个开关更新回归测试。初次验证见 `docs/VALIDATION.md`，启用开关滚动修复及实测见 `docs/SCROLL_FIX.md`，原始输出见 `docs/test-results/`。

## 8. 目录

```text
backend/
  main.go                 进程启动、静态文件托管、优雅关闭
  api.go                  API、验证、事务和错误映射
  model.go                类型、规则验证、纯评估逻辑
  db.go                   迁移、数据读取、历史写入
  migrations/001_schema.sql
  seeds/demo.sql
  *_test.go               单元、HTTP 路由、数据库集成测试
web/
  src/main.jsx            React 页面与表单
  src/styles.css          响应式样式
  src/validation.mjs      前端 JSON 校验
  src/validation.test.mjs
  package-lock.json       前端依赖锁
scripts/
  run-local.ps1           标准 Windows 原生启动
  smoke.py                只读 API 冒烟测试
docs/
  AI_DEVELOPMENT_LOG.md    AI 使用与开发操作记录
  VALIDATION.md           验证结果及边界
  test-results/           实际运行原始输出
  screenshots/            实际浏览器截图
Dockerfile
compose.yaml
```

## 9. 设计取舍、限制与恢复

- 使用 Go 标准库 HTTP 路由和 pgx，避免为小型题目引入 ORM、任务队列或缓存；SQL 约束与事务逻辑可直接检查。
- 页面合并为一个 React 应用，靠导航与详情状态切换。刷新会回到列表；未实现 URL 深链接。
- 小规模管理工具，列表与历史暂不分页；前端即时筛选已加载的 Flag，API 也支持服务端筛选。大量配置需增加分页、服务端搜索、历史归档。
- 无身份认证、RBAC 或生产审计防篡改，demo-admin 是演示身份。只适合受信任的本地演示，不应直接部署到公网。
- 未实现百分比灰度或配置版本。历史是审计快照，不是“一键回滚”功能。误改可参考 before 数据在界面恢复，删除的规则可按历史重新添加。
- 数据库故障返回通用 500，服务端日志保留原始原因，不向页面泄露数据库内部信息。
- `docker compose down` 保留卷；不要使用 `down -v`，除非明确要清空该演示数据库。迁移只有前向建表，本次不提供破坏性的自动 down SQL。
- 原始题目文件未修改。全部交付代码从零新建在独立目录；撤销本项目不会涉及原始题目。备份数据库可使用 PostgreSQL 自带 pg_dump；还原用对应 pg_restore / psql，按你的备份格式执行。

参考文档：[Go 下载与版本](https://go.dev/dl/)、[Vite 官方指南](https://vite.dev/guide/)、[PostgreSQL 约束](https://www.postgresql.org/docs/current/ddl-constraints.html)、[EDB PostgreSQL 便携发行包](https://www.enterprisedb.com/download-postgresql-binaries)。
