---
name: publish-eva-examples-release
description: 在 eva-sdk-examples 仓库中，将已完成 commit 的变更按门禁发布到 Git 远端并创建版本 tag：运行固定本地测试、逐次确认并 push 当前分支、等待并核验该 commit 的 GitHub Actions、创建 annotated tag、再次确认并 push tag。用户调用本 skill，或在 commit 完成后要求发布、推送并打 tag、等待 CI 后发版时使用。
---

# 发布 EVA Examples Release

只发布已经 commit 且验证通过的仓库状态。严格执行：

`本地检查 -> branch push 确认 -> branch push -> CI 成功 -> 创建本地 tag -> tag push 确认 -> tag push`

不得把本地测试通过等同于远端 CI 通过，也不得把用户最初说“发布”视为后续 push 的确认。

## 发布不变量

- 只从当前非 detached branch 发布，默认使用该 branch 的 upstream remote。
- 开始测试前要求工作区和 index 干净；不得自动提交、丢弃或隐藏现有修改。
- 用完整 commit SHA 绑定测试结果、远端 branch、CI runs 和 tag。
- branch push 与 tag push 是两次独立远程写操作，必须分别展示目标和命令并获得用户当次明确确认。
- 只允许 fast-forward branch push。不得使用 force push、`--force-with-lease` 或修改远端历史。
- 只推送指定 branch 或指定 tag。不得使用 `--tags`、`--follow-tags` 或在一条命令中同时推送 branch 与 tag。
- 远端 CI 未成功时不得创建或推送 release tag。
- 不创建 GitHub Release，不发布 npm package，不 rerun workflow，除非用户另外明确要求并确认对应远程操作。

## 1. 冻结发布对象

读取并报告：

```bash
git status --short
git branch --show-current
git rev-parse HEAD
git remote -v
git log -1 --format='%H%n%s'
```

同时读取仓库根部的 `AGENTS.md` 或等效指令。遇到以下任一情况立即停止：

- 工作区或 index 非干净；
- 当前处于 detached HEAD；
- branch 没有明确的目标 remote；
- 用户尚未给出 tag 名称，且仓库上下文不能无歧义确定；
- tag 名称不符合仓库已有命名惯例。

记录 frozen branch、remote、remote URL、完整 HEAD SHA 和 tag。后续任一步发现 HEAD 改变，都必须废弃之前的测试和确认，从本节重新开始。

## 2. 执行本地门禁

从仓库根目录依次运行：

```bash
node scripts/verify-catalog.mjs
node --test client-sdk/ts/browser-conversation-agent/scripts/run-npm-demo-with-key-file.test.mjs
```

然后从 `client-sdk/ts/browser-conversation-agent` 运行：

```bash
npm ci
npm run build
```

最后返回仓库根目录运行：

```bash
git status --short
git diff --check
git show --check --oneline HEAD
git rev-parse HEAD
```

验收条件：

- catalog 校验通过；
- launcher 单测全部通过；
- `npm ci` 和 production build 通过；
- postbuild 产物路径校验通过；
- frozen commit 本身没有 whitespace error；
- 工作区仍干净；
- HEAD 仍等于 frozen SHA。

任何命令失败都停止发布，报告失败命令、关键日志和可复现证据。warning 与 failure 分开呈现，不自行降低门槛。

## 3. 推送 branch

先用只读命令检查远端 branch，确认不会 non-fast-forward：

```bash
git ls-remote <remote> refs/heads/<branch>
```

如果远端 branch 已存在，获取该 branch 并证明远端 commit 是 frozen SHA 的祖先：

```bash
git fetch --no-tags <remote> <branch>
git merge-base --is-ancestor FETCH_HEAD <full-sha>
```

祖先检查失败即表示 push 不是 fast-forward，必须停止。

向用户展示：

- remote 名称与 URL；
- branch；
- 本地完整 commit SHA；
- 当前远端 commit SHA；
- 精确命令 `git push <remote> <branch>`。

停下来等待用户明确确认。收到确认后，只执行展示过的命令。

push 成功后再次运行：

```bash
git ls-remote <remote> refs/heads/<branch>
```

远端 SHA 必须与 frozen SHA 完全相同，否则停止，不进入 CI 或 tag 阶段。

## 4. 等待并核验 GitHub CI

从 remote URL 解析 GitHub `owner/repo`。只查询 `event=push` 且 `headSha` 等于 frozen SHA 的 runs，例如：

```bash
gh run list --repo <owner/repo> --commit <full-sha> --event push --json databaseId,workflowName,headSha,status,conclusion,url
```

等待规则：

1. 等待至少一个与 frozen SHA 精确匹配的 push run 出现；短间隔查询，最多等待 2 分钟，并持续向用户报告进度。
2. 对每个匹配 run 使用 `gh run watch <run-id> --repo <owner/repo> --exit-status` 等待完成。
3. 完成后重新列出该 SHA 的 runs，避免漏掉稍后创建的 workflow。
4. 只有所有匹配 runs 的 `headSha` 正确、状态为 `completed`、结论为 `success`，才算 CI 通过。

如果没有匹配 run、run 超时、失败、取消或需要操作，停止发布。失败时读取 `gh run view <run-id> --log-failed` 并报告具体 job/step；不得自动 rerun、提交修复或继续打 tag。

## 5. 创建本地 release tag

CI 成功后，只读检查 tag：

```bash
git tag --list <tag>
git ls-remote --tags <remote> refs/tags/<tag> refs/tags/<tag>^{}
```

- 远端 tag 已存在时停止；不得覆盖、移动或删除。
- 本地 tag 已存在时，只有它是 annotated tag、说明为 `Release <tag>` 且 peeled commit 等于 frozen SHA 时才可复用；否则停止并请用户决定。
- tag 不存在时创建 annotated tag：

```bash
git tag -a <tag> <full-sha> -m "Release <tag>"
```

用 `git rev-parse <tag>^{}` 证明 tag 指向 frozen SHA。

## 6. 推送 tag

向用户展示：

- remote 名称与 URL；
- tag 名称；
- tag object SHA；
- peeled commit SHA；
- 精确命令 `git push <remote> refs/tags/<tag>`。

停下来等待独立于 branch push 的当次明确确认。收到确认后，只执行展示过的 tag push 命令。

push 成功后运行：

```bash
git ls-remote --tags <remote> refs/tags/<tag> refs/tags/<tag>^{}
```

远端 tag object 与 peeled commit 必须和本地完全一致。

## 7. 报告发布证据

分别报告：

- 本地测试命令及结果；
- branch remote、branch 和完整 commit SHA；
- branch push 结果；
- 每个 CI workflow 的 run URL 与结论；
- tag 名称、tag object SHA 和 peeled commit SHA；
- tag push 与远端复核结果；
- warning、跳过项和剩余风险。

只有远端 branch、CI 和远端 tag 三项都有可复现证据时，才能声称发布完成。
