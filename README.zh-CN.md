# Zero Token Extension

[English README](./README.md)

这是一个 **local-first** 的 Chrome 扩展，用来抓取 Microsoft 365 API token 和 X session cookie，并统一同步到本地 JSON 凭证文件，方便 CLI 自动化脚本复用。

## 它能做什么

- 从浏览器请求里抓取 Microsoft Graph、Outlook、SharePoint Bearer token
- 通过 Chrome cookie API 抓取 X 的 `ct0` 和 `auth_token`
- 把所有凭证统一写入 `~/.zero-click/.env.json`
- 全程只落本地，不上传到任何远端服务

## 运行要求

- Google Chrome
- 打开开发者模式的扩展页面
- Python 3（用于 native messaging host）
- 本地已经 checkout 这个仓库

## 仓库结构

```text
zero-token-extension/
├── extension/    # Chrome 已解压扩展
├── native-host/  # 本地同步桥接、store helper、迁移工具
├── LICENSE
├── README.md
└── README.zh-CN.md
```

## 支持来源

| 网站 | 抓取内容 | 常见用途 |
|------|----------|----------|
| [Outlook Web](https://outlook.cloud.microsoft/mail/) | Graph + Outlook | 邮件、日历、部分 Teams 相关能力 |
| [Teams Web](https://teams.microsoft.com/) | Graph | Teams 聊天与 Graph 请求 |
| [OneDrive / SharePoint](https://pgone-my.sharepoint.com/) | SharePoint | 文件、录屏、转写 |
| [X](https://x.com/) | `ct0` + `auth_token` | X 会话自动化 |

## 安装扩展

1. 打开 `chrome://extensions/`
2. 开启 **Developer mode / 开发者模式**
3. 点击 **Load unpacked / 加载已解压的扩展程序**
4. 选择 `zero-token-extension/extension/`

## 开启本地同步

1. 在 `chrome://extensions/` 里复制扩展 ID
2. 运行：

```bash
python3 native-host/install_native_host.py --extension-id YOUR_EXTENSION_ID
```

3. 回到 Chrome 重新加载扩展

如果你之前加载的是别的 unpacked 路径，Chrome 可能会分配新的扩展 ID；发生这种情况时，再用新的 ID 重跑一次安装命令。

## 日常使用

1. 正常使用 Outlook、Teams、SharePoint、OneDrive 或 X
2. 打开扩展弹窗
3. 查看当前抓到的凭证
4. 点击 **Sync to local**

弹窗会显示抓取状态、token 新鲜度、cookie 持久/会话状态，以及同步结果。

## 本地存储格式

所有凭证写入 `~/.zero-click/.env.json`，当前 schema 如下：

```json
{
  "schema_version": 1,
  "o365": {
    "graph": {},
    "outlook": {},
    "sharepoint": {}
  },
  "x": {
    "ct0": "",
    "auth_token": ""
  }
}
```

## CLI 辅助脚本

如果你手动复制了 token，也可以直接写入共享凭证文件：

```bash
python3 native-host/save_token.py "eyJ..."
```

脚本会自动识别 token 类型并更新 store。

## 隐私与安全

- 凭证先保存在 Chrome 本地存储中，只有你点击同步时才写入本地文件
- Native sync 只写你机器上的本地文件
- 仓库里不包含真实凭证；不要把你自己的 `~/.zero-click/.env.json` 提交进 git

## 开发说明

- 当前扩展版本：`1.0.12`
- Native messaging host 名称：`dev.zerotoken.extension_bridge`
- 只要仓库路径变化，就需要重新运行 `native-host/install_native_host.py`
