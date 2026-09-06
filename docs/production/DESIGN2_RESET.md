# Design 002：生产恢复记录

2026-09-06 流程澄清：允许实时 3D 改原创/授权静态图等局部调整，先验证替换后的构图与过渡，再直接实现目标版本。技术不一致不再自动淘汰；原站与成品按同一 Webpage Quality v2 评分。下文候选仍缺来源、连续路径与实际效果证据，旧版 Lusion 仍被拒绝。此更新不自动准入任何候选。

更新：2026-09-05。范围：本地记录清点与指定九张截图的静态初筛；未重新访问源站，未作完整视觉评审或准入评分。

## 产品与当前状态

WebArt 的交付是多个可下载、可编辑、各自完整的高质量网页模板。每个已发布模板只提供一个源码 ZIP，下载入口属于产品展示层。见[产品初衷](../ART_DIRECTION.md)与[下载标准](../DOWNLOAD_STANDARD.md)。

- **Design 001：用户已接受，视觉冻结。** 继续作为已接受的模板基线，见[001 QA](../qa/001-weight-of-light.md)。
- **Design 002：Lusion 母版已拒绝，旧实现与打包冻结。** 历史分数和通过声明均无效；不得将旧候选作为第二个成品发布，见[002 最终拒绝记录](../qa/002-objects-in-field.md#final-rejection-notice--2026-08-30)。
- **替代母版：尚无有效准入记录。** 截图数量、文件名及目录组织不能证明真实 URL、源站连续性、可复刻性或 98+ 质量。

## 恢复前必须消除的流程错误

1. **不能用不相邻的漂亮画面拼成页面。** [Lusion 参考审计](../references/002-objects-in-field.md#c--media-field--dark-ending)已确认 Media 与 dark ending 之间隔着大量 Featured Work。黑场、叠图、渐隐和桥接都是为缺失源站过渡发明的补救方式；该路径不得再次实施。
2. **素材通过不等于关键状态通过。** [历史决策](../DECISIONS.md#2026-08-28--design-002-complete-candidate)曾以四张 ImageGen 资产通过描述 key-state gate，而[生产流程](../PRODUCTION_PIPELINE.md)要求完整可运行状态与对应源站帧同视口比较。新一轮必须包含界面、字体、素材、构图及交互证据，不能只审查图片。
3. **旧 Lusion 蓝图只作为被拒方案的历史。** 旧四段布局、蓝色路径、头部改形和结尾拼接不能反过来约束新母版。新结构由通过准入的母版决定；主负责人先在[决策记录](../DECISIONS.md)明确替换，再锁定新 brief。
4. **保留有效投入与用户限制。** 四张原创母图继续保存，只有与母版及批准调整的角色匹配时才使用，不强迫全部入页。继续遵守静音、普通原生滚动、无强制吸附/滚轮拦截/脚本跳转和展示控件限制。减少动态效果时保留有用的直接响应；已批准的静态替换无需强行补一层材质交互，但须照实评价体验变化。见[资产记录](../assets/002-objects-in-field.md)与[002 页面约束](../pages/002-objects-in-field.md)。

## 已有证据库存

以下路径已在本地核实存在。名称只用于识别证据，不构成对网站身份或视觉质量的确认。

| 证据组 | 本地事实与入口 | 当前状态 / 缺项 |
|---|---|---|
| 候选截图库存 | `docs/evidence/002-objects-in-field/` 下共有 **94 个 `candidate-*.png` 文件**，包含同名候选的加载/分页变体；不是 94 个已确认独立网站。示例：[radian](../evidence/002-objects-in-field/candidate-radian.png)、[superlist](../evidence/002-objects-in-field/candidate-superlist.png)、[superlist-loaded](../evidence/002-objects-in-field/candidate-superlist-loaded.png) | 待整理；尚无完整候选台账，不能据此认定筛选已完成。 |
| `radian-core` | 四个主状态文件：[01](../evidence/002-objects-in-field/radian-core/state-01-hero.png)、[02](../evidence/002-objects-in-field/radian-core/state-02-explorer.png)、[03](../evidence/002-objects-in-field/radian-core/state-03-media.png)、[04](../evidence/002-objects-in-field/radian-core/state-04-dark.png)；另有九个按三段过渡各 25/50/75 命名的文件，详见下表 | **evidence-needed / 缺证据**。已看四主状态及过渡 02、03 的中点。截图有 RADIAN 字标，真实 URL 未核验；文件齐全不能证明四状态相邻、抓取位置准确或交互可复刻。 |
| `superlist-scan` | 十张扫描文件 `y0000.png` 至 `y8100.png`，步长 900；入口：[开头](../evidence/002-objects-in-field/superlist-scan/y0000.png)、[中段](../evidence/002-objects-in-field/superlist-scan/y4500.png)、[最后一张](../evidence/002-objects-in-field/superlist-scan/y8100.png) | **evidence-needed / 缺证据**。已看这三张，截图有 Superlist 字标；真实 URL、连续摘录、收束边界和输入行为仍未核验。 |

`radian-core` 的九个过渡文件：

| 文件所标过渡 | 25% | 50% | 75% |
|---|---|---|---|
| 01 | [截图](../evidence/002-objects-in-field/radian-core/transition-01-25.png) | [截图](../evidence/002-objects-in-field/radian-core/transition-01-50.png) | [截图](../evidence/002-objects-in-field/radian-core/transition-01-75.png) |
| 02 | [截图](../evidence/002-objects-in-field/radian-core/transition-02-25.png) | [截图](../evidence/002-objects-in-field/radian-core/transition-02-50.png) | [截图](../evidence/002-objects-in-field/radian-core/transition-02-75.png) |
| 03 | [截图](../evidence/002-objects-in-field/radian-core/transition-03-25.png) | [截图](../evidence/002-objects-in-field/radian-core/transition-03-50.png) | [截图](../evidence/002-objects-in-field/radian-core/transition-03-75.png) |

## 本批已完成：两组静态初筛

查看范围仅为上表所述九张截图；其余文件只核实存在，未声称完成审查。以下判断针对证据能否支撑下一步，不是源站质量结论。

### `radian-core` — evidence-needed / 缺证据

**静态可见：** 01 是灰底、黄色摩托车正面特写，左下标题与按钮，右下骑行视频缩略图；02 是浅底左侧功能词列表与右侧森林骑行图；03 是满幅横向骑行画面及故事文案；04 是暗底左图右文与路线折线。颜色、同一产品主体和摄影题材有一致性，包含产品展示与功能说明的模板用途。

**当前证据不足：** [03](../evidence/002-objects-in-field/radian-core/state-03-media.png)的标题在顶边被裁切，并与顶部导航同处一带，底部已露出暗色下一段，不能作为完整主状态基准。[04](../evidence/002-objects-in-field/radian-core/state-04-dark.png)顶部还露出其他图卡，画面是骑行特性介绍，不能凭文件名认定为结尾。[过渡 02 中点](../evidence/002-objects-in-field/radian-core/transition-02-50.png)同时包含浅色上一段底部和下一段影像；[过渡 03 中点](../evidence/002-objects-in-field/radian-core/transition-03-50.png)包含顶部骑行影像条、大块暗场、两侧图卡及路线。需确认这些是源站有意的完整动态过程，还是错误取样；不能先发明转场修复。

**定向补证：** 核验真实 URL、截取日期/视口与具体位置；补完整 03 主状态及可结束的源站边界；记录连续真实滚轮/触控板输入经过三个 handoff 的视频或位置序列，核实 25/50/75 标签及原生滚动约束适配；验证 01 的摩托车是否依赖实时 3D/镜头变化、02 功能项怎样切换、骑行媒体是视频还是静态，以及固定导航如何经过浅暗边界；补指针、reduced-motion 和移动端表现。素材计划必须提供同一原创产品的多视角与场景一致性，现有抽象母图没有自动满足这些角色。现阶段未证明不可复刻，也未获准实施。

### `superlist-scan` — evidence-needed / 缺证据

**静态可见：** [开头](../evidence/002-objects-in-field/superlist-scan/y0000.png)是珊瑚红背景、黑色办公物件三维造型群、居中白色大标题；[中段](../evidence/002-objects-in-field/superlist-scan/y4500.png)转为黑底、左侧大标题与红黑圆片物件，右上保留上一信息块；[最后一张](../evidence/002-objects-in-field/superlist-scan/y8100.png)是浅底招聘内容，左侧扩音器及福利列表、右侧职位与按钮。三帧均有固定导航与 cookie 提示覆盖。可见颜色/物件语言支持产品或团队介绍，但现有抽样横跨不同内容功能。

**当前证据不足：** 中段同时显示两组信息，最后一张顶部标题被裁切且仍处于 Jobs 内容区，不能把它们直接命名为完整中间状态和 ending。`y0000 → y4500 → y8100` 不是三段相邻过渡证据；目前没有四个相邻关键状态或可结束边界。cookie 提示覆盖需在参考图谱中明确其属于临时界面及是否省略，不能误作模板构图组成。

**定向补证：** 核验真实 URL 与抓取上下文；先检查本地其余七张扫描，找出候选连续摘录及源站收束边界，再补该路径的精确过渡；验证办公物件与圆片究竟使用静态渲染、视频、滚动动画还是实时几何，以及关闭自动运动后直接输入表现；核验导航/临时覆盖层、移动端重排和原创替换物件需求。未观察到足以仅凭这三张就淘汰整个源站的确定冲突，状态保持缺证据。

## 下一批：最多三个详细候选

本批先消化已有投入，不再开始新的广泛搜站。以下是审查顺序，不是质量排名：

| 顺序 | 候选证据 | 本批任务 |
|---|---|---|
| 1 | `radian-core` | 已完成上述六帧静态初筛，结论为缺证据；下一步只补来源、完整主状态/结尾、连续输入与素材适配证据。 |
| 2 | `superlist-scan` | 已完成上述三帧静态初筛，结论为缺证据；下一步先查本地剩余七张及 loaded 截图，再定向核验来源与连续摘录。 |
| 3，按需 | 既有 94 个候选文件中的另一个候选 | 只在前两组作出书面结论后，从已有库存选一个来源可追溯、证据较完整的候选；不因凑数而占满名额。 |

每个候选只产出一份短结论：来源 URL 与核验方式、证据路径、三至四个连贯主时刻与每段实际过渡、技术/资产适配、用户约束适配、缺陷、**通过 / 淘汰 / 缺证据**之一及理由。四个关键审查状态包含一段过渡，不要求硬凑四个章节。允许为已选候选定向补证据；未经核验不得声明现场检查、连续性或分数。

三份结论完成前不扩大搜索范围；本批无人通过则报告明确淘汰原因和共性缺口，再调整下一批条件，不能降低质量门槛或启动页面实现来“试试看”。

只有新母版完成 98+ 准入、参考图谱、原创替换计划与四个可运行关键状态的内部批准后，才能恢复实现。最终仍须完整状态 QA、97+ 总分、主状态不低于 95、零关键缺陷及单一源码 ZIP 验证。此记录不解除冻结，不授权发布，也不改变 Design 001 的已接受视觉。
