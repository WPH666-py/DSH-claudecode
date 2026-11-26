# Agent-ClaudeCode

把 Claude Code 的 agent 工作流做成 DeepSeek Harness 里**可以直接在模式列表里选中的一个模式**。

选中它之后：

- **Harness 工作流下线。** 标准预设的 persona、工具使用策略、委派协议、汇报风格都不加载，也不再出现在上下文里。
- **Claude Code 工作流顶上。** 系统提示换成 Claude Code 的：探索 → 单步决策 → 工具 → 观察 → 自适应 → 验证 → 汇报，连同它对代码风格、危险操作、git 协议、诚实汇报的那一套硬约束。
- **工具词表已翻译。** Claude Code 说的是 Read / Bash / Edit / Glob / Grep / Task，本机是 `ops_read_files` / `pwsh` / `edit` / `ops_glob` / `ops_grep` / `subagent`。这层映射（`docs/TOOL-MAP.md`）在挂载时注入提示词，不是靠模型猜。
- **三种执行后端。** 原生 Harness 循环（默认）、Claude Code CLI（`claude -p`）、Codex CLI（`codex exec`），通过 `claudecode_backend` 一个工具统一进出。

## 安装

```bash
# 从本地目录安装（开发）
dsh plugin --profile desktop add link:D:/projects-py/Agent-claudecode

# 或从打好的 tgz 安装
dsh plugin --profile desktop add ./agent-claudecode-1.0.0.tgz

# 或直接从 GitHub 安装
dsh plugin --profile desktop add github:WPH666-py/DSH-claudecode
```

安装后重启宿主进程，新建会话时在模式选择器里选 **Agent-ClaudeCode**。

宿主启动时，插件还会把预设与技能同步到：

```
%DSH_HOME%\.agent-presets\agent-claudecode\     预设（preset.yml + agent.cordis.yml）
%DSH_HOME%\skills\claudecode-workflow\          技能
```

`DSH_HOME` 未设置时回落 `~/.dsh`。同步是按字节比对的幂等操作，不会覆盖用户改动以外的东西，也不会重复写。

## 三种后端

| 后端 | 是什么 | 怎么用 |
| --- | --- | --- |
| `harness` | 本机原生工具循环，不启动外部进程（默认） | 直接用工具干活 |
| `claudecode` | Claude Code CLI：`claude -p --output-format text --permission-mode acceptEdits` | `claudecode_backend` 的 `action="run"`、`backend="claudecode"` |
| `codex` | OpenAI Codex CLI：`codex exec --full-auto --skip-git-repo-check` | 同上，`backend="codex"` |

`action="status"` 只探测不启动，用来判断 CLI 在不在。`backend="auto"` 取第一个可用的 CLI，都没有就回落原生循环——**不会**静默安装，也**不会**在失败后偷偷换后端：模型必须知道到底是哪个 agent 动了工作区，因为它的产出要自己复核。

外部后端跑在同一个工作区、走它自己的权限体系，所以插件和提示词都要求：拿到结果先看 diff，再自己跑检查。

## 它到底改了什么

`lib/composition.mjs` 是这个模式唯一的真相来源，生成两个注册产物（`npm run build`）：

```
cordis.patch.yml                             profile bundle 行（权威注册路径）
presets/agent-claudecode/agent.cordis.yml    ~/.dsh/.agent-presets 目录（第二注册路径）
presets/agent-claudecode/preset.yml          模式列表里的显示名/描述/排序
```

组合的第一行永远是工作流行（`agent-claudecode/workflow`），其余是本模式真正需要的工具：pwsh/bash、fs、fs-search、jobs、schedule、skills、goal、plan mode、compaction、subagent、ask-user、todo、web、present。

**没有**挂载 Harness 的 persona、没有挂载 Harness 的编排与工作流派生行。这就是"Harness 工作流下线"的实现方式：不是把一个开关关掉，而是这个预设的组成里根本没有它。

## 目录

```
lib/index.js         宿主插件：挂 persona、注册 claudecode_backend、同步预设与技能
lib/prompt.js        从 Claude Code 源码移植的工作流提示词（分区顺序保持原样）
lib/toolmap.js       Claude Code 工具词表 → Harness 工具词表
lib/engine.js        三种后端的探测与委派
lib/composition.mjs  预设组成的唯一真相来源
lib/yaml.mjs         生成 YAML 用的最小发射器
scripts/build.mjs    生成 + 结构自检（npm run check 可当 CI 闸门）
docs/PROVENANCE.md   每个提示词区段来自源码的哪个文件
docs/TOOL-MAP.md     工具映射全表
skills/              随包分发的 claudecode-workflow 技能
```

## 开发

```bash
npm run build     # 重新生成注册产物
npm run check     # 产物是否与组成一致（不一致即失败）
npm test          # 结构、提示词、映射、同步逻辑的单元测试
```

`docs/PROVENANCE.md` 记录了提示词的每一段取自源码哪个文件，以及哪些内容被刻意去掉（产品命令、遥测、沙箱绕过开关、内部代号）。本仓库不重新分发源码，只分发独立撰写的提示词与自建映射表。

## 许可

MIT。