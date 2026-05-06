# Cloudflare Pages 部署配置

## 项目结构（最终版）

`
text-to-image-web/
├── index.html          # 主页面
├── style.css           # 样式
├── app.js              # 前端逻辑
├── functions/
│   └── api/
│       └── tencent.js  # 腾讯云 API 路由（Cloudflare Pages Function）
├── vercel.json         # Vercel 备用配置
├── README.md
├── DEPLOY.md
└── 启动网站.bat
`

## Cloudflare Pages 配置要求

- **Build command**: （留空）
- **Build output directory**: /
- **Environment variables**: 需在 Cloudflare Pages 设置中配置：
  - TENCENT_SECRET_ID
  - TENCENT_SECRET_KEY

## 路由说明

- 前端: index.html → 自动部署到根路径
- API 函数: unctions/api/tencent.js → 路由为 /api/tencent
- 腾讯云签名: 在 unctions/api/tencent.js 中使用 Web Crypto API 完成

## 注意事项

- 已删除所有 Python 相关文件（api/, server.py, railway.json）
- 已删除 wrangler.toml（Cloudflare Pages 自动识别 functions/ 目录）
- 无需 wrangler 工具，纯 GitHub 推送触发自动部署
