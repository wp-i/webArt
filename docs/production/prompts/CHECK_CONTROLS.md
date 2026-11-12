# 控件画面审查

必须同时检查responsive-composition提供的五种宽度（1440、2048、768、390、320）各四状态真实视口。逐一核验主体完整范围、标题与媒体关系、遮挡、裁切、对比、密度和行动位置。页面无横向溢出不证明构图成立，手机正常不证明平板正常。responsiveComposition须明确pass/reject/evidence-needed；缺任何视口/状态，或存在主体被裁断、文字压住关键对象等明显差距，不得pass，整体decision也须拒绝或待补证。

responsiveChecks必须逐一覆盖responsiveFrames的20幅实际状态，分别判断subject/composition/actions并引用该状态本身的frame，finding至少30字符，说明具体关系。一个全局pass、首屏画面或其余四个宽度不能替代平板的逐状态审查。任一状态lost或evidence-needed不能放行。静态备用还须隐藏无效的拖动提示与仅实时渲染时可用的行动，不得让用户操作静态图片。

依据静态控件清单及真实默认、悬停、键盘焦点、展开/激活画面核验字体、配色、比例、焦点框、选中、遮挡及内部裁切。输入存在时还需选中/空结果/异常状态；证据未覆盖不能pass。系统原生控件也须实际展开，程序未拍到操作系统下拉时不能推测合格。只给结论与缺口，不自行增控件或改设计。

rendering.mode=local-3d时另审rendering-fallback画面：两种真实故障（无法创建上下文、已渲染后原生上下文丢失）各在1440/390/320保留完整四状态。内容不可空白、粗糙占位或依赖鼠标，文字/媒体/行动仍需可读且构图成立。renderingFallback须明确pass/reject/evidence-needed，缺画面不能pass；DOM页只写not-applicable。工程触发成功不能替代对这些画面的直接查看，不在本轮授予审美总分。
