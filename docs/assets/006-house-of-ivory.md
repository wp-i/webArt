# Assets — 006 / House of Ivory

计划锁定2026-10-09。四张媒体用内置imagegen独立生成，生成后复制进工程，原站图片/品牌/代码不取用。它们属于虚构作品展示，README说明替换为自己的真实项目；生成图片不被描述为真实摄影项目。

| 文件 / 唯一角色 | 生成与裁切要求 |
|---|---|
| `hero-salon.png` / 唯一主图 | 宽幅编辑室内摄影感，白色拱窗、自然绿景、莓红弧形沙发、旧木与奶油灰泥。焦点在中心，宽/手机裁切都成立，不带字或logo |
| `project-table.png` / 作品01 | 纵向餐厅，深色长桌、酒红椅、斜向光、橄榄墙；视线纵深，与hero全景不同 |
| `project-blue.png` / 作品02 | 纵向蓝色卧室，浅蓝床、暖木、亚麻，安静近景，清楚织物与自然光 |
| `project-stair.png` / 作品03 | 纵向黄色弧形楼梯、赤陶地砖、建筑光影，几何构图，不重复房间/桌/床 |

一次生成每角色，最多一次针对性替换。失败则不进入完整实现；不以扩写章节或拼贴填充。全部用CSS object-fit裁切，不重绘或修改原图。

字体：Dela Gothic One（Google Fonts官方OFL）、Instrument Serif（已在001使用的OFL包）、Inter（005已核验OFL字体）。新稿单独拷贝所需文件与许可证，仅拉丁字形、无远程字体依赖。具体文件、生成提示与字节待取得后记录。生成提示为内部证据，不入客户包；客户包仅所需素材、许可证与使用说明。

## 实际素材已取得

四图均用内置imagegen，四个请求并行、每角色第一张采用，0重绘/替换。完整[提示集](006-house-of-ivory-prompts.json)为内部证据，不入包。最终文件位于 designs/006-house-of-ivory/public/assets/：hero-salon.png 1536×1024 / 2,954,876 bytes；project-table.png 1024×1536 / 2,327,108 bytes；project-blue.png 1024×1536 / 2,497,989 bytes；project-stair.png 1024×1536 / 2,512,291 bytes。原图字节保留；CSS裁切，不改图。宽屏hero后续收尾裁切85%，手机52%，桌面55%。

Dela拉丁WOFF2 13,804 bytes来自 https://fonts.gstatic.com/s/delagothicone/v19/hESp6XxvMDRA-2eD0lXpDa6QkBA2QkEI.woff2 ，官方[OFL](https://github.com/google/fonts/blob/main/ofl/delagothicone/OFL.txt)全文随包。Instrument Serif从本地@fontsource/instrument-serif 5.3.0原文件复制，regular 21,032 / italic 22,128 bytes；Inter来自005已核验拉丁OFL文件48,256 bytes。三字体许可证在同目录，每字体仅所需原文件。独立favicon.svg与HTML单字H使用相同原创路径，无原站图标。实际默认画面及差异在[图谱](../references/006-house-of-ivory.md)和[QA](../qa/006-house-of-ivory.md)。
