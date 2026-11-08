# 实际验证记录

验证日期：2026-11-07，Asia/Shanghai。对象：本目录交付的 Flag Studio 项目。

## 环境与运行方式

- Windows x64；Go 1.27.3；Node.js 24.22.1；npm 12.2.2；PostgreSQL 18.6。
- React 19.3.1、Vite 8.3.6、pgx 5.7.6；依赖版本固定于 package-lock.json / go.sum。
- PostgreSQL 为工作目录内的真实本地进程，不是 SQLite、mock 或内存替代。
- 应用：127.0.0.1:8080；验证数据库：127.0.0.1:55432。
- 数据库集成测试使用 `flagstudio_test` 数据库，每个测试独立 schema，执行后清理自己的 schema。

## 自动化结果

| 实际命令 / 操作 | 结果 | 退出状态 / 证据 |
|---|---|---|
| `go mod tidy` | 依赖安装成功 | 0 |
| `npm install --no-fund` | 安装 18 个包，审计报告 0 vulnerabilities（当次结果） | 0 |
| `go test -race -count=1 -cover -v ./...` | 10 个顶层测试、8 个评估子用例通过，无 SKIP；覆盖率 80.0% | 0；test-results/go-test-race.log |
| `go vet ./...` | 通过，无诊断 | 0；test-results/go-vet.log |
| `go build -trimpath -o <work>/flagstudio.exe .` | Windows 可执行文件构建成功 | 0；test-results/go-build.log |
| `npm test` | 3 个前端校验测试通过 | 0；test-results/web-test.log |
| `npm run build` | Vite 生产构建成功 | 0；test-results/web-build.log |
| `python <outputs>/launch-demo.py --verify-only` | 原生启动、真实数据库、页面 HTTP 200、9 个 API 请求断言通过、停止和清理正常 | 0；test-results/native-launcher.log |
| `cmd /c <outputs>/启动本机演示.cmd --verify-only`（给 pause 提供换行） | 实际 .cmd 入口复核通过，完整调用 Python 启动器及 API 冒烟 | 0；test-results/cmd-launcher.log |
| 应用和 PostgreSQL 停止后重启 | 浏览器创建并修改的第四个 Flag 仍存在 | native-launcher.log 中 `4 persisted flags` |

表中 `<work>` 和 `<outputs>` 是本次工作区目录，非项目的安装要求。测试日志保存了原始输出；冒烟日志包含实际请求方法、路径、输入、HTTP 状态码与响应体。

### Go 测试覆盖的核心行为

- HTTP API 与静态文件托管路由可共同注册，首页与未知路由响应正确。
- 同一环境 Key 唯一，不同环境可重用 Key。
- Flag 创建、编辑、启停，规则增删改，列表搜索筛选和完整历史。
- 优先级从小到大；第一条命中后立即停止；命中 false 不能继续后续规则。
- equals / in、缺失属性、null、属性为数组、大小写、严格类型和大整数比较。
- 停用优先于默认 true 和规则 true；零规则与未命中返回默认值。
- JSON 格式、额外字段、无效 ID、无效环境、缺少布尔字段、超限请求体等错误。
- 在另一 Flag 的路径下编辑或删除规则返回 404。
- 重复 Key / 优先级返回 409，失败请求不产生业务数据或历史。
- **8 个请求同时创建同一个 Key：1 个成功、7 个冲突。**
- **8 个请求同时添加相同优先级：1 个成功、7 个冲突。**
- **通过数据库触发器故意让历史插入失败：创建 Flag、编辑基本信息、启停、添加规则都整体回滚。** 日志里的 `test: audit write failure` 是测试主动注入的预期错误，不是未解决故障。
- 完全相同的基本信息保存和重复启用操作不会改变 updated_at 或伪造历史。
- 重复迁移与种子导入不覆盖已有演示数据，不重复新增事件。

## 浏览器实际操作

使用真实浏览器访问 Go 托管的前端构建。并非仅检查页面文案，也实际提交表单并调用后端。

| 操作 | 观察结果 |
|---|---|
| 首页加载 | 展示 PostgreSQL 的 3 个种子 Flag |
| production checkout_v2，默认属性 | true；命中规则 #1，优先级 10；只执行一条规则 |
| 属性切为 `{"country":"US","plan":"free"}` | false；两条规则均未命中；默认值回退 |
| 属性输入 `{bad json}` | 前端清晰显示 JSON 错误，无旧结果冒充新结果 |
| 新建 `member_recommendations` | 创建成功；自动进入详情，列表数量变为 4 |
| 添加 plan equals "pro"，优先级 10 | 保存成功，规则数量为 1 |
| 再次添加优先级 10 | 显示重复优先级错误；未保存 |
| 编辑规则为 plan in ["pro","enterprise"] | 保存成功，历史中记录完整新条件 |
| 停用后查看历史 | 创建、加规则、改规则、停用四种事件按新到旧显示 |
| 停用后在线评估 | 返回 false，明确说明“不计算规则或默认值” |
| 修改名称为“会员专属推荐”，刷新浏览器 | 列表中仍显示修改后名称，按 Key 搜索得到唯一匹配 |
| 搜索不存在的名称 | 显示空状态 |
| 筛选 production | 只显示生产环境 Flag |
| 1360×900 桌面、390×844 手机布局 | 桌面列表 / 详情 / 评估可用；手机导航和表单可操作，宽表格横向滚动 |
| 浏览器 console error / warn 检查 | 本次捕获结果为空列表 |

真实截图：`screenshots/overview.jpg`、`screenshots/evaluation.jpg`、`screenshots/mobile-form.jpg`。浏览器截图工具返回 JPEG，未进行内容替换或伪造。删除规则的业务功能在自动化 HTTP 集成测试中验证；未声称在浏览器里执行过删除。

## 遇到的问题与处理

1. **PostgreSQL Windows 中文路径**：在原始工作区路径 initdb 遇到 UTF-8 字节错误；改用指向同一工作目录的临时 ASCII 盘符后初始化成功，实际数据仍在工作目录。没有安装系统服务或移动用户文件。
2. **首次服务启动的路由冲突**：Go 标准库发现 `GET /` 与方法不限的 `/api/` 注册冲突。将静态回退改为方法不限的 `/` 并显式限制 GET / HEAD，新增 `TestHTTPHandlerRouting` 回归用例。修复后主页 200，API 与静态资源共存。
3. **Windows 管道句柄**：早期 PowerShell 启动器把 pg_ctl 包在输出管道里，子进程继承句柄导致等待。改为文件重定向，不等待整个后代进程树。
4. **辅助脚本初稿错误**：PowerShell `$home` 与内置只读变量冲突；Python urllib Request 应用 `get_method()` 而非 `.method`。均修复后重新运行。
5. **系统自带 PowerShell 禁止脚本执行**：未更改或绕过系统执行策略。最终本机启动入口改用电脑已有 Python，`python launch-demo.py --verify-only` 实际通过。
6. 浏览器 fullPage 截图接口不可用，改用受支持的视口截图；功能检查依据真实 DOM 和页面结果。

## 未验证 / 非交付承诺

- 本环境没有 Docker，**Dockerfile / Compose 未实际构建运行**。
- 没有线上部署、TLS、鉴权、角色系统、负载测试或生产级安全审计。
- 浏览器流程是本次实际执行的验证记录，不是交付一套可重复运行的浏览器 E2E 自动化脚本；前端自动化部分为 JSON 校验单元测试。
- 手机验证仅覆盖本次指定视口，不代表所有浏览器 / 设备兼容性矩阵。
- 本机便携启动器依赖交付工作区外的 `work/` 运行时文件；跨电脑只保证提供完整源码和复现说明，不把便携快捷入口描述为独立安装包。

验证后已停止本次创建的应用 / PostgreSQL 进程，解除临时盘符；未删除数据库文件。需要演示时重新运行本机启动入口即可。
