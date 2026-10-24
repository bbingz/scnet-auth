# 超算互联网 · SCNet Token Plan

[English](README.en.md) · [安装 / 更新](#安装与更新) · [浏览器登录](#浏览器登录推荐) · [常见问题](#常见问题)

为 [Magpie](https://usemagpie.ai) 接入超算互联网 Token Plan 的开源插件。通过浏览器登录，自动获取账号、现有套餐密钥和额度，支持多账号、活动套餐、自定义模型、流式输出及工具调用。MIT 许可，独立社区项目。

## 配置后的效果

浏览器登录后，账号显示为 **超算互联网 · 用户名 · 套餐**，带独立图标。账号下显示剩余 Credits、已用量和额度进度；套餐到期时间也会交给 Magpie。

![Magpie 中的中文账号与额度](docs/account-quota.png)

*截图来自真实 Magpie 界面的隔离测试，账号及余额均为演示数据，不是实际套餐余额。*

## 安装与更新

打开 Magpie → **插件 → 发现**，搜索 `scnet`。本插件在 **Unofficial, on GitHub（GitHub 非官方插件）** 区域，尚非维护者审核的社区注册表条目。也可以直接添加：

```sh
magpie plugin add github:bbingz/scnet-auth
magpie plugin login scnet-token-plan
```

更新已有安装：在 Magpie 的插件页检查更新并更新 `scnet-auth`。新版本为 **0.3.1**。如应用仍使用旧插件代码，在空闲时将此插件关闭再开启。

**从 0.1.x / 0.2.x 升级：** 原账号仍可使用。更新插件后，添加账号并选择下面的浏览器登录。旧匿名/手动账号不会被自动删除；确认新账号的模型与额度后，可在 Magpie 中退出旧账号。再次用同一 SCNet 用户及套餐登录会更新对应的浏览器账号。

## 浏览器登录（推荐）

1. 在 **供应商 → 超算互联网 · SCNet Token Plan → 添加另一个账号**，或运行上面的登录命令，选择 **浏览器登录超算互联网（推荐）**。
2. Magpie 在当前默认浏览器打开 **本机插件登录页**。输入已注册的手机号，勾选本次登录授权，点击 **获取验证码**，然后输入短信验证码登录。无需安装浏览器扩展。
3. 登录后自动读取用户名、可用套餐和现有 Token Plan 密钥。确认套餐，再点击 **连接到 Magpie**。不需要打开开发者工具或复制 Cookie / API Key。
4. 返回 Magpie 查看账号名称、模型和 Credits 额度。多个套餐分别连接，额度按所选套餐展示。

模型列表只使用该订阅的 `resourceId` 所匹配套餐；若接口未提供准确模型列表，确认页才会要求填写。不会把公共模型目录当作套餐权限。插件只读取现有密钥，不会创建、重置密钥或购买套餐；没有可用套餐/完整密钥时会明确提示。

登录页地址为 `http://127.0.0.1:随机端口/`，由本机 `scnet-auth` 提供，并非 SCNet 官网。插件通过 SCNet 客户端的短信登录接口建立新会话，**不会复用官网已有登录态**。手机号与验证码只在本次请求中使用，不保存、不记录；现有密钥及额度会话在确认套餐后保存到 Magpie。插件不会收集账号密码，也不会启动独立 Chrome。

请在运行 Magpie 的同一台电脑上完成登录。点击 **取消连接** 或等待五分钟超时即可取消；完成后本机监听自动关闭。刷新页面会丢失本次连接，请从 Magpie 重新发起。官网会话过期时重新登录即可；额度查询失败不会使推理密钥失效。无桌面环境可使用下面的高级手动方式。

## 手动配置（高级 / 无桌面环境）

选择 **手动配置 API Key（高级 / 无桌面环境）** 后进入下面的中文向导。

在 **供应商 → 添加供应商 → 来自插件 → 超算互联网 · SCNet Token Plan** 中配置，或使用上面的登录命令。

| 步骤 | 怎么填写 |
| --- | --- |
| 账号备注 | 如“主账号”“工作账号”。显示为“超算互联网 · 主账号”。同名登录更新原账号，不同账号请使用不同名称。不要填写密钥。 |
| 模型配置 | **DeepSeek 活动套餐（Event）** 自动使用 `DeepSeek-V4.1-Flash-1017-Event`；其他套餐选择 **其他套餐 / 自定义模型**。 |
| 自定义模型 | 从该套餐控制台复制完整模型 ID，支持中英文逗号或换行分隔，自动去重。保留日期及 `-Event` 后缀。 |
| 剩余额度 | **连接额度查询**：继续填写控制台 Cookie 并选择套餐；**暂不查询额度**：直接进入 API Key 步骤。 |
| 套餐选择 | 从当前控制台账号的套餐列表中，选中**与即将填写的 API Key 对应的套餐**。只显示所选套餐额度，不合并其他套餐。 |
| 专用 API Key | 粘贴 Token Plan 页的套餐专用 Key，输入会遮罩。普通按量付费 Key 不使用套餐额度。 |

登录后，在 Agent 的 Magpie 模型列表中选择：

```text
scnet-token-plan/DeepSeek-V4.1-Flash-1017-Event
```

如果使用其他套餐，选择自己填写的模型 ID。保存 Key 只代表完成本地配置，第一次模型请求才会检验 SCNet 的实际鉴权和模型权限。

## 手动连接额度查询（高级）

浏览器短信登录已自动连接额度，无需执行本节。以下仅用于高级手动配置。

SCNet 的模型 API Key 与网页登录会话用途不同。当前接入的是 **SCNet 控制台自身的套餐查询接口**，需要 Cookie；这是控制台内部接口，可能随网站更新而变化。

1. 在自己的浏览器登录 [SCNet Token Plan 控制台](https://www.scnet.cn/ui/console/index.html#/llm/token-plan)。
2. 打开开发者工具（macOS：`⌥⌘I`；Windows/Linux：`F12`），进入 **Network / 网络**。
3. 刷新控制台，在网络请求中过滤 `tokenplan/list`。
4. 点击该请求 → **Headers / 标头 → Request Headers / 请求标头 → Cookie**，复制它的**值**。不要复制 `Cookie:` 标签、响应的 `Set-Cookie` 或整段 cURL。
5. 在插件的遮罩输入框中粘贴，选择对应套餐，然后填写套餐 API Key。

Cookie 是登录凭据，请仅粘贴到本机 Magpie 的配置框，不要发到 Issue、聊天或截图中。插件把它保存在该账号的 Magpie 凭据文件中，只发送到固定的 SCNet HTTPS 套餐查询地址，不用于推理、不跟随重定向、不写日志。查询不消耗模型推理额度。

查询结果包含剩余 Credits、已用 / 总额、使用百分比及返回的到期时间。SCNet 返回明确的重置时间时才显示重置，不假设自动续订。**Credits 不等于 token 数量**，也不由 Magpie 的本地 token 统计估算。

未连接时提示使用“浏览器登录超算互联网”。Cookie 过期、网络失败或套餐数据不完整时会显示具体原因，不伪造余额、不把模型 API Key 标记为失效。重新登录时使用原账号备注，更新 Cookie 并再次选择套餐即可。

套餐和模型由你按控制台选择；插件不能用控制台 Cookie 自动证明该套餐与某个 API Key 属于同一账号。

## 常见问题

**仍显示 `API key …` 或“剩余额度未知”？**

先确认插件版本为 0.3.1，再选择浏览器登录完成账号连接。旧账号没有新增的备注、Cookie 和套餐选择信息。没有连接额度查询时仍可正常使用模型。

**登录后请求 401 / 403 / 429？**

核对专用 Key、订阅状态、模型完整 ID 和控制台额度。服务端错误会原样交给 Magpie，便于重试和账号切换。额度查询的会话过期与推理 Key 失效分别处理。

**为什么不自动添加全部模型？**

SCNet 公共 `/models` 接口描述的是平台模型目录，不是某个账号的套餐权益。本插件仅暴露你选择的模型，避免误用不属于套餐的模型。

**上下文和输出上限怎么设？**

未核实的上限保留为 `0`（未指定）。如果你已从 SCNet 确认，可以在 Magpie 插件配置中设置对应模型的 `limit.context` 和 `limit.output`；插件保留已有配置。

**怎么停用额度查询 / 移除插件？**

使用相同账号备注重新登录，选择“暂不查询额度”，即可清除该次配置中保存的 Cookie。移除整个供应商的账号及插件：

```sh
magpie plugin logout scnet-token-plan
magpie plugin rm github:bbingz/scnet-auth
```

## 接口与凭据

| 项目 | 值 |
| --- | --- |
| Provider ID | `scnet-token-plan` |
| 模型 Base URL | `https://api.scnet.cn/api/llm/v1` |
| 推理地址 | `https://api.scnet.cn/api/llm/v1/chat/completions` |
| 额度地址 | `https://www.scnet.cn/acx/charge/account/currentuser/tokenplan/list` |
| 凭据位置 | `$XDG_CONFIG_HOME/magpie/plugin-auth.json`，默认 `~/.config/magpie/plugin-auth.json` |

插件使用 Magpie 的 OpenCode 插件接口。上游使用 Chat Completions，由 Magpie 转换 OpenAI Chat、Responses 和 Anthropic Messages；无需为每种协议重复添加模型。浏览器登录仅使用 Node.js 内置 HTTP 和 Fetch，不依赖 Playwright 或浏览器扩展，无需构建。主要面向 Magpie，动态套餐向导及密钥遮罩输入为 Magpie 扩展，未验证原生 OpenCode。

## 开发与验证

```sh
npm ci --ignore-scripts
npm test
npm pack --dry-run --ignore-scripts
# macOS，安装 Magpie 与 Bun 后：
SCNET_TEST_BUN=/absolute/path/to/bun npm run test:magpie
# 启动隔离的真实 Magpie 界面，使用模拟上游：
SCNET_TEST_UI=1 SCNET_TEST_BUN=/absolute/path/to/bun npm run test:magpie
```

单元测试覆盖账号名称、条件向导、模型列表、额度解析及失败处理、密钥隔离、流式工具调用、注销及取消。集成测试覆盖真实 CLI 安装 / 登录 / 套餐选择 / 额度显示，以及三种协议的 JSON/SSE 和文本/工具调用。测试使用临时目录、假凭据和 macOS 沙箱，不读取或修改现有账号。真实账号曾通过旧版完成一次推理；新版浏览器登录及真实余额仍需单独验收，模拟结果不代表真实余额。

## 参考

- [Magpie 插件指南](https://usemagpie.ai/docs/plugins)
- [SCNet Token Plan 文档](https://www.scnet.cn/help/docs/mainsite/mass/plans/token-plan.html)
- [SCNet 模型列表 API](https://www.scnet.cn/help/docs/mainsite/mass/api/modulequery.html)
- [额度接口来源及验证边界](docs/quota-api.md)
