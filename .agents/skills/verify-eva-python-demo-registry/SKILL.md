---
name: verify-eva-python-demo-registry
description: 验证 eva-sdk-examples 中 EVA Python voice-dialogue-agent 对公开 PyPI/TestPyPI SDK wheel 的真实消费身份。用户要求验证 Python registry 包、TestPyPI/PyPI candidate、wheel SHA、安装版本、native AEC identity，或进行外部 demo consumer gate 时使用。
---

# 验证 EVA Python Registry Demo

把 registry/安装身份、自动测试和真实设备回归分开报告。不得把本地 wheel、SDK checkout 或自动检查替代公开 registry consumer 证据，也不得把自动 PASS 冒充 Gateway/device PASS。

## 固定范围

- demo：`client-sdk/python/voice-dialogue-agent`
- 版本、registry、wheel 与 native library SHA 闭集：demo 的 `registry-release.json`
- 自动 verifier：`scripts/verify_registry_install.py`
- 不执行 upload、publish、Git commit、push、tag 或 release；不修改 SDK 仓。

## 自动验证

从仓库根执行，保持 cheap → expensive：

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
DEMO_DIR="$REPO_ROOT/client-sdk/python/voice-dialogue-agent"
python3 "$DEMO_DIR/check_env.py"
uv sync --directory "$DEMO_DIR" --frozen
node "$REPO_ROOT/scripts/verify-catalog.mjs"
uv run --directory "$DEMO_DIR" --frozen python -m pytest
REPORT_DIR="$(mktemp -d /private/tmp/eva-python-registry.XXXXXX)"
uv run --directory "$DEMO_DIR" --frozen python \
  "$REPO_ROOT/.agents/skills/verify-eva-python-demo-registry/scripts/verify_registry_install.py" \
  --report "$REPORT_DIR/report.json"
```

`verify_registry_install.py` 必须从 demo `.venv` 运行，并证实：

1. TestPyPI/PyPI 返回的 release version、wheel 文件名与 SHA-256 是 `registry-release.json` 的精确闭集。
2. 下载当前平台实际 wheel 后重新计算的 SHA-256 一致。
3. 已安装 distribution 与 `eva_client_sdk.__version__` 都是精确版本，且包位于 demo `.venv`。
4. 安装不含 `direct_url.json`，排除本地 path/wheel/editable 来源。
5. packaged native library 文件名/SHA、descriptor `eva-webrtc-aec3`、ABI 2 与 native version 均有效。

任一步失败都停止，不进入人工回归。报告路径必须是仓外新文件，不覆盖旧 evidence。

## 人工回归

自动门通过后，按 demo README 启动原样 demo，并分别记录：

- Gateway text/voice turn、Emotion、TTS playback。
- 开放扬声器 + 麦克风下的 AEC 实际效果。
- `--camera` 图片 turn、快速切换和 stop 后资源释放。

只有实际运行且 owner 确认的项目才能记 `DEVICE PASS`。缺 Gateway、设备、权限或人工观察时记 `NOT_RUN`/`BLOCKED`，自动报告中的 `manualRegression.status` 固定为 `NOT_RUN`。

## 报告

汇报 registry/version、实际 wheel 文件名/SHA、import version、native AEC identity、catalog/pytest 结果、人工边界、branch/HEAD/worktree/dirty。不得泄露 key、音频、图片或对话正文。
