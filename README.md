# dsh-pet-desktop

`dsh-pet-desktop` 是一个 Windows 桌面会话助手：以桌面宠物为入口进行对话，并在本机保存和管理聊天会话。

本项目派生自 [PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)，保留原项目署名与许可说明，详见[来源、署名与许可](#来源署名与许可)。

## 功能

- **桌面会话助手**：通过桌宠聊天框对话，右键桌宠可打开 AI 设置。
- **本地会话管理**：支持新建、切换和压缩会话；会话数据保存在本机。
- **可调聊天框**：拖动聊天框右缘、下缘或右下角调整大小。
- **桌面显示控制**：只提供桌面形态，“仅桌面”模式不始终置顶。
- **单文件 portable**：Windows x64 只需一个 EXE 文件，无需安装。

## Windows 使用

已有构建产物时，只需将 `dsh-pet-desktop-0.4.0-portable.exe` 复制到 Windows x64 电脑，双击运行。无需复制其他构建文件，也无需在 Windows 上安装 Node.js 或 pnpm。

这是 portable 单文件：每次启动都会先把应用自解压到 `%TEMP%` 的临时目录，退出后清理，因此启动会比直接运行解包后的应用稍慢。配置和日志不写入该临时目录，详见[数据与日志](#数据与日志)。

首次聊天前，右键桌宠，选择「打开 AI 设置」，配置模型与密钥。安装、构建和运行细节见 [INSTALL.md](INSTALL.md)。

## 本地会话命令

在聊天框中输入命令。`new`、`resume`、`compact` 均可直接输入，也可添加 `/` 前缀：

| 命令                                            | 作用                               |
| ----------------------------------------------- | ---------------------------------- |
| `new` 或 `/new`                                 | 创建并切换到新会话，已有会话仍保留 |
| `resume` 或 `/resume`                           | 显示本地会话列表                   |
| `resume <session-id>` 或 `/resume <session-id>` | 切换到指定会话                     |
| `compact` 或 `/compact`                         | 压缩当前会话                       |

`compact` 会调用当前聊天模型生成摘要，供后续对话使用；它不会删除原始消息历史。当前会话为空，或上次压缩后没有新消息时，不会生成新摘要。

## 数据与日志

配置和日志统一放在：

```text
$DSH_HOME/dsh-pet/
```

Windows 未设置 `DSH_HOME` 时，通常对应：

```text
%USERPROFILE%\.dsh\dsh-pet\
```

日志文件为该目录下的 `logs.txt`。更换 portable EXE 的位置不会把这些数据移到 EXE 旁边。

## 从源码构建

在 Linux 上构建，需要 Node.js **>= 22.12** 和 pnpm。在仓库根目录执行：

```sh
cd dsh-pet
pnpm install
./build.sh
```

最终产物位于包根目录：

```text
dist-app/dsh-pet-desktop-0.4.0-portable.exe
```

完整说明见 [INSTALL.md](INSTALL.md)。

## 来源、署名与许可

- **项目来源**：本项目派生自 <https://github.com/PC2005-cloud/dsh-pet>，原项目作者及版权署名为 **PC2005-cloud**。
- **代码**：MIT，见 [LICENSE](LICENSE)。
- **素材（动画/提示词/源视频）**：允许开源使用，**禁止商用**。
- **二次创作（二创）约定**：基于原项目的衍生、改版、换皮作品，在 GitHub 仓库、产品官网等公开渠道上须附上原作者 GitHub 地址：<https://github.com/PC2005-cloud/dsh-pet>。
- **形象出处**：宠物形象为社区二创的 DeepSeek「大肥鱼」（鲸鱼娘），**非 DeepSeek 官方形象**；原型「溟月」出自 B 站 [@上善无形](https://space.bilibili.com/4456176)，DeepSeek 版（女仆鲸鱼娘）设计出自 B 站 [@ZipZipPipe](https://space.bilibili.com/4168597)。
- **形象授权**：[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans)（署名、非商业、相同方式共享），[声明原文](https://www.bilibili.com/opus/1247156596114456581)：「大肥鱼是遵守CC BY-NC-SA 4.0协议的形象，不可以以任何形式商业化。若您非常喜爱该形象，希望其拥有实体，您可以自行定制。」
