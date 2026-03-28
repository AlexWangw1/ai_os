# Action Agent Studio

一个基于 Electron 的 AI Agent 原型，用来录制网页中的用户动作、理解流程意图、生成可回放步骤，并进一步把任务映射成一个可视化的 Agent Team。

## 当前能力

- 录制网页中的点击、输入、滚动、键盘动作和页面跳转
- 生成动作理解结果，包括目标、步骤、风险和自动化建议
- 支持简单任务 / 复杂任务分模型路由
- 支持独立设置中心，统一管理模型、MCP 和 Skills
- 支持 OpenAI、OpenAI Compatible、Anthropic、OpenRouter、Ollama、LM Studio、DeepSeek、SiliconFlow 和自定义 endpoint
- 支持 MCP 管理：启停、作用阶段、stdio / SSE / HTTP 配置、环境变量和能力摘要
- 支持 Skills 管理：来源类型、入口、挂载阶段、自动挂载和模板快速添加
- 支持把已启用的 MCP / Skills 作为扩展上下文带入 AI 分析和 Agent Team 规划
- 支持开始录制后自动隐藏到后台，通过托盘或 `Ctrl+Shift+A` 恢复
- 支持导入 / 导出 JSON 流程文件
- 支持通用 Agent 任务输入和 Agent Team 可视化

## 安装

```bash
npm install
```

## 运行

```bash
npm start
```

## 使用方式

1. 在主窗口输入目标网址并录制一段网页操作。
2. 点击“理解动作”生成流程分析。
3. 点击“打开设置中心”配置模型与扩展能力：
   - 添加模型 Provider，并为简单 / 复杂任务分别绑定模型
   - 添加 MCP 连接，指定 transport、命令或 endpoint、环境变量和作用阶段
   - 添加 Skills，指定入口、来源类型、挂载阶段和自动挂载规则
4. 保存配置后，返回主窗口继续生成 Agent Team。
5. 生成的任务规划会自动考虑你启用的 MCP 和 Skills。

## 扩展能力说明

- `MCP` 适合挂接工具或外部服务，例如文件系统、浏览器自动化、接口抓取或你自己的业务能力
- `Skills` 适合沉淀工作方法、提示模板、领域知识或固定执行套路
- 两者都可以按阶段绑定到 `planning`、`execution`、`analysis`、`review` 或 `all`

## 注意事项

- 当前版本重点覆盖“网页内动作录制与回放”，不是系统级桌面录制器
- 回放依赖 DOM 选择器，页面结构大幅变化时可能失效
- 密码输入在录制阶段会被遮蔽成 `********`
- MCP 和 Skills 当前是“管理 + 规划上下文”能力，后续还可以继续扩展成真正的运行时装配与调用编排
