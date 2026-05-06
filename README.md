# AI 文生图网站

暗黑风印花设计专用的 AI 文生图工具。

## 快速启动

```bash
cd text-to-image-web
python server.py
```

然后浏览器打开：http://localhost:8080

---

## 支持的 API 平台

| 平台 | 注册地址 | 费用 |
|------|----------|------|
| 阿里云通义万象 | https://bailian.console.aliyun.com/ | 新用户免费额度 |
| 腾讯云混元 | https://console.cloud.tencent.com/ | 按量付费 |
| 智谱 CogView | https://open.bigmodel.cn/ | 注册送免费额度 |
| Stability AI | https://platform.stability.ai/ | 按量付费 |

---

## 配置 API Key

1. 打开网站后，点击右上角 **⚙️ 设置**
2. 选择服务商
3. 粘贴 API Key
4. 点击保存

**Key 只保存在本地浏览器，不会上传任何服务器。**

---

## 各平台 Key 格式

- **阿里云**：`sk-xxxxxxxxxxxxxxxx`
- **腾讯云**：`SecretId::SecretKey`（用 :: 分隔两个值）
- **智谱**：`xxxxxxxxxxxxxxxx.xxxxxxxxxxxxxxxx`
- **Stability**：`sk-xxxxxxxxxxxxxxxx`

---

## 功能特性

- ✅ 支持4个主流 AI 图像平台
- ✅ 正向/反向提示词
- ✅ 风格快选（暗黑/国潮/赛博朋克等）
- ✅ 尺寸选择（1:1 / 竖版 / 横版）
- ✅ 批量生成（最多4张）
- ✅ 一键下载图片
- ✅ 提示词复制
- ✅ 本地存储配置
