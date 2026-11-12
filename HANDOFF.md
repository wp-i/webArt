# WebArt 项目交接

更新于 2026-11-13。开始前阅读 [AGENTS.md](AGENTS.md) 和 [当前任务记录](docs/NEXT_STEPS.md)。后者含多个历史阶段，执行状态用 `npm run workflow:status` 核对，视觉、素材和展示授权按对应版本的决策与收据核对。

## 项目与当前状态

WebArt 是可浏览、预览和下载独立 Vite 网页源码的作品集，也包含按固定渲染器、真实图像证据和审查流程生产新版本的工具。首页当前展示 001、006、007、008、009、010 六项。001 是用户验收和视觉校准基准，也是准入库存中的唯一条目。其余五项具有展示授权，仍按各自记录判断用户验收。

| 作品 | 当前展示与接续点 |
| --- | --- |
| 001 The Weight of Light | 冻结的基准源码及唯一 ZIP。 |
| 006 House of Ivory、009 Near & Far | 首页已接入 `ivory-woven-v1` 和 `near-and-far-editorial-v1`。`designs/` 中同编号目录保留比较源码，当前展示使用 `renderers/` 中的版本。 |
| 007 Campovivo | 首页仍展示比较稿。Lando 参考门已通过，允许按锁定角色查证素材并制作私有试片。XQCAD 实际下载要求登录，当前无合格模型文件、材质或成套人物素材。先看 [11 月 1 日 QA](docs/qa/2026-11-01-lando-reference-and-workflow-entry.md) 和 [素材角色](docs/assets/007-shell-studies.md)。 |
| 008 Sill | 首页仍展示比较稿。Igloo 已过参考门，Glacial 两版素材试作已否决并停止。只有查证到完整成熟资产或另一个参考方案通过准入后才推进。见 [素材记录](docs/assets/008-glacial-forms.md)。 |
| 010 Pace | 首页使用 `pace-precision-v2`。用户认可视觉方向，本机性能检查通过，用户设备的实际流畅度待复核。见 [性能 QA](docs/qa/2026-10-18-pace-performance.md)。 |

## 源码与状态入口

- `index.html`、`preview.html`、`gallery/` 和 `vite.config.js` 管理作品集页面与独立预览路由。`webart.collection.json` 管理库存，`webart.showcase.json` 管理授权展示。`public/templates.json` 和 `public/showcase.json` 是前端目录，缩略图与每项唯一源码 ZIP 在 `public/`。
- `designs/` 保留原稿和比较版本。`renderers/<版本>/source/` 是当前登记的独立整页源码，旁边的清单、合同、资格记录和 `webart.renderers.json` 锁定确切字节。001 的完整独立源码在 `public/weight-of-light-source.zip`，仓库页面入口在 `designs/001-weight-of-light/`。
- `webart.workflow.json` 定义 006–009 的工作流状态，`docs/production/plans/` 和 `webart.production*.json` 定义生产输入。`scripts/workflow-step.mjs` 跟进候选，`scripts/production-run.mjs` 负责固定渲染器实例化、真实审查、工程 QA 与续跑，`webart.publication.json` 定义允许切换到首页的版本。
- [决策记录](docs/DECISIONS.md)、`docs/qa/`、`docs/production/runs/` 和 `docs/evidence/` 提供逐阶段依据。修改视觉、素材或流程前，按需阅读 [质量协议](docs/production/QUALITY_PROTOCOL.md)、[生产流程](docs/PRODUCTION_PIPELINE.md)、[自动化边界](docs/production/AUTOMATION_IMPLEMENTATION.md) 及 [下载标准](docs/DOWNLOAD_STANDARD.md)。

## 从公开仓库开始

使用 Node.js 22.12 或更新版本。PowerShell 7 用于仓库级构建和预览脚本。先从独立源码启动指定作品，例如在仓库根目录运行：

```powershell
Set-Location renderers/pace-precision-v2/source
npm ci
npm run build
npm run preview -- --port 4323
```

打开 `http://127.0.0.1:4323/`。开发时可在同一源码目录运行 `npm run dev`。006、009 分别使用 `renderers/ivory-woven-v1/source`、`renderers/near-and-far-editorial-v1/source`，007、008 分别使用 `designs/007-campovivo`、`designs/008-sill`。把获授权的源码 ZIP 解压到独立目录也可查看相应版本。

根目录运行 `npm run workflow:status` 可只读查看 006–009。根目录 `npm run dev`、`npm run build`、完整生产检查和部分测试会读取与审核绑定的原始证据。公开 GitHub 保存源码、公开交付包、可分享的 QA 材料和记录。第三方参考图、内部评审队列和私有候选原始素材保留在有权限的原工作区。需要运行完整流程时，从有权限的原工作区恢复缺失证据，保留其原路径与字节，按收据校验 SHA-256。

## 完整证据工作区的核验与迭代

```powershell
npm ci
npm run workflow:status
npm run production:check
npm run collection:check
npm run collection:audit
node --test 'scripts/*.test.mjs'
npm run build
pwsh -NoProfile -File scripts/start-preview.ps1 -Profile collection
```

完整工作区首页为 `http://127.0.0.1:4180/`，Pace 为 `/preview.html?id=010`。浏览器采证使用 [webart.browser.json](webart.browser.json) 配置的 Chrome，换机器时核对 Chrome 路径。`workflow:status` 用于读状态，`workflow:step` 默认推进一步，`production:session` 和 `production:queue` 带发布参数，可能写入运行或展示记录。运行前核对对象、授权、版本和收据。独立 API 凭据与本机运行资料留在本地；当前会话可按真实证据队列审查，按实际身份记录独立性。

2026-11-13 使用 Node.js 22.18.0 验证。完整证据工作区通过 358 项测试，含证据的独立副本通过根目录安装和构建。单独解压 Pace 源码 ZIP 后安装和构建也通过。

新风格先做单一母版的参考核验和真实试片，再做五宽度、实际过程、控件、减少动态、故障替代与性能 QA。常规生产复用登记渲染器和受限内容槽。发布需核验预览、缩略图和唯一 ZIP 的同一版本，以及实际下载的字节和哈希。继续 007 和 008 时优先核查现有素材缺口及拒绝记录，保留已锁定的基准、比较源码和审查证据。
