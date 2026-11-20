# 职启云帆 BOSS 职位采集器

这是一个可选的 Chrome/Edge Manifest V3 扩展。你在 BOSS 页面主动点击采集后，它只读取当前标签页中已经显示的职位，并把结果发送到你配置的职启云帆本机服务。

## 普通用户操作

### 安装

1. 先启动职启云帆，默认地址为 `http://127.0.0.1:18001`。
2. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
3. 开启 **开发者模式**。这个开关只用于允许浏览器加载本地扩展，不需要编程。
4. 点击 **加载已解压的扩展程序**，选择本目录 `extension`。
5. 建议把“职启云帆 BOSS 职位采集器”固定到工具栏。

### 采集职位

1. 在 BOSS 直聘手动登录，打开职位搜索结果或职位详情。
2. 等职位卡片、详情或描述加载完成。
3. 点击扩展图标，确认或修改本机服务地址。
4. 点击 **测试连接**。
5. 点击 **采集当前页**。
6. 查看“处理总数”“新增”“更新”三项统计。
7. 回到职启云帆的 **机会中心 → BOSS 职位收件箱** 查看并处理岗位。

### 使用边界

- 只读取你主动点击后当前活动标签页中已经渲染的职位；
- 不自动翻页、滚动、点击职位或投递；
- 不读取密码、聊天、Cookie 或其他标签页；
- 不绕过登录、验证码和 BOSS 风控；
- 最终简历确认、招呼语和投递由你在 BOSS 页面手动完成。

### 常见问题

**无法连接**：确认职启云帆已启动，打开 `http://127.0.0.1:18001/api/boss/health` 检查。

**采集为空**：确认职位卡片或详情已经显示；页面改版、登录墙、验证码或尚未渲染的虚拟列表都可能无法识别。

**服务地址变了**：在扩展弹窗更新地址并重新测试连接。

完整教程见 [BOSS 接入教程](../docs/boss-integration.md)。

---

# 开发者文档

## 扩展 ID 与 CORS

`manifest.json` 包含固定公钥，扩展 ID 稳定为：

```text
jdacbgmhcbpkoccblehfahhoekjiiopl
```

后端默认只允许这个精确 Origin：

```text
chrome-extension://jdacbgmhcbpkoccblehfahhoekjiiopl
```

移动扩展目录不需要重新配置 CORS。修改公钥导致 ID 改变时，必须把完整新 Origin 加入 `YUNFAN_CORS_ORIGINS` 并重启服务。

## 权限

- `activeTab`：用户点击扩展后临时访问当前活动标签页；
- `scripting`：向当前标签页注入受控解析器；
- `storage`：保存本机服务地址；
- 默认 `host_permissions`：`http://127.0.0.1/*`、`http://localhost/*`。

RFC1918 局域网、`.local`、Tailscale `100.64/10` 与 `.ts.net` 地址需要用户明确操作后请求可选 host 权限。公网地址被拒绝。

## 服务地址

默认：

```text
http://127.0.0.1:18001
```

第一次使用非本机地址时，扩展会请求该主机权限。服务端必须：

1. 绑定实际使用的私有地址；
2. 将访问使用的 Host 加入 `YUNFAN_ALLOWED_HOSTS`；
3. 对网页 Origin 配置精确 CORS；
4. 仅限可信局域网或 Tailscale，禁止直接暴露公网。

## 解析器契约

解析器限制在职位卡片和职位详情语义容器内，并排除脚本、聊天和消息区域。详情页找不到可靠容器时返回空结果，不回退扫描整个 `document`。

采集字段：

```text
source_job_id, source_url, company, title, location, salary,
experience, education, description, recruiter_name,
recruiter_title, tags, fetched_at
```

统计字段语义：

- 处理总数：`total` / `processed`；
- 新增：`imported` / `created`；
- 更新：`updated`。

缺少某字段时显示“未知”，不把处理总数误标为成功导入数。

## API

- `GET /api/boss/health`
- `POST /api/boss/jobs/import`
- `GET /api/boss/jobs?limit=50&offset=0`，默认 50、最大 200
- `GET /api/boss/jobs/{id}`
- `DELETE /api/boss/jobs/{id}`

## 测试

```powershell
cd extension
npm.cmd test
```

测试不依赖第三方 DOM 库，使用内置最小 DOM 适配器读取 `tests/fixtures` 的列表页和详情页样例。

## 已知风险

BOSS 直聘的 class 名称和 DOM 会随版本、A/B 测试和登录状态改变。解析器使用多个语义候选和详情链接回退，但大幅改版后仍需更新。虚拟列表未渲染内容、登录墙、验证码和聊天区域不在采集范围。
