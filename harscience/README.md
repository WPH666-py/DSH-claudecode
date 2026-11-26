# HarScience 内置安装

把 Agent-ClaudeCode 变成 HarScience 的内置模式：任何用户装上这个包，模式列表里就有它。

## 为什么不能只是"把 tgz 丢进 plugins/"

HarScience 启动时不跑 `pnpm install`。它用两件东西把 profile 树**物化**出来：

```
resources/seed/profile-files.tar      profile 树里的普通文件
resources/seed/profile-links.json     指向内容寻址 pnpm store 的硬链接
```

并且在动手之前先按 `resources/seed/integrity.json` 校验整个 seed。

所以"声明了依赖但树里没有这个包"不是"加载失败"这种可恢复的小事：物化器在第一个缺失的链接上直接抛错，应用起不来。内置必须做全三步，而且顺序不能反：

1. 把 tgz 放进 `resources/seed/plugins/`，在 seed `package.json` 里声明依赖并加进 `dsh.profile.bundles`；
2. 把包的文件**追加进 `profile-files.tar`**，让物化出来的树里真的有它（不联网、不安装）；
3. 最后重写 `integrity.json` 里**恰好**那几个变了的文件的记录。

`Integrate-AgentClaudeCode.ps1` 就是按这个顺序做的，并且每一步先看当前状态、再备份、最后自校验。重复执行安全。

## 用法

```powershell
# 装进当前用户的 HarScience（默认 %LOCALAPPDATA%\HarScience）
.\Integrate-AgentClaudeCode.ps1 -PluginTgz .\agent-claudecode-1.0.0.tgz

# 先看看会改什么
.\Integrate-AgentClaudeCode.ps1 -PluginTgz .\agent-claudecode-1.0.0.tgz -DryRun

# 只改 seed，不动正在用的 profile（做发布镜像时用）
.\Integrate-AgentClaudeCode.ps1 -SkipProfile

# 只改正在用的 profile，不动 seed
.\Integrate-AgentClaudeCode.ps1 -SkipSeed
```

装完重启应用，新建会话时在模式列表里选 **Agent-ClaudeCode**。

## 它会改哪些文件

| 文件 | 改动 |
| --- | --- |
| `resources/seed/plugins/agent-claudecode-<v>.tgz` | 新增 |
| `resources/seed/package.json` | `dependencies` 加 `file:./plugins/...`，`dsh.profile.bundles` 加一项 |
| `resources/seed/profile-files.tar` | 追加 `node_modules/agent-claudecode/**` |
| `resources/seed/integrity.json` | 重算上述三个文件的 bytes + sha256 |
| `data/profiles/desktop/package.json` | 同样的依赖与 bundle 声明 |
| `data/profiles/desktop/node_modules/agent-claudecode/` | 解包后的包 |
| `data/.agent-presets/agent-claudecode/` | 预设（`preset.yml` + `agent.cordis.yml`） |
| `data/skills/claudecode-workflow/` | 技能 |

被改的文件都会备份到 `data\backups\agent-claudecode\<时间戳>\`，以应用根目录为基准的相对路径存放（例如 `resources\seed\package.json`、`data\profiles\desktop\package.json`）。**备份不会留在 `resources/seed` 里**：启动器会把 seed 下除 `integrity.json` 外的每个文件都纳入清单，一个多出来的 `.bak-*` 就会让启动停在 `desktop seed: integrity verification failed`。出问题就从备份目录取回，或者直接删掉 `node_modules/agent-claudecode` 并从 `package.json` 里移除两项。

## 校验

脚本最后会按启动器的口径自己验一遍，任何一条不成立都会以非零状态退出并列出问题：

- seed 的实际文件清单与 integrity 记录**双向完全一致**：没有未记录的文件（例如残留备份）、没有缺失、大小与 sha256 全部匹配、没有符号链接；
- seed `package.json` 的 bundle 列表里有 `agent-claudecode`；
- `profile-files.tar` 里确实有 `node_modules/agent-claudecode/lib/workflow.js`，且只有一份；
- 运行中 profile 的依赖、bundle、`node_modules` 都在位，且 node 能解析到它。

## 已知边界：启动器的“恢复插件”尝试

HarScience 的启动器把随包插件写死在 `shell.mjs` 的静态清单里，我们的插件不在那张表上。因此对一个**已有 profile** 的安装做升级时，启动器重建 profile 后会把本插件当作“用户后装的插件”，尝试 `pnpm add agent-claudecode@1.0.0 --offline`。离线镜像里没有它的 registry 元数据，这一步会在运行日志里留下一行 `could not restore agent-claudecode`，随后继续启动；插件本身与 bundle 已经从 seed 的 tar 里落地，模式照常可用。全新安装（没有旧 profile）不会触发这一步。修改厂商的 `shell.mjs` 不可取：应用升级会覆盖它。我们不去动它。

## 已知边界

- `pnpm-lock.yaml` **没有**被重写。启动路径不读它，物化不跑安装；但如果你之后用应用内的插件管理器再装别的插件（它走 `pnpm add`），pnpm 会因为我们的 `file:` 依赖不在锁文件里而重新解析一次。这不会损坏安装，只是会多花一次依赖解析的时间。
- 应用若在某次启动时判定 seed 身份变化并重新物化 profile，物化结果里**已经包含**本包（因为它在 tar 里），所以这种情况也是对的。