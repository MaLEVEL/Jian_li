# JobFit AI Python Agent 升级设计

目标：在现有 React 项目上完成可运行、可测试、可解释的 Python/Agent 全栈作品，用于 Python 开发和 Agent 全栈求职。用户已确认保留 React，交付本地运行、Docker、评估、GitHub 提交推送；暂不部署公网。

## 功能与边界
- 保留经历库、简历编辑、DOCX/PDF 导出和投递管理，新增 Agent 工作台。
- Python 3.11+ / FastAPI 提供文本和 PDF 简历解析、JD 解析、单条分析、最多 20 条 JD 批量排序、CSV 导出、经历素材 CRUD、分析历史。
- LangGraph 真实状态图：route → parse_jd → parse_resume → match → retrieve → advise，返回节点执行记录。批量以受限并发复用同一状态图，单条失败独立呈现。
- 智谱 OpenAI 兼容接口只由服务端访问，Base URL 使用官方文档的 https://open.bigmodel.cn/api/paas/v4/；模型名和密钥由 .env 配置。无密钥运行明确标注的离线模式；模型失败返回降级警告，绝不冒充 AI 成功。
- 技能同义词只合并真正别名（sklearn/scikit-learn、postgres/postgresql），LangChain 与 LangGraph 不等同；评分解释列出每项权重、命中证据及缺失项。
- RAG 基础模式使用 BM25 + 本地稀疏向量 + RRF，完整可选模式使用 ChromaDB + BAAI/bge-small-zh-v1.5 + BAAI/bge-reranker-base。报告明确显示实际检索模式。
- 所有建议引用真实素材片段；不得伪造经历或量化指标，新增技能只作为学习建议。
- 素材与分析报告使用 SQLite 持久化；只面向本地单用户，默认绑定回环地址，不将无认证服务描述成多租户生产系统。
- 提供 30 条明确标记为合成的评分回归样本及独立检索标注，评估输出实测数值和模式；人工真实数据与在线延迟/Token 费用不伪造。

## API 合约
统一 snake_case JSON。GET /api/health 返回 status, mode, model, rag_mode。
POST /api/parse/resume multipart file → {text, filename}（PDF/TXT，最多 2MB）。
GET/POST /api/materials；POST {title, content, tags: string[]}；DELETE /api/materials/{id}。
POST /api/analyze {resume_text, jd_text, company?, title?} → Analysis。
POST /api/batch {resume_text, jobs:[{company,title,jd_text}]} → {results:Analysis[],errors:[{index,title,error}]}，结果按 score 降序。
POST /api/batch/export 使用同样输入，返回防公式注入的 UTF-8 CSV。
GET /api/history → Analysis[]；GET /api/history/{id} → Analysis。

Analysis = {id,company,title,score,mode,model,jd:{skills:[{name,required,weight}],experience_years:number|null,domain:string},resume:{skills:string[],experience_years:number|null,projects:string[]},matched_skills:string[],missing_skills:string[],breakdown:[{skill,weight,matched,evidence}],explanation:string,advice:[{skill,suggestion,evidence_ids:string[],supported:boolean}],evidence:[{id,title,content,score,source}],trace:[{node,status,duration_ms}],warnings:string[],duration_ms:number,usage:{prompt_tokens,completion_tokens,total_tokens},created_at:string,rag_mode:string}。
Material = {id,title,content,tags:string[],created_at}。
错误返回 HTTP 4xx/5xx JSON {detail:string}，不泄露密钥、原始上游报错或简历正文。

## 验证
先测试评分/别名/缺少输入/检索排序，再实现；FastAPI TestClient 验证解析、历史、批量、上传和错误。保留原前端测试并新增 API 客户端测试，执行 TypeScript 构建。最后用真实浏览器跑通素材→分析→批量→历史，检查桌面和移动端。Docker 若本机引擎不可用，明确记录，不宣称构建成功。
