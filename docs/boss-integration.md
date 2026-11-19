# BOSS 职位接入中心

职启云帆的 BOSS 接入采用本机 Docker 服务 + Chrome/Edge Manifest V3 扩展的半自动流程。目标是把当前已经打开、已经显示的 BOSS 岗位带回本机职位池，再从职位池进入既有 JD 匹配、简历定制、模板选择和投递管理。

## 数据边界

- 扩展只读取当前活动 BOSS 标签页中已经显示在 DOM 里的职位。
- 扩展不读取 BOSS 密码、聊天内容、Cookie 或其他标签页。
- 不绕过登录、验证码、风控或付费限制。
- 不自动批量投递或自动发送招呼。最终操作由用户在 BOSS 页面确认。
- API Key 只保存在网页的浏览器 localStorage；测试连接和 Agent 调用会临时把配置放入本机请求头，后端完成请求后立即丢弃，不写入数据库或日志。
- 职位数据保存在本机 Docker 的 SQLite 中，不发送到职启云帆自建服务之外的岗位平台。

## 1. 启动本机服务

在项目根目录执行：

```powershell
docker compose up -d --build
```

打开 http://127.0.0.1:18001/ ，进入顶部导航中的“BOSS 接入”。

## 跨设备数据

- 经历库、简历版本、投递记录和 BOSS 职位保存在本机 Docker 的 SQLite。
- 默认仅本机可访问；需要在可信局域网跨设备使用时，在 `.env` 设置 `YUNFAN_BIND_HOST=0.0.0.0`，并把实际访问使用的局域网 IP 或私有 DNS 名加入 `YUNFAN_ALLOWED_HOSTS`，再通过该明确地址访问。Host 白名单不接受 `*`。当前无账户认证，禁止直接暴露公网。
- 浏览器 localStorage 仍保留一份缓存，服务器暂时离线时不会阻断当前页面。
- API Key、Base URL 和模型名称不属于工作区同步内容，只保存在当前浏览器。
- 跨设备修改使用 revision 乐观锁；冲突时当前浏览器会保留本地修改，并让用户选择本地版本或服务器版本。
- 当前是无账户、单用户设计，不支持多人隔离，也不应直接暴露到公网。

## 2. 加载扩展

1. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择项目根目录下的 `extension` 文件夹。
5. 固定“职启云帆 BOSS 职位采集器”。

扩展默认服务地址为 `http://127.0.0.1:18001`。如果本地端口改变，在扩展弹窗中修改并先点“测试连接”。

仓库内的 `manifest.json` 包含固定公钥，因此扩展 ID 固定为 `jdacbgmhcbpkoccblehfahhoekjiiopl`；后端默认已允许 `chrome-extension://jdacbgmhcbpkoccblehfahhoekjiiopl`，移动扩展目录后也无需额外配置 CORS。自定义扩展 ID 时，必须把完整 Origin 加入 `YUNFAN_CORS_ORIGINS` 并重启服务。

## 3. 配置个人 AI 接口

进入网页“BOSS 接入” → “API 配置”：

- 请求地址：例如 `https://open.bigmodel.cn/api/paas/v4`
- 模型：填写该服务实际可用的模型名
- API Key：由用户填写，仅保存到当前浏览器

网页不会把 API Key 写入职位 SQLite、JSON 数据备份或 Git。更换浏览器或清除站点数据后需要重新填写。

## 4. 从 BOSS 采集职位

1. 在 BOSS 登录自己的账号。
2. 打开职位搜索结果页，或打开某个职位详情页。
3. 点击固定好的职启云帆 BOSS 采集器扩展。
4. 先测试连接，再点“采集当前页”。
5. 回到职启云帆的“职位池”刷新。

搜索结果页会按当前 DOM 可见职位卡片提取；详情页会补全当前职位描述。若页面尚未加载、存在验证码或 BOSS 修改了页面结构，扩展会提示没有识别到职位。

## 5. 匹配和投递

在职位池中：

- “用这份 JD 匹配”会把公司、岗位和描述带入现有 JD 匹配模块。
- “编辑简历”跳到当前简历版本。
- “回到 BOSS”只打开原始职位页。
- “删除”只删除本机职位池记录，不影响 BOSS。

最终在 BOSS 页面检查简历、招呼语和目标职位，再由用户点击发送或投递。现阶段不提供无人值守自动投递。

## 故障排查

- 扩展显示无法连接：确认 Docker 服务健康、地址为 `http://127.0.0.1:18001`。
- 职位池为空：打开 BOSS 搜索结果或详情后重新采集；确认页面内容已加载。
- 只采集到部分字段：BOSS 的 DOM 和 A/B 测试会变化，打开详情页后再次采集通常能补全描述。
- API 测试失败：确认 Base URL 不包含 `/chat/completions`，并检查模型名、密钥、网络以及服务商是否兼容 OpenAI Chat Completions 格式。

## 接口

- `GET /api/boss/health`
- `POST /api/boss/jobs/import`
- `GET /api/boss/jobs?limit=30&offset=0`（响应头含 `X-Total-Count`）
- `GET /api/boss/jobs/{id}`
- `DELETE /api/boss/jobs/{id}`
- `GET /api/workspace`
- `PUT /api/workspace`
- `POST /api/provider/test`
