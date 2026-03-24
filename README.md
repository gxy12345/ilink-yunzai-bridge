# iLink-Yunzai Bridge

WeChat ClawBot (iLink 协议) 与 Yunzai-Bot (ComWeChat 适配器) 之间的桥接程序。

## 概述

本程序作为 ComWeChat 的替代品，实现了以下功能：

1. **脱离 OpenClaw 依赖**：直接调用微信 iLink HTTP API，不需要 OpenClaw SDK 或 AI 模型
2. **多设备支持**：同时管理多个 ClawBot 实例，所有消息统一交由同一个 Yunzai-Bot 后端处理
3. **Web 管理界面**：通过浏览器管理设备、扫码登录、查看状态
4. **跨平台**：基于 Node.js，支持 Windows、Linux、macOS，提供 Docker 部署方案

## 架构

```
WeChat User ──(iLink HTTP)──► iLink-Yunzai Bridge ──(WebSocket)──► Yunzai-Bot
                                     │
                              ┌──────┴──────┐
                              │  Device #1  │  (ClawBot Instance 1)
                              │  Device #2  │  (ClawBot Instance 2)
                              │  Device #N  │  (ClawBot Instance N)
                              └──────┬──────┘
                                     │
                              Web Management UI
                              http://host:3001
```

### 消息流转

**收消息 (WeChat → Yunzai)**：
1. iLink 长轮询 (`getupdates`) 接收微信用户消息
2. 桥接程序将 iLink 消息格式转换为 ComWeChat 协议格式
3. 通过 WebSocket 发送到 Yunzai-Bot

**发消息 (Yunzai → WeChat)**：
1. Yunzai-Bot 通过 WebSocket 发送 ComWeChat `send_message` 请求
2. 桥接程序将 ComWeChat 消息段转换为 iLink `item_list`
3. 调用 iLink `sendmessage` API 发送到微信

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

主要配置项：

```yaml
# Yunzai-Bot WebSocket 服务器地址
yunzai:
  host: "127.0.0.1"   # Yunzai 的 IP
  port: 2536           # Yunzai 的端口

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
3. 输入设备名称（可选）
4. 使用微信扫描二维码
5. 确认登录后设备自动连接

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
│   ├── index.mjs           # 入口
│   ├── config.mjs           # 配置加载
│   ├── logger.mjs           # 日志模块
│   ├── ilink-client.mjs     # iLink HTTP API 封装
│   ├── ilink-session.mjs    # iLink 会话管理 (登录/轮询)
│   ├── comwechat-ws.mjs     # ComWeChat WebSocket 客户端
│   ├── translator.mjs       # 协议翻译 (iLink ↔ ComWeChat)
│   ├── device.mjs           # 设备桥接 (iLink + WS 组合)
│   ├── device-manager.mjs   # 多设备管理器
│   ├── web-server.mjs       # Web API 服务器
│   └── web-page.mjs         # Web UI 页面
├── data/                    # 运行时数据 (tokens, cursors)
├── config.example.yaml      # 配置模板
├── Dockerfile               # Docker 镜像定义
├── package.json
└── README.md
```

## 协议映射说明

### iLink 消息类型 → ComWeChat 消息段

| iLink `item.type` | ComWeChat `segment.type` | 说明 |
|---|---|---|
| 1 (text) | `text` | 文本消息 |
| 2 (image) | `image` | 图片消息 |
| 3 (voice) | `voice` | 语音消息 |
| 4 (file) | `file` | 文件消息 |
| 5 (video) | `video` | 视频消息 |

### ComWeChat API → iLink API

| ComWeChat Action | iLink Endpoint | 说明 |
|---|---|---|
| `send_message` | `ilink/bot/sendmessage` | 发送消息 |
| `get_self_info` | (本地模拟) | 返回 Bot 信息 |
| `get_friend_list` | (本地缓存) | 返回已知联系人 |
| `get_version` | (本地模拟) | 返回版本信息 |

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
- `context_token` 由 iLink 每次消息下发，需要在回复时回传，程序自动管理
- Token 保存在 `data/accounts/` 目录，重启后自动恢复登录状态
- 若出现 `errcode: -14`（会话过期），需要重新扫码登录

## 鸣谢

本项目参考了以下项目的代码

- [WeClawBot-ex](https://github.com/ImGoodBai/WeClawBot-e)
- [weixin-ClawBot-API](https://github.com/SiverKing/weixin-ClawBot-API)
- [WeClawBot-API](https://github.com/Cp0204/WeClawBot-API)
