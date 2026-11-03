# dsh-pet-desktop：Windows 使用与 Linux 构建

> 返回 [项目说明](README.md)

本文只说明 `dsh-pet-desktop` 的 Windows x64 使用和 Linux 源码构建。

## Windows 使用

### 运行

最终产物为单个文件：

```text
dsh-pet-desktop-X.X.X.exe
```

只需把这个 EXE 复制到 Windows x64 电脑的本地目录，双击运行。无需安装，也无需复制 `dist-app` 中的其他文件；Windows 运行端不需要 Node.js 或 pnpm。

首次聊天前，右键桌宠，选择「打开 AI 设置」，配置模型与密钥。

### portable 的启动方式

portable EXE 是自解压单文件：

1. 启动时把应用解压到 `%TEMP%` 下的临时目录；
2. 从临时目录运行应用；
3. 退出后清理临时解压内容。

因此每次启动会比直接运行解包后的应用稍慢。不要把文件或配置放进该临时目录。

### 会话与窗口

聊天框支持 `new`、`resume`、`compact`，也支持对应的 `/new`、`/resume`、`/compact` 斜杠别名：

- `new`：创建并切换到新会话。
- `resume`：显示本地会话列表；`resume <session-id>` 切换到指定会话。
- `compact`：调用当前聊天模型生成摘要，同时保留原始消息历史。

可拖动聊天框右缘、下缘或右下角调整大小。应用仅提供桌面窗口，“仅桌面”模式不始终置顶。

### 配置与日志

配置和日志位于：

```text
$DSH_HOME/dsh-pet/
```

Windows 未设置 `DSH_HOME` 时，通常是：

```text
%USERPROFILE%\.dsh\dsh-pet\
```

日志文件：

```text
%USERPROFILE%\.dsh\dsh-pet\logs.txt
```

portable 的临时解压目录不是配置或日志目录；移动 EXE 也不会改变上述持久化位置。

## Linux 构建

### 前置要求

- Linux 构建环境
- Node.js **>= 22.12**
- pnpm

可检查工具版本：

```sh
node --version
pnpm --version
```

### 构建步骤

在仓库根目录执行：

```sh
cd dsh-pet
pnpm install
./build.sh
```

`pnpm install` 安装构建依赖，`./build.sh` 完成应用构建和 Windows portable 打包。

构建完成后，产物位于包根目录。`X.X.X` 取自仓库中最高的 `vX.X.X` / `VX.X.X` 标签，没有有效标签时使用 `package.json` 版本：

```text
dist-app/dsh-pet-desktop-X.X.X.exe
```

从仓库根目录看，对应路径为：

```text
dsh-pet/dist-app/dsh-pet-desktop-X.X.X.exe
```

分发或迁移时只复制这个 EXE 到 Windows x64 本地运行即可，不需要携带整个 `dist-app` 目录。
