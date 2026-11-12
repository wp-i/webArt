# WebArt

高质量、可编辑、可下载的短网页集合。根首页展示6份保留设计；第6项现为优化后的Pace精密仪表，缩略图、完整预览和唯一源码下载绑定同一版本。旧稿源码保留用于质量比较，不增加第7种风格。

001是用户验收基准。Pace视觉方向获认可，本机性能检查通过，用户设备流畅度仍待复核；006–009尚未达到当前准入标准。首页展示授权、内部品质门和用户验收分别记录，工程测试不提供审美评分。

[项目交接与公开仓库的启动方式](HANDOFF.md)

## 本地预览

```powershell
npm ci
npm run build
pwsh -NoProfile -File scripts/start-preview.ps1 -Profile collection
```

首页：<http://127.0.0.1:4180/>。第6项完整预览：<http://127.0.0.1:4180/preview.html?id=010>。`npm run dev`提供开发预览；构建会核验并准备已登记的独立模板，不要求所有模板共用依赖。

## 配置与真实审查

```powershell
npm run production:check
npm run production:session
```

静态计划位于`docs/production/plans/`。常规生产实例化经过完整准入的版本化模板，只填受限内容；LLM不重写或修补页面代码。新风格首次制作必须另走参考、素材、试片和完整QA门，不能用旧低质稿件充库。

无独立Key时，脚本自动准备真实图片、严格结构化输出和审核队列，本会话看图后提交结果，随后自动继续工程检查。队列不会自行批准；本会话上下文未隔离，记录为非独立审查。独立API审查仍是可选入口，不把mock当作真实视觉审核。

```powershell
node scripts/review-session.mjs inspect <request.json>
node scripts/review-session.mjs submit <request.json> <reviewed-result.json>
node scripts/review-session.mjs cancel <request.json> "取消原因"
node scripts/production-run.mjs webart.production.session.json --session --resume <run.json> --publish
```

恢复会核验同一校准、已完成的双门、采证配置和源码字节，复用待答请求；未完成的工程检查重新执行。审核结果与请求、图片和收据绑定，缺证、过期、篡改或核心失败会停止流程。

## 首页同步

`--publish`仅在真实运行完成全部门后，按`webart.publication.json`同步已登记且源码/归档一致的版本。脚本自动生成两种真实首屏缩略图，复用唯一源码包，构建首页并检查五宽度、全部预览、实际下载及HTTP；失败恢复上一版展示。模型不能决定发布对象或改写规则。

每稿只提供一份可编辑Vite源码包；`public/templates.json`只包含accepted库存，`public/showcase.json`用于用户授权展示。001及旧006–010比较源码不因展示切换而被覆盖。

```powershell
npm run test:collection
npm run test:review
npm run collection:check
npm run collection:audit
```

[最新任务记录](docs/qa/2026-10-19-automation-homepage.md) · [生产流程](docs/PRODUCTION_PIPELINE.md) · [自动化边界](docs/production/AUTOMATION_IMPLEMENTATION.md) · [质量协议](docs/production/QUALITY_PROTOCOL.md) · [下一步](docs/NEXT_STEPS.md)
