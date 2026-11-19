# 产品参考与原创模板

本轮按用户要求检索 GitHub 相近项目，以仓库元数据、README 和许可证为依据。参考交互、信息架构与版式原则；16 款模板、10 类岗位框架及全部界面代码均在职启云帆的数据模型和 React/CSS/DOCX 输出中独立实现，未复制上游源代码、模板图片、图标、字体或品牌资产。核验日期：2026-11-18。

## 模板版式参考

| 项目 | 许可证 | 采用的思路 | 本项目的实现 |
| --- | --- | --- | --- |
| [Reactive Resume](https://github.com/reactive-resume/reactive-resume) | MIT | 多模板、分区编辑、本地优先和主题化 | 使用自己的 `ResumeTemplateDefinition` 和 React 渲染器 |
| [OpResume 优派简历](https://github.com/oopooa/opresume) | MIT | 中文简历、模块化信息层级 | 校招、实习和通用中文排版独立实现 |
| [Magic Resume / Kenmet](https://github.com/Magic-Resume/Magic-Resume) | MIT | 多模板切换与逐段编辑 | 项目经历优先与研发叙事版式独立实现 |
| [Open Resume](https://github.com/AniChikage/open-resume) | MIT | 本地优先、自托管、多模板 | 采用本地存储与 Docker 交付思路 |
| [PlushCV](https://github.com/cystema/PlushCV) | Apache-2.0 | 单页双栏结构 | 产品运营和创意作品集双栏独立实现 |
| [Brilliant-CV](https://github.com/yunanwg/brilliant-CV) | Apache-2.0 | 学术与研究成果层级 | 学术 CV、研究紧凑版与校招科研版独立实现 |
| [devcelio/resume-template](https://github.com/devcelio/resume-template) | Apache-2.0 | 技术岗位高信息密度排版 | ATS 友好技术单栏独立实现 |

许可证与归属的集中说明见根目录 [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

## 其他产品参考

| 项目 | 许可证 | 采用的产品思路 |
| --- | --- | --- |
| [ResumeForge](https://github.com/magicapple123/ResumeForge) | Apache-2.0 | 事实与提案区分、文档预览、求职跟进 |

## 内置数据

`frontend/src/templateCatalog.ts` 是固定目录，包含：

- 8 类人群，每类 2 款，共 16 种中文简历版式。
- 校招与实习、产品运营、设计创意、管理咨询、学术研究，以及 Python 后端、Agent/RAG、全栈开发、数据分析等 10 类岗位内容框架。
- 每款模板的稳定 ID、版本、阅读顺序、强调色、来源、许可证和链接。
- 岗位框架的填写提示、证据检查和面试准备问题。

旧版应届、实习、社招、技术、侧栏和编辑风 ID 保持兼容。切换模板只改变排版，不覆盖身份、联系方式或正文；框架不会自动写入履历。

## 视觉与导出

使用 UI/UX Pro Max 的相关规则检查天蓝配色、响应式、控件尺寸、焦点状态和减少动态偏好。用户可选择单页/双页页面容量、字体、字号、行距、页边距和主题色；字体、字号、行距、页边距与主题色同步进入浏览器预览、打印 PDF 与 DOCX，页面容量用于预览、质量估算和打印检查。首页标题使用项目内自托管的 Noto Serif SC 子集，完整 SIL OFL 许可证保存在 `frontend/src/assets/Noto-Serif-SC-OFL.txt`。
