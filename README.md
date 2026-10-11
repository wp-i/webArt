# WebArt

快速挖掘易复刻的高质量设计，独立实现为可以下载、修改和使用的网站。用户通常只需说明用途和内容，风格匹配由流程完成。

根首页现为 WebArt 作品目录，参考 Minimal Gallery 的展示方式，包含目前保留的四稿。按集合顺序连续编号展示，介绍直接连接预览网格；点击进入完整网页预览，可切换桌面、平板和手机，也可直接打开原稿、下载唯一源码包。目录和原稿均有独立 URL。

001 用户已接受、视觉冻结；006 内部整页/首屏95，用户尚未给出95验收。007 Campovivo、008 Sill 内部仍为trial，展示已移除试作标签；2026-10-10 用户明确要求展示及下载所有保留稿，因此纳入本次目录，不推断为视觉验收。旧002–005已撤回，不恢复。清理历史见[清理记录](docs/qa/2026-10-10-cleanup.md)。

**用户Key配置与执行暂不进行。** 本轮仍由Codex交互式编排，不把本地用量折算成实际API账单，也不宣称稳定工业量产。三稿质量/时间/费用与优化依据见[试产评测](docs/production/TRIAL_REPORT.md)。

## 开发和交付

```
npm ci
npm run dev
npm run test:collection
npm run collection:check
npm run collection:audit
npm run release
```

源码包：[001](public/weight-of-light-source.zip)、[006](public/house-of-ivory-source.zip)、[007 Campovivo](public/campovivo-source.zip)、[008 Sill](public/sill-source.zip)。每件只有一个可编辑Vite源码ZIP。001 原HTML原字节迁至 designs/001-weight-of-light/index.html；其素材、交互、归档结构、源码批准指纹和原ZIP不变。

## 新增作品

1. 按现有生产流程将新稿登记到 webart.collection.json，完成视觉/QA/源码与下载验证。
2. 在 webart.showcase.json 的 items 增加该 id、用途分类、中文短说明和日期；分类、数量和网格自动扩展。试作仍需明确用户授权及验证回执，不会因添加 metadata 自动公开。
3. 将真实首屏缩略图放到 public/collection/{id}.webp（1200×750）及 {id}-small.webp（600×375）。原稿的图片和字体保留在自己的工程里。
4. 运行 npm run build 和集合检查。构建自动生成四类入口：目录、预览工具、各原稿和源码下载；不生成框架变体。

目录源码为 index.html、gallery/，集合路由由 vite.config.js 在服务/构建时处理，不修改原稿的根资产路径。public/templates.json 继续仅包含 accepted 库存；public/showcase.json 是本次用户授权展示的集合。完整检查记录见[首页QA](docs/qa/000-collection.md)。

[生产流程](docs/PRODUCTION_PIPELINE.md) · [产品现状](docs/PRODUCT.md) · [视觉约定](docs/ART_DIRECTION.md) · [源码规范](docs/DOWNLOAD_STANDARD.md) · [决策](docs/DECISIONS.md) · [下一步](docs/NEXT_STEPS.md)

工程入口：scripts/inspect-reference.mjs（快筛/单母版深查与已拒参考跳过）、scripts/qa-page.mjs（通用整页检查）、scripts/production-meter.mjs（当前本地会话阶段计量）、白名单打包与集合发布脚本。工具可复用；完整自助运行器尚未实现。

2026-10-11用户指出新稿占位文字过多、动效不足和生成素材质量差距。制作标准已改为短文案、母版鼠标/滚动过程验收、现成授权素材优先；见[具体质量修正](docs/production/2026-10-11-quality-correction.md)与[素材获取标准](docs/assets/SOURCING_STANDARD.md)。旧内部评分不覆盖用户反馈，三稿尚未据此重做。
