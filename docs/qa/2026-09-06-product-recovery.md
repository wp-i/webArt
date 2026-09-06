# WebArt 生产与交付恢复 QA

状态：本轮流程与交付修复通过。开始于 2026-09-05，完成记录于 2026-09-06（Asia/Shanghai）。

范围：产品约定、候选交接、源码验收状态、打包、合集数据与本地生产预览。**没有新增或重新验收视觉页面；没有远程部署。** Design 001 沿用用户的历史视觉验收，Design 002 仍被拒绝并冻结。

## 结果

| 检查 | 结果与证据 |
|---|---|
| 产品库存 | 1 个已验收可下载模板；Design 002 不在下载目录数据中。`webart.collection.json`、`public/templates.json` |
| 已接受视觉保护 | `index.html`、`src/main.js`、`src/styles.css` 和三张原创图的 SHA-256 与本轮开始时一致；基准见 `docs/production/001-visual-baseline.json` |
| 源码身份 | 001 的十个允许分发条目与已接受 ZIP 逐一字节一致；源码指纹 `8cbf6f99bdb1391dcb5ab13bbc929a72a81dfbf45e3b55bcbb8a716ce5ede5d0` |
| 历史错误产物撤出 | 002 被拒包以及 public/dist 中两个临时包移至 `docs/quarantine/2026-09-05/`，未删除原始证据 |
| 冻结状态拦截 | `check 002` 和直接指定 002 清单的打包均非零退出，未写入公开包 |
| 状态与路径回归 | `npm run test:collection`：9 项通过，覆盖源码变动、拒绝/未知清单、相对路径、重复/禁用条目、缺证据、包篡改和未发布条目隔离 |
| 双模板预览 | 在系统临时目录建立两个工程测试样本，实际 Vite 构建并检查根预览与 `/designs/second/`；CSS/图像路径正确，故意移除子模板图像会使验证失败。样本未进入产品台账 |
| 私有打包分支 | `node --test scripts/staging.test.mjs`：1 项通过。仅在临时目录生成 ZIP，逐条校验、独立安装构建成功，正式包未变，测试目录已清理 |
| 完整本地发布 | `npm run release -- --id 001` 成功，复用已验收包；独立 `npm ci --ignore-scripts --no-audit --no-fund` 与生产构建成功 |
| 实际 HTTP 交付 | 使用实际 Vite preview 服务：001 ZIP 为 200 / `application/zip`，预览首页为 200，18 项本地页面资源字节校验通过 |
| 公开/构建库存 | public 与 dist 各仅有一个批准 ZIP，二者大小与哈希一致；没有 002、嵌套包或临时包 |

发布记录：`.webart/releases/latest.json`。该次完整发布的 UTC 时间为 `2026-09-05T15:58:21.590Z`，本地时间为 2026-09-05 23:58:21；随后完成双模板与私有打包分支验证。

## 保持不变的交付包

- 文件：`weight-of-light-source.zip`
- 字节数：5,810,208
- SHA-256：`ed7a7ffea0eea250620970e071e4ab878c2bc894b12f3966acd7f67048046ec0`
- 内容：一个可编辑的 Vite HTML/CSS/JavaScript 源码工程，不包含内部记录、参考素材、node_modules、构建结果或其他 ZIP。

## 实际修正与审查边界

独立只读工程复核指出，未发布但已接受的其他模板不应阻止现有模板交付；现已将其排除出发布目录、预览集合与包库存，直到取得有效交付记录。`--id` 选择本次处理的源包；共享集合构建仍校验并重建所有已发布预览，避免把改动过但未重新批准的源码带入合集。

实际运行额外发现并修正两项验证器问题：Windows PowerShell 环境缺少 `Get-FileHash` 时改用 .NET 哈希与 ZIP API；CSS 内联 SVG 中的 `url(%23n)` 不再误识别为外部资源。含内联 SVG 和缺失资源的双模板测试覆盖后一项回归。

这份报告验证交付机制，不能替代下一模板的母版准入或视觉 QA。Radian 与 Superlist 现有截图的静态初筛结论均为“缺证据”，详见 `docs/production/DESIGN2_RESET.md`；没有给出新准入分数，没有开始新页面实现。合集数据已生成，集合展示页面尚未建设，第二个成品尚未产出。

审查：主代理完成源码保护、真实运行与最终记录；独立只读代理复核发布逻辑。任何后续视觉页面发布仍须满足原有参考图谱、四状态、全过渡及用户环境审查要求。
