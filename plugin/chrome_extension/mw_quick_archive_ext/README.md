# MakerWorld 快速归档助手（Chrome 扩展）

## 功能
- 配置后端 API 地址（默认 `http://127.0.0.1:8000`）
- 配置 API Token（公网部署时用于 Bearer 鉴权）
- 仅在 `https://makerworld.com.cn/zh/models/*` 页面显示「归档模型」按钮
- 点击扩展图标弹出菜单：保存地址、同步 Cookie、归档当前模型
- 使用 `chrome.cookies` 同步 Cookie（包含 HttpOnly）

## 安装
1. 打开 `chrome://extensions/`
2. 开启右上角「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择本目录：`plugin/chrome_extension/mw_quick_archive_ext`

## 使用
1. 先登录网页控制台并生成一个 API Token
2. 打开扩展选项页，填写后端地址和 API Token
3. 点击「同步 Cookie」
4. 在模型页面点击右下角「归档模型」或弹窗中的「归档当前模型」

## 后端接口
- `POST /api/cookie` body: `{ "cookie": "..." }`
- `POST /api/archive` body: `{ "url": "https://makerworld.com.cn/zh/models/..." }`
- `GET /api/config`（测试连接）

以上接口在公网部署时都需要请求头：

```http
Authorization: Bearer <token>
```
