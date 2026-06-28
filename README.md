# 🏀 坤坤云

一个轻量级的文件传输网页应用，支持个人空间和共享空间，适合朋友之间分享文件。

## ✨ 功能特性

- **文件上传/下载** - 支持拖拽上传，最大 10GB
- **个人空间** - 只有自己能看到和管理的私有文件
- **共享空间** - 所有登录用户都能看到的公共文件
- **自定义过期时间** - 1小时/3小时/12小时/24小时/3天/7天/30天
- **COS 云存储** - 文件存储在腾讯云 COS，安全可靠
- **用户系统** - 注册、登录、找回密码（邮件验证码）
- **管理员系统** - 管理员/副管理员/普通用户三级权限
- **Canvas 图形验证码** - 防机器人，每次刷新样式不同
- **分享链接** - 一键复制分享链接，无需登录即可下载

## 🚀 快速开始

### 环境要求

- Node.js 16+
- 腾讯云 COS（可选，不配置则使用本地存储）

### 安装

```bash
git clone https://github.com/changlicxk/kunkun-cloud.git
cd kunkun-cloud
npm install
```

### 配置

复制配置模板并填入你的信息：

```bash
cp config.example.json config.json
```

编辑 `config.json`：

```json
{
  "cos": {
    "secretId": "你的COS SecretId",
    "secretKey": "你的COS SecretKey",
    "bucket": "你的桶名",
    "region": "ap-beijing"
  },
  "smtp": {
    "user": "你的QQ邮箱",
    "pass": "你的SMTP授权码"
  },
  "superAdmin": "changlicxk",
  "port": 3000
}
```

### 启动

```bash
node server.js
```

访问 http://localhost:3000

## 🔐 默认管理员

| 项目 | 值 |
|------|-----|
| 用户名 | `changlicxk` |
| 密码 | `230602120` |
| 邮箱 | `2779330680@qq.com` |

> ⚠️ 首次登录后请立即修改密码！

## 📁 项目结构

```
kunkun-cloud/
├── server.js            # 后端服务
├── config.json          # 配置文件（不上传）
├── config.example.json  # 配置模板
├── package.json
├── public/
│   ├── index.html       # 主页面
│   ├── login.html       # 登录/注册页面
│   ├── favicon.png
│   └── images/          # 装饰图片、背景、光标
├── data/                # 用户数据（不上传）
│   ├── users.json
│   ├── sessions.json
│   └── meta.json
└── uploads/             # 本地上传文件（不上传）
```

## 🛠️ 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 HTML/CSS/JavaScript
- **存储**: 腾讯云 COS / 本地文件系统
- **邮件**: QQ 邮箱 SMTP
- **验证码**: Canvas 图形验证码

## 📝 更新日志

- 修复中文文件名乱码问题
- 修复下载和分享按钮不响应
- 添加 Canvas 图形验证码
- 敏感配置提取到 config.json
- 添加管理员/副管理员权限系统

## 📄 License

MIT
