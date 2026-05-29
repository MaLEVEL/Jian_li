# JobFit AI Backend

FastAPI + SQLite 后端服务，提供简历上传、岗位创建、AI 匹配分析、投递记录、状态更新和面试题接口。匹配报告和面试题都会保存到投递记录中。

简历上传限制为 2 MB，会拒绝伪装成 `.txt` 的二进制内容，并使用内容 hash 避免重复保存相同简历。

## 运行

```powershell
cd archive\backend-legacy
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

服务默认地址：`http://127.0.0.1:8000`

## 环境变量

可选配置 OpenAI 兼容接口：

```powershell
$env:OPENAI_API_KEY="your-api-key"
$env:OPENAI_BASE_URL="https://api.openai.com/v1"
$env:OPENAI_MODEL="gpt-4o-mini"
$env:OPENAI_MAX_RETRIES="2"
$env:OPENAI_TIMEOUT_SECONDS="30"
```

如果没有 `OPENAI_API_KEY`，服务会使用本地 fallback，方便离线测试。

## 测试

```powershell
cd archive\backend-legacy
pytest
```

## 主要接口

- `GET /api/health`
- `POST /api/resumes`：multipart 字段名 `file`，支持 `.txt` 和 `.pdf`
- `DELETE /api/resumes/{id}`：删除简历，并清理相关投递、分析和面试题
- `POST /api/jobs`：`{ "company": "...", "title": "...", "description": "..." }`
- `PUT /api/jobs/{id}`：更新岗位
- `DELETE /api/jobs/{id}`：删除岗位，并清理相关投递、分析和面试题
- `POST /api/analysis`：`{ "resume_id": 1, "job_id": 1 }`
- `DELETE /api/analysis/{id}`：删除单条分析
- `GET /api/applications?page=1&page_size=10`：分页返回投递记录、简历、岗位、最新匹配报告和最新面试题
- `PATCH /api/applications/{id}`：`{ "status": "applied" }`
- `POST /api/interview-questions`：`{ "resume_id": 1, "job_id": 1 }`

`PATCH /api/applications/{id}` 的 `status` 只允许：

- `saved`
- `applied`
- `screening`
- `interviewing`
- `offer`
- `rejected`

`POST /api/jobs` 的 `company`、`title` 和 `description` 都不能为空。

`POST /api/analysis` 默认会复用 5 分钟内的最新分析，避免重复点击无限新增。可选参数：

- `force: true`：强制生成一条新分析
- `replace_existing: true`：删除该投递旧分析，只保留本次新分析

每个投递最多保留 5 条历史分析，超过后会自动清理更旧记录。

同一个 `(resume_id, job_id)` 只会有一条投递记录，数据库层用唯一约束防止并发重复创建。
