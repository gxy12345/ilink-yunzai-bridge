# iLink-Yunzai Bridge

WeChat ClawBot (iLink 协议) 与多种 Bot 后端之间的桥接程序。

## 概述

本程序作为 ComWeChat 的替代品，实现了以下功能：

1. **脱离 OpenClaw 依赖**：直接调用微信 iLink HTTP API，不需要 OpenClaw SDK 或 AI 模型
2. **多后端支持**：同时连接多个 Bot 后端（Yunzai-Bot、gsuid_core 等），收到消息时按顺序广播到所有后端
3. **多设备支持**：同时管理多个 ClawBot 实例，所有消息统一交由后端处理
4. **Web 管理界面**：通过浏览器管理设备、扫码登录、查看状态
5. **跨平台**：基于 Node.js，支持 Windows、Linux、macOS，提供 Docker 部署方案

### 支持的后端类型

| 后端类型 | 协议 | 说明 |
|---|---|---|
| `comwechat` | ComWeChat WebSocket | Yunzai-Bot (默认) |
| `gsuidcore` | gsuid_core WebSocket | 早柚核心 (GsCore) |

## 架构

```
                         ┌──────────────────┐
WeChat User ──(iLink)──► │  iLink Session   │
                         └────────┬─────────┘
                                  │
                         ┌────────┴─────────┐
                         │     Device #N    │
                         │   (message hub)  │
                         └──┬─────────────┬─┘
                            │             │
               ┌────────────┘             └────────────┐
               ▼                                       ▼
    ┌──────────────────┐                 ┌──────────────────────┐
    │ ComWeChatWsClient│                 │  GsuidCoreWsClient   │
    │  /ComWeChat      │                 │  /ws/{bot_id}        │
    └────────┬─────────┘                 └──────────┬───────────┘
             ▼                                      ▼
        Yunzai-Bot                              gsuid_core
                         ┌──────────────────┐
                         │ Web Management UI│
                         │ http://host:3001 │
                         └──────────────────┘
```

### 消息流转

**收消息 (WeChat → 后端)**：
1. iLink 长轮询 (`getupdates`) 接收微信用户消息
2. 桥接程序按后端类型将 iLink 消息转换为对应协议格式
   - ComWeChat 后端：转为 ComWeChat event 格式
   - gsuid_core 后端：转为 `MessageReceive` 格式
3. 按配置顺序依次通过 WebSocket 发送到各后端

**发消息 (后端 → WeChat)**：
- **ComWeChat 后端**：Yunzai-Bot 发送 `send_message` API 请求 → 转为 iLink `item_list` → 发回微信
- **gsuid_core 后端**：gsuid_core 发送 `MessageSend` 消息 → 解析 `content` 列表 → 文本直接发送，图片通过 CDN 上传后发送

## 快速开始

### 环境要求

- Node.js >= 18
- 正在运行的 Yunzai-Bot 实例

### 安装

```bash
cd ilink-yunzai-bridge
npm install
```

### 配置

复制配置模板并修改：

```bash
cp config.example.yaml config.yaml
```

#### 单后端配置 (Yunzai-Bot)

```yaml
backends:
  - name: "yunzai"
    type: "comwechat"
    host: "127.0.0.1"
    port: 2536
    path: "/ComWeChat"
    reconnect_interval: 5000
```

#### 多后端配置 (Yunzai-Bot + gsuid_core)

```yaml
backends:
  - name: "yunzai"
    type: "comwechat"
    host: "127.0.0.1"
    port: 2536
    path: "/ComWeChat"
    reconnect_interval: 5000

  - name: "gsuid-core"
    type: "gsuidcore"
    host: "127.0.0.1"
    port: 8765
    bot_id: "wechat"        # gsuid_core WebSocket 路径中的 bot_id
    token: ""               # WS_TOKEN 认证（本地连接可为空）
    reconnect_interval: 5000
```

#### 旧版兼容格式

仍然支持旧的 `yunzai:` 单后端格式，会自动转换为 ComWeChat 类型的 backends 数组：

```yaml
yunzai:
  host: "127.0.0.1"
  port: 2536
  reconnect_interval: 5000
```

#### 其他配置

```yaml
# Web 管理界面
web:
  enabled: true
  host: "0.0.0.0"
  port: 3001
```

### 启动

```bash
npm start
```

### 添加设备

1. 打开浏览器访问 `http://localhost:3001`
2. 点击 "Add Device" 按钮
3. 输入设备名称（必填，不可与已有设备重名）
4. 点击 "Login" 生成二维码，使用微信扫描
5. 确认登录后设备自动连接到所有已配置的后端

## Docker 部署

### 构建镜像

```bash
docker build -t ilink-yunzai-bridge .
```

### 运行容器

```bash
docker run -d \
  --name ilink-bridge \
  -p 3001:3001 \
  -v $(pwd)/config.yaml:/app/config.yaml \
  -v $(pwd)/data:/app/data \
  ilink-yunzai-bridge
```

### Docker Compose

```yaml
version: '3'
services:
  ilink-bridge:
    build: .
    ports:
      - "3001:3001"
    volumes:
      - ./config.yaml:/app/config.yaml
      - ./data:/app/data
    restart: unless-stopped
```

## 项目结构

```
ilink-yunzai-bridge/
├── src/
│   ├── index.mjs               # 入口
│   ├── config.mjs               # 配置加载 (支持多后端)
│   ├── logger.mjs               # 日志模块
│   ├── ilink-client.mjs         # iLink HTTP API 封装
│   ├── ilink-session.mjs        # iLink 会话管理 (登录/轮询)
│   ├── cdn.mjs                  # CDN 图片上传 (AES 加密)
│   ├── comwechat-ws.mjs         # ComWeChat WebSocket 客户端 (Yunzai)
│   ├── translator.mjs           # 协议翻译 (iLink ↔ ComWeChat)
│   ├── gsuidcore-ws.mjs         # gsuid_core WebSocket 客户端 (GsCore)
│   ├── gsuidcore-translator.mjs # 协议翻译 (iLink ↔ gsuid_core)
│   ├── device.mjs               # 设备桥接 (iLink + 多后端)
│   ├── device-manager.mjs       # 多设备管理器
│   ├── web-server.mjs           # Web API 服务器
│   ├── web-page.mjs             # Web UI 页面
│   └── invite-page.mjs          # 邀请链接页面
├── data/                        # 运行时数据 (tokens, cursors)
├── config.example.yaml          # 配置模板
├── Dockerfile                   # Docker 镜像定义
├── package.json
└── README.md
```

## 协议映射说明

### iLink → ComWeChat (Yunzai-Bot)

**消息类型映射**：

| iLink `item.type` | ComWeChat `segment.type` | 说明 |
|---|---|---|
| 1 (text) | `text` | 文本消息 |
| 2 (image) | `image` | 图片消息 |
| 3 (voice) | `voice` | 语音消息 |
| 4 (file) | `file` | 文件消息 |
| 5 (video) | `video` | 视频消息 |

**API 映射**：

| ComWeChat Action | iLink Endpoint | 说明 |
|---|---|---|
| `send_message` | `ilink/bot/sendmessage` | 发送消息 |
| `upload_file` | CDN 3-step upload | 上传文件/图片 |
| `get_self_info` | (本地模拟) | 返回 Bot 信息 |
| `get_friend_list` | (本地缓存) | 返回已知联系人 |
| `get_version` | (本地模拟) | 返回版本信息 |

### iLink → gsuid_core (早柚核心)

**收消息**：iLink 消息转为 gsuid_core `MessageReceive` 格式：

| 字段 | 说明 |
|---|---|
| `bot_id` | 配置中的 `bot_id`（默认 `"wechat"`） |
| `bot_self_id` | 设备的 sessionId |
| `user_type` | 固定 `"direct"`（ClawBot 仅支持私聊） |
| `content` | 消息内容列表，文本为 `{type: "text"}`，图片为 `{type: "image", data: "link://url"}` |

**发消息**：gsuid_core `MessageSend` 中的 `content` 列表支持：

| `content.type` | 处理方式 |
|---|---|
| `text` | 直接发送文本 |
| `image` | 支持 `base64://` 和 `link://` 前缀，自动下载/解码后通过 CDN 上传到微信 |
| `node` | 递归处理合并转发消息 |

### 图片发送流程

Bot 回复图片时，桥接程序执行 CDN 3 步上传：

1. **申请上传**：调用 `ilink/bot/upload/apply` 获取上传地址和加密密钥
2. **AES 加密上传**：使用 AES-128-ECB (PKCS7) 加密图片后上传到 CDN
3. **确认上传**：调用 `ilink/bot/upload/confirm` 获取文件 `fileid`
4. 将 `fileid` 作为 `item_list` 中的图片项发送到微信

## Web API

| Method | Path | 说明 |
|---|---|---|
| GET | `/` | 管理界面 |
| GET | `/api/health` | 健康检查 |
| GET | `/api/devices` | 设备列表和统计 |
| POST | `/api/devices` | 添加设备 |
| DELETE | `/api/devices/:id` | 删除设备 |
| POST | `/api/devices/:id/login` | 发起 QR 登录 |
| GET | `/api/devices/:id/qr-status` | 轮询 QR 状态 |
| POST | `/api/devices/:id/start` | 启动设备 |
| POST | `/api/devices/:id/stop` | 停止设备 |

## 注意事项

- ClawBot 目前只支持私聊（1v1），不支持群聊
- 每个 ClawBot 实例对应一个微信用户，扫码的人即为使用者
- 设备名称（sessionId）为必填项且不可重复，用作后端通信中的用户标识
- `context_token` 由 iLink 每次消息下发，需要在回复时回传，程序自动管理
- Token 保存在 `data/accounts/` 目录，重启后自动恢复登录状态
- 删除设备会同时清理磁盘上的 token 和 cursor 文件，确保重启后不会复现
- 若出现 `errcode: -14`（会话过期），需要重新扫码登录
- 配置多后端时，收到的每条消息会广播到所有已连接的后端；各后端独立发送回复
- gsuid_core 后端通过 `msgspec` JSON bytes 序列化通信，桥接程序自动处理编解码

## 鸣谢

本项目参考了以下项目的代码

- [WeClawBot-ex](https://github.com/ImGoodBai/WeClawBot-e)
- [weixin-ClawBot-API](https://github.com/SiverKing/weixin-ClawBot-API)
- [WeClawBot-API](https://github.com/Cp0204/WeClawBot-API)
