# MathTrace 项目面试叙事

这份文档用于把 MathTrace 的开发过程沉淀成可复盘、可面试表达的项目叙事。它不是简历话术堆砌，而是记录每个阶段的真实价值、关键设计、工程取舍、可能被面试官追问的点，以及项目中可验证的证据链。

维护原则：

- 每完成一个重要阶段，就追加一节。
- 每节都要写清楚“为什么做”“怎么做”“为什么不那么做”“怎么证明它是真的”。
- 如果某项决策改善了响应速度、资源占用、稳定性、模型调用成本、构建或测试效率，要单独写出性能收益和证据。
- 如果后续功能扩展改变了早期性能收益或技术取舍，应回到对应旧阶段更新说明，标注原收益是否仍成立、被替代或转化为新的取舍。
- 推荐回答尽量使用第一人称，形成可以直接在面试中说出口的表达。
- 已知缺口要诚实写出，并说明下一步如何演进。
- 证据链必须落到代码、测试、文档、验证命令或 smoke test，不写空泛描述。

## 项目一句话

MathTrace 是一个面向高中数学错题诊断的 AI Agent Demo。它不是简单给出标准答案，而是围绕“为什么错、怎么改、下一步练什么”建立错因诊断、学生画像变化、变式练习和 7 天复习计划。

## 我希望这个项目展示的能力

- AI 应用工程化：把模型放进可控业务流程，而不是让模型接管整个系统。
- LLM 信任边界设计：模型只做图片抽取，画像增量和持久化由代码控制。
- 前后端状态设计：P0 样例题稳定演示，P1 图片诊断渐进增强。
- 可恢复错误处理：未配置 API Key、模型超时、非法 JSON、图片过大等路径都有用户可理解的反馈。
- TDD 和回归验证：核心 parser、provider、pipeline、client helper、localStorage 都有脚本测试。
- 产品范围控制：明确 P0/P1/P2 边界，不提前引入数据库、登录、老师端或复杂 Agent 框架。
- 面试可解释的工程判断：每个技术选择都能说出收益、代价和后续演进路线。

---

## 1. 项目定位与 P0/P1 边界收口

### 当前状态

已完成，已写入 PRD 和 Roadmap；当前 P0/P1 边界仍在持续维护中。P0 样例题路径已作为稳定演示主路径，P1 图片诊断已进入真实 MiMo 接入和前端体验阶段。

### 功能价值

这个阶段的价值不是写了某个具体页面，而是把项目从“AI 拍照解题”收敛成“错因诊断与长期学习画像”。这让项目在面试中更有辨识度：不是复刻拍照搜题，而是展示一个可解释、可积累、可长期演进的学习诊断系统。

边界收口也直接服务黑客松 Demo 稳定性。P0 使用内置样例题和 mock 学生画像，保证没有模型配置时也能完整演示；P1 再接入真实图片识别，让项目有真实 AI 能力，但不让模型不稳定性破坏主路径。

### 关键设计

项目被拆成三个层次：

- P0：稳定 Web Demo。使用 `sample_diagnosis`、内置样例题、确定性 pipeline、localStorage 状态恢复。
- P1：真实图片诊断增强。使用 `image_diagnosis` 调 MiMo 做图片抽取，但后续知识点、错因、画像增量仍复用本地 pipeline。
- P2/P3：数据库支持的确认写入、动态练习生成、复杂 Agent 编排、老师端等长期能力。

这种拆分避免了早期同时做太多高风险能力。对面试来说，它能展示一个重要工程素养：知道什么应该现在做，什么应该留到后面做。

### 技术决策与取舍

我没有一开始就做完整商业系统，比如登录、数据库、老师端、支付或大规模题库，因为这些会稀释核心价值，也会拖慢 Demo 闭环。第一版更重要的是证明“错因诊断 Agent”这条主线跑得通。

我也没有在 P0 引入复杂 Agent 框架。原因是当前流程是固定的：识别题目、映射知识点、诊断错因、计算画像变化、生成练习、规划复习。这个流程不需要模型动态决定下一步，所以先用 TypeScript 函数式 pipeline 更可控、更易测，也更好解释。

代价是：当前系统还不是完整商业产品，真实长期记忆、数据库级确认写入和动态练习生成还没完成。但这个代价是有意识的范围控制，而不是能力缺失。

### 性能收益（如适用）

P0/P1 边界收口带来的主要收益是稳定性和响应确定性。P0 样例题路径不依赖外部模型、网络请求或 API Key，因此正式演示时可以稳定返回完整诊断结果；真实模型调用只放在 P1 图片路径，不会影响样例题主链路。

这个设计也减少了早期系统的运行成本：不是每次演示都调用多模态模型，而是只有用户明确选择图片诊断时才触发 provider。证据是 `sample_diagnosis` 走本地 `runMathTraceAgent`，而 `image_diagnosis` 才进入 provider adapter。

### 面试官可能怎么问

1. 你这个项目和普通拍照搜题工具有什么区别？
2. 为什么 P0 不直接做真实图片识别？
3. 为什么要区分 P0、P1、P2，而不是一次性做完？
4. 你怎么保证 Demo 稳定？
5. 你为什么没有先做数据库和登录？
6. 这个项目的长期壁垒在哪里？
7. 你怎么判断哪些功能该做、哪些功能不该做？

### 推荐回答

我会这样回答：

这个项目的定位不是“帮学生得到一道题的答案”，而是“帮学生理解为什么错，并把每次错误沉淀成长期学习画像”。普通拍照搜题更像一次性问答，而 MathTrace 想做的是错因地图：每次诊断都会映射知识点、错因标签和复习优先级，长期看可以回答“我经常在哪些底层能力上出问题”。

我把项目分成 P0/P1/P2，是因为黑客松或面试展示最怕主路径不稳定。P0 固定走内置样例题，保证不依赖模型和外部服务也能展示完整闭环；P1 再做图片诊断，接入真实 MiMo。这样既有稳定演示，又有真实 AI 接入能力。

我没有一开始做数据库、登录或老师端，是因为这些不是验证核心价值的最短路径。当前最应该证明的是：从一道错题出发，系统能不能结构化地产出知识点、错因、画像变化、练习和复习计划。等这个闭环稳定后，再引入数据库和权限系统才有意义。

### 可能被继续追问

- 如果没有真实数据库，长期画像是不是只是 mock？
- 你怎么从 Demo 演进到真实产品？
- P0 走样例题，会不会显得 AI 能力不足？
- 如果评委或面试官要求现场上传图片，系统怎么处理？
- 你如何证明“错因诊断”不是模型随口编的？

### 反思与后续优化

当前边界设计适合 Demo，并已在后续阶段加入“图片识别结果确认”流程。真实产品里，低置信度图片结果不能直接写入长期画像；当前实现已经让学生先确认题干和学生答案，再生成报告和画像写入决策，但真实数据库中的 `mistake_record` 仍属于后续阶段。

长期还需要数据库记录每次诊断、画像增量和复习完成情况。否则“越用越懂你”的价值只能在 Demo 层表达，不能形成真实数据闭环。

### 项目中的真实证据

- 代码：
  - `src/app/page.tsx`
  - `src/components/mathtrace-workbench.tsx`
  - `src/lib/diagnose-service.ts`
- 测试：
  - `scripts/agent-pipeline.test.mjs`
  - `scripts/demo-state.test.mjs`
  - `scripts/image-diagnosis-pipeline.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
  - `README.md`
- 验证：
  - `npm test`
  - `npm run lint`
  - `npm run build`

---

## 2. P0 工作台与样例诊断闭环

### 当前状态

已完成，已合并到 main。样例题诊断是 P0 正式演示路径，当前仍要求保持稳定，不能被图片诊断或模型失败路径破坏。

### 功能价值

P0 工作台解决的是“评委或面试官能不能在 3-5 分钟内看懂产品价值”。它把抽象的错因诊断能力变成一个完整界面：选择样例题、启动诊断、看到 Agent 步骤、标准解法、错因报告、画像变化、变式练习和 7 天复习计划。

这个阶段的价值在于，它不是只做一个 API 或 mock JSON，而是把用户体验闭环做出来。面试官看到的不只是代码能力，也能看到产品思考：什么信息应该先展示，学生为什么相信这个诊断，复习建议如何和错因对应。

### 关键设计

工作台围绕一个主组件展开：`MathTraceWorkbench`。它负责用户选择样例题、触发诊断、管理当前诊断结果、展示画像变化和练习计划。

数据来源使用 `src/data/mathtrace-demo.ts` 中的样例题、知识点、错因标签和 mock 学生画像。这样 P0 演示不依赖网络、不依赖 API Key、不依赖模型输出。

页面展示上分成几个稳定区域：

- 错题输入区：选择样例题或图片诊断。
- Agent 时间轴：展示诊断过程，而不是直接吐结果。
- 诊断结果：先标准解法，再错因定位。
- 学生画像：展示掌握度和错因频次变化。
- 练习与复习：展示变式题和 7 天计划。

### 技术决策与取舍

我选择用单页工作台，而不是多页面产品，是因为 P0 的目标是演示闭环。多页面会增加路由、状态同步和导航成本，却不会增强核心叙事。

我选择预标注样例题，而不是 P0 就用模型动态生成，是为了控制演示确定性。数学公式、错因标签、练习题和复习计划都需要可解释，模型随时生成可能带来不一致或不可复现的问题。

我也尽量把 browser-only 状态限制在工作台组件里，例如动画、用户选择和 localStorage。服务端仍保持无状态，这符合当前 Demo 的轻量边界。

### 性能收益（如适用）

P0 工作台的性能收益来自“预标注样例 + 单页闭环”。样例题、知识点、错因标签、练习和复习计划都来自本地数据，不需要等待模型生成，也不需要跨多个后端接口串行请求。

单页工作台也减少了演示路径中的路由切换和跨页面状态同步成本。对用户来说，点击“开始诊断”后主要等待的是前端步骤动画，而不是不确定的外部服务延迟；对开发来说，P0 主路径可以用 `npm test` 和本地 smoke 快速验证。

### 面试官可能怎么问

1. 这个工作台的核心用户路径是什么？
2. 为什么要展示 Agent 步骤，而不是直接显示结果？
3. 你怎么设计错因报告的展示顺序？
4. 为什么 P0 使用样例题而不是用户真实上传？
5. 数学公式是怎么渲染的？
6. 工作台状态怎么管理？为什么没有用 Redux 或 Zustand？
7. 如果后续页面变复杂，你会怎么拆组件？

### 推荐回答

我会这样回答：

这个工作台的目标是让用户快速理解“错因诊断系统”的完整闭环，所以我没有先做复杂导航，而是把核心路径放在一个页面里。用户选择一道样例错题后，页面会按步骤展示识别题目、匹配知识点、分析错因、更新画像、生成练习和规划复习。

我刻意展示 Agent 时间轴，是因为这个产品的信任感来自过程。如果页面只直接给出结论，用户很难知道系统为什么认为自己错在“分类讨论遗漏”。通过步骤动画和结构化报告，用户能看到诊断不是一句模型回答，而是有知识点、错因标签和画像变化依据的流程。

状态管理上，我没有引入 Redux 或 Zustand，因为当前状态主要在单页工作台内流动，React state 已经够用。过早引入全局状态库会增加复杂度。等后续引入用户登录、历史错题和多页面数据共享时，再评估全局状态或服务端缓存更合理。

### 可能被继续追问

- `MathTraceWorkbench` 会不会变得太大？
- 为什么标准解法放在错因报告前面？
- 如果用户上传图片失败，工作台会不会丢失当前报告？
- 样例题数据和 UI 展示之间有没有强耦合？
- 公式渲染失败时怎么处理？

### 反思与后续优化

当前工作台已经能支撑 Demo，但 `mathtrace-workbench.tsx` 随着图片诊断加入变大了。后续可以围绕稳定边界继续拆分，例如把诊断结果卡片、画像卡片、练习实验室、复习计划做成更独立的组件。但我不会为了“看起来架构漂亮”而提前重构，只有当某个区域继续增加行为或测试困难时再拆。

后续优化重点已经从“是否需要识别结果编辑确认”转为“如何把确认后的诊断记录迁移到真实数据库”。当前 P1 已能让用户确认题干和学生答案，再决定是否允许写入 demo 长期画像。

### 项目中的真实证据

- 代码：
  - `src/components/mathtrace-workbench.tsx`
  - `src/components/math-text.tsx`
  - `src/data/mathtrace-demo.ts`
  - `src/app/page.tsx`
- 测试：
  - `scripts/demo-state.test.mjs`
  - `scripts/diagnosis-view-model.test.mjs`
- 文档：
  - `docs/superpowers/plans/2026-05-29-mathtrace-simplified-workbench.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- 验证：
  - 样例题路径 smoke test
  - Playwright 视觉验证截图
  - `npm run build`

---

## 3. `/api/diagnose` 接口与运行时边界

### 当前状态

已完成，已合并到 main。`POST /api/diagnose` 是当前唯一核心诊断接口，承载 P0 样例题路径和 P1 图片诊断路径。

### 功能价值

这个阶段把前端展示和诊断逻辑解耦。前端不再直接从本地 mock 数据拼装完整结果，而是通过 `/api/diagnose` 请求服务端诊断。这样项目从“纯前端 Demo”迈向了真实产品形态：用户输入进入 API，API 做校验和路由，再返回结构化诊断结果。

对面试来说，这个阶段很重要，因为它能展示 API 契约、错误处理、服务端安全边界和未来扩展能力。尤其是后续接 MiMo 时，API Key 只能在服务端读取，前端不能直接调用外部模型。

### 关键设计

API route 位于 `src/app/api/diagnose/route.ts`。它只负责：

- 解析请求 JSON。
- 处理非法 JSON。
- 调用 `handleDiagnoseRequest`。
- 用稳定 JSON 格式返回结果。

核心业务逻辑不写死在 route 里，而放在 `src/lib/diagnose-service.ts` 和 `src/lib/diagnose-api.ts`：

- `diagnose-api.ts` 定义请求类型、响应类型、错误结构和运行时校验函数。
- `diagnose-service.ts` 根据 `task_type` 路由到 sample 或 image 路径。
- sample 路径调用确定性 `runMathTraceAgent`。
- image 路径先处理图片输入和模型 provider，再进入 image pipeline。

### 技术决策与取舍

我没有把所有逻辑写在 `route.ts` 里。原因是 route 应该是薄入口，真正可测试的业务逻辑应该在普通 TypeScript 函数里。这样 Node 脚本测试可以直接 import service 和 parser，不需要每次启动 Next.js server。

我也没有一开始引入 Zod。项目要求优先使用 Zod，但如果暂未引入，必须保留明确 TypeScript 类型和边界校验函数。当前实现选择了轻量类型守卫，减少依赖，也更贴合当前 Demo 规模。后续如果响应结构继续扩大，可以再迁移到 Zod schema。

错误响应使用 recoverable 结构，而不是直接 throw 或返回不稳定字符串。这样前端可以根据错误类型展示“切回样例题”“重新上传图片”等可恢复操作。

后来我把 `StudentProfile` 的运行时校验口径也收敛到 shared guard。虽然当前产品仍固定 `demo_student_001`，但画像对象会从 localStorage、API 响应和诊断 pipeline 多个入口流动，所以“只有一个学生”不等于“不需要画像校验”。统一后的 guard 会检查 `grade`、`subject`、掌握度分数、错因频次、复习优先级和高考关注项结构；损坏的本地画像会回退到 demo 默认画像，模型或接口返回的坏画像会被 response guard 拒绝，避免长期学习状态被半截 JSON、旧格式或异常数字污染。

### 性能收益（如适用）

`/api/diagnose` 采用“一次请求返回完整诊断结果”的设计，避免前端串行调用多个接口来模拟 Agent 步骤。这样减少了网络往返次数，也降低了前端状态同步复杂度。

Route handler 保持薄入口，业务逻辑放在普通 TypeScript 函数里，也提升了开发验证效率：大部分行为可以通过 Node 脚本直接测试，不需要每次启动浏览器或 Next server 才能验证。

### 面试官可能怎么问

1. `/api/diagnose` 的职责边界是什么？
2. 为什么不让前端直接调用 MiMo？
3. 你怎么做请求和响应的运行时校验？
4. 为什么没有用 Zod？
5. sample 和 image 两条路径如何共用一个接口？
6. 错误响应如何设计？
7. 如果未来要加 `/api/confirm`，你会怎么拆？

### 推荐回答

我会这样回答：

我最初把 `/api/diagnose` 设计成核心诊断入口，是为了避免前端串多个接口来模拟 Agent 流程。图片确认阶段加入 `/api/confirm` 后，边界变成了两段：`/api/diagnose` 只做不可信图片抽取并返回待确认草稿；`/api/confirm` 才在用户确认后进入知识点映射、错因诊断、画像增量、练习和复习计划。样例题路径仍然是一次 `/api/diagnose` 返回完整结果。

Route handler 本身保持很薄，只处理 JSON 解析和响应封装。真正的请求校验、任务路由和 pipeline 调用放在 `diagnose-service` 和 `diagnose-api` 里。这样做的好处是业务逻辑可以直接用 Node 脚本测试，不依赖 Next runtime。

我没有让前端直接调 MiMo，因为 API Key 必须只存在服务端，而且图片和学生错题内容属于敏感学习数据。前端只把图片发给自己的 `/api/diagnose`，服务端再决定是否调用 provider，并对模型输出做 schema 校验。

### 可能被继续追问

- 当前类型守卫和 Zod 相比有什么不足？
- `image_diagnosis` 失败时为什么不自动 fallback 到样例题？
- 为什么错误码里要区分 `model_timeout` 和 `model_invalid_output`？
- API 响应结构后续变大，如何避免类型守卫越来越难维护？
- 如果同一个接口支持更多任务类型，会不会膨胀？

### 反思与后续优化

当前手写类型守卫适合轻量阶段，但随着 `DiagnoseApiResponse` 增大，Zod 会更有优势：既能定义 schema，又能推导类型，还能复用 parse error。后续当 `/api/confirm`、真实数据库和更多 provider 加入时，可以考虑把请求/响应 schema 迁移到 Zod。

另一个优化点是错误信息的层次。现在用户错误提示和技术错误码已经分开，但后续可以加入更结构化的 `suggested_action`，例如 `retry`、`switch_to_sample`、`crop_image`、`edit_extraction`。

### 项目中的真实证据

- 代码：
  - `src/app/api/diagnose/route.ts`
  - `src/lib/diagnose-api.ts`
  - `src/lib/diagnose-service.ts`
  - `src/lib/image-input.ts`
- 测试：
  - `scripts/agent-pipeline.test.mjs`
  - `scripts/diagnose-client.test.mjs`
  - `scripts/image-diagnosis-pipeline.test.mjs`
- 文档：
  - `docs/superpowers/plans/2026-05-29-diagnose-api-shell.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- 验证：
  - `POST /api/diagnose` sample smoke
  - `npm test`

---

## 4. 确定性 Agent Pipeline 与画像增量

### 当前状态

已完成，已合并到 main。P0 `sample_diagnosis` 和 P1 `image_diagnosis` 后续诊断都复用确定性 Pipeline。模型不直接写 `memory_delta`，也不能直接覆盖学生画像。

### 功能价值

这个阶段是项目的核心工程价值。很多 AI Demo 会把用户输入丢给模型，然后直接展示模型回答。MathTrace 的设计是：模型最多作为某个步骤的工具，核心诊断流程由代码组织，每一步都有结构化输入输出。

这对错因诊断尤其重要。学生画像和 `memory_delta` 不是一次性文本，它代表长期状态变化。如果让模型直接改画像，系统很难解释、回滚和测试。确定性 pipeline 让长期学习数据更可控。

### 关键设计

Pipeline 位于 `src/lib/mathtrace-agent-pipeline.ts`，核心步骤包括：

```text
planTask
-> recognizeQuestion
-> retrieveKnowledgeContext
-> mapKnowledgePoints
-> diagnoseMistake
-> computeMemoryDelta
-> generatePractice
-> planReview
-> buildDiagnoseResponse
```

这些函数对应一个可解释的 Agent 流程，但实现上先用 TypeScript 确定性编排。每一步都能单独测试，也能在 UI 上映射成用户可理解的步骤。

P1 图片路径则通过 `src/lib/image-diagnosis-pipeline.ts` 把模型抽取结果转成内部诊断上下文，再复用知识点映射、错因诊断、画像增量、练习和复习计划能力。

### 技术决策与取舍

我选择“确定性 pipeline + 局部模型工具”，而不是“全自由 Agent”。原因是当前业务流程固定，最重要的是稳定、可解释、可测试。模型适合处理图片 OCR 和语义抽取，但不适合直接决定长期画像变化。

我也没有让模型自由创造知识点 ID 或错因标签。知识点和错因来自内置数据结构，模型输出必须收敛到项目内部 schema。这样可以避免 UI 显示、画像计算和复习计划因为模型造词而失控。

代价是：当前智能程度不如完全开放的 LLM 方案，部分诊断规则还依赖预置样例和标签体系。但这个代价换来了演示稳定性和工程可控性。

### 性能收益（如适用）

确定性 Pipeline 的直接性能收益是减少模型调用次数。P0 样例诊断不需要每一步都请求 LLM，而是用本地函数完成知识点映射、错因诊断、`memory_delta`、练习和复习计划，因此响应时间更稳定，成本也更低。

这个设计还提升了测试性能和反馈速度。`scripts/agent-pipeline.test.mjs` 可以直接验证 pipeline 输出，不需要等待外部模型、网络或浏览器环境。对持续迭代来说，这比端到端全链路手测更快、更可靠。

### 面试官可能怎么问

1. 为什么叫 Agent Pipeline，而不是普通函数调用？
2. 你为什么不用 LangGraph 或 OpenAI Agents SDK？
3. 模型为什么不能直接生成 `memory_delta`？
4. 知识点映射和错因诊断现在是怎么做的？
5. 如果后续要更智能，哪些步骤可以交给模型？
6. 你怎么保证画像变化可解释？
7. 如果模型诊断和规则诊断冲突，谁优先？

### 推荐回答

我会这样回答：

我这里的 Agent Pipeline 不是为了追求框架感，而是把一次错题诊断拆成多个可解释步骤：任务规划、题目识别、知识点检索、知识点映射、错因诊断、画像增量、练习生成和复习计划。它像 Agent 的执行流程，但当前用 TypeScript 函数确定性实现。

我暂时没有用 LangGraph 或 OpenAI Agents SDK，是因为当前流程不需要模型动态规划下一步，也没有复杂工具 handoff 或长流程恢复。P1 的确认入口只是一次明确的人类校验，用无状态 Route Handler 和 token 就能解决。等后续出现多 provider、多工具调用、数据库级确认写入和长期任务恢复时，再评估更合适。

我特别没有让模型直接写 `memory_delta`。因为 `memory_delta` 会影响长期学生画像，是系统的核心状态。如果模型直接写分数变化和错因频次，结果很难验证，也很难追踪。我让模型只做图片抽取，后续画像增量由代码规则计算，这样更适合学习系统。

### 可能被继续追问

- 确定性规则会不会太死板？
- 如何从规则 pipeline 平滑升级到更智能的 Agent？
- 当前错因标签体系怎么维护？
- 如果学生答案很复杂，规则诊断是否足够？
- `memory_delta` 的数值变化依据是什么？
- 是否有重复错因检测？

### 反思与后续优化

当前 pipeline 已经能支撑 Demo，但知识点映射和错因诊断仍然偏样例化。下一步可以引入“候选知识点检索 + LLM 选择 + schema 校验”的半智能方案。模型可以给出候选判断和依据，但最终只能选择已有知识点和错因标签。

练习题生成是最适合优先智能化的环节。因为练习题不直接污染长期画像，即使生成失败也可以回退到模板题或预写题。

### 项目中的真实证据

- 代码：
  - `src/lib/mathtrace-agent-pipeline.ts`
  - `src/lib/image-diagnosis-pipeline.ts`
  - `src/data/mathtrace-demo.ts`
  - `src/lib/utils.ts`
- 测试：
  - `scripts/agent-pipeline.test.mjs`
  - `scripts/image-diagnosis-pipeline.test.mjs`
- 文档：
  - `docs/superpowers/plans/2026-05-30-agent-pipeline-service.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
- 验证：
  - `npm test`
  - sample 路径 smoke test

---

## 5. MiMo Anthropic-compatible Provider 与模型输出校验

### 当前状态

已完成，已验证。这个阶段最初以 MiMo 作为优先 provider 跑通真实图片诊断，后续已把配置层通用化为 `VISION_PROVIDER_*`，当前可通过本地配置切换 Kimi Code、MiMo 等 Anthropic-compatible provider，也可以切到 GLM-4.6V-FlashX 这类 OpenAI-compatible vision provider。parser/provider 也做了真实模型输出韧性增强：模型返回多行字符串、对象数组、空步骤项或缺少兼容字段时，会被有界规范化或进入一次安全修复重试。

### 功能价值

这个阶段让项目从“稳定 mock demo”进入真实 AI 能力：用户上传图片后，服务端调用视觉模型抽取题干、学生答案和学生解题步骤。后续为了降低视觉模型幻觉，标准解法职责已经从图片抽取阶段移到用户确认后的文本分析阶段。

更重要的是，这个接入没有把模型逻辑写死在 route 里，而是做成 provider adapter。这样未来接 Kimi 或 DeepSeek 时，不需要改 `/api/diagnose` 的业务主流程，只需要新增或替换 provider 实现。

### 关键设计

模型调用层主要在：

- `src/lib/anthropic-compatible-provider.ts`
- `src/lib/vision-extraction-parser.ts`
- `src/lib/diagnose-service.ts`

Provider 接口抽象为 `VisionExtractionProvider`。它只暴露一个能力：从图片中抽取题目相关结构化信息。输入包含 base64 图片、mime type 和学生画像摘要；输出必须是项目内部的 `VisionExtractionDraft`。

Parser 明确要求模型输出 JSON，并校验字段：

- `question_text`
- `student_answer`
- `student_solution_steps`
- `extraction_confidence`
- `warnings`

后续我把过渡期的标准解法兼容字段彻底移除了：视觉模型的输出契约只保留题干、学生答案、学生步骤、置信度和 warning。这样确认 payload、token fingerprint、debug summary 和前端预览都不再携带标准解法过渡字段，面试里可以清楚解释为“视觉模型负责看图，文本分析模型负责解题”。最终报告里的 `standard_solution` 仍由 DeepSeek/text analysis provider 基于确认后的题干、学生答案和步骤生成。

这层可以概括成“结构化输出保证”。我没有直接相信模型会稳定返回想要的格式，因为同一个图片抽取任务，模型可能这次返回 JSON，下次混入自然语言说明，或者把数组字段写成多行字符串。当前实现用两类机制控制这个风险：第一，在 prompt 中给出明确字段和示例，让模型模仿固定结构；第二，在代码层用 parser、字段白名单、类型校验和有限规范化强制收敛到 `VisionExtractionDraft`。如果输出越过边界，例如返回非法 JSON、缺少关键字段，或夹带 `memory_delta`、`student_profile` 这类越权字段，就不会进入后续诊断 pipeline。

同时禁止模型输出：

- `memory_delta`
- `student_profile`
- `mistake_history`
- `knowledge_mastery_changes`
- `mistake_cause_changes`

### 技术决策与取舍

我选择 Anthropic-compatible adapter，是因为 MiMo 当前兼容 Anthropic 格式，而且未来 Kimi、DeepSeek 也可能通过类似消息格式接入。这个抽象让 route 不关心具体模型厂商。

我没有引入 Vercel AI SDK、LangGraph 或 OpenAI Agents SDK。当前只需要一次服务端多模态 HTTP 调用，手写 adapter 更轻、更透明，也更容易控制错误码和输出校验。等后续有流式输出、多模型路由、工具调用或结构化生成需求时，再评估 SDK 才合理。

我对模型输出采取严格边界校验。即使模型返回了合法文本，只要不是合法 JSON 或缺少关键字段，也会返回 recoverable error。后来真实 smoke 发现 MiMo 有时把 `student_solution_steps` 和 `warnings` 输出成字符串而不是数组，所以我做了边界内兼容：仍要求 JSON 对象和字段白名单，但允许这两个字段从字符串规范化为数组。

真实测试还暴露了一个比“能不能识别图片”更工程化的问题：模型有时字段名齐全，但字段值不稳定，例如把步骤写成对象数组、空项列表，或漏掉历史兼容字段。我把这类问题放在 provider/parser 边界处理，而不是让后续 Agent Pipeline 猜测模型意图：parser 做有界规范化，provider 对安全的非法输出只重试一次，仍然禁止模型写画像和 `memory_delta`。

这个设计和“受控生成”是同一个方向，但我没有把它包装成某个框架能力。当前阶段更重要的是清楚划分责任：prompt 中的字段约束和 JSON 输出示例负责提高模型遵循格式的概率；parser 和业务 guard 负责保证系统不会因为一次输出格式飘掉而崩溃；长期画像写入仍由确定性代码决定。后续如果切到更强的原生 JSON Schema / structured output 模型，可以把这一层从手写 parser 逐步迁移到 Zod 或 JSON Schema，但业务信任边界不变。

这里最重要的取舍是 LLM 信任边界：模型只能提供“待校验的观察结果”，不能成为长期学习状态的写入者。`memory_delta`、`student_profile` 和 `mistake_history` 只能由确定性代码根据知识点、错因标签和置信度规则生成。即使模型在 malformed JSON 或单引号伪 JSON 里夹带这些 forbidden fields，parser 也会在进入业务 pipeline 前拒绝，避免一次不稳定识别污染学生画像。

真实浏览器测试还暴露了 provider 请求层可观测性不足：同样显示 `model_request_failed`，实际可能是 HTTP 5xx、非 JSON 响应、网络异常或超时。我把错误码继续保持稳定，但新增 `provider_debug` 安全元数据，只暴露 provider、阶段、失败类型和 HTTP 状态，方便本地调试和后续 OCR provider 复用，同时避免泄露图片内容和 API Key。

后续接入 Kimi Code 时，我把原先带有厂商含义的 `MIMO_*` 环境变量和 `provider_debug.provider_name="mimo"` 通用化为 `VISION_PROVIDER_*` 和可配置的 `VISION_PROVIDER_NAME`。这样 Anthropic-compatible adapter 仍然复用同一套请求、错误和解析边界，但本地切换 Kimi Code、MiMo 或其他兼容 provider 时不需要再改代码。旧的 `MIMO_*` 只作为兼容别名保留，避免已有本地 demo 配置突然失效。

再往后试 GLM-4.6V-FlashX 时，我没有把 GLM 逻辑写进 route，而是在同一个 `VisionExtractionProvider` 边界里增加 `VISION_PROVIDER_PROTOCOL=openai` 分支。OpenAI-compatible provider 使用 `chat/completions`、`Authorization: Bearer` 和 `image_url` data URL；后续诊断、确认和画像写入规则完全不变。

### 性能收益（如适用）

Provider adapter 的性能收益主要来自“只在必要时调用模型”和“单次多模态请求”。图片路径只让 MiMo 做题目、学生答案和步骤抽取，后续诊断继续复用本地 pipeline，避免把知识点映射、错因诊断、练习和复习计划拆成多次模型调用。

当前 MiMo 请求还显式关闭 `thinking`，并设置超时边界，目标是减少不可控输出和长时间等待。手写轻量 adapter 也避免了当前阶段引入大 SDK 带来的额外依赖、调试和构建面。

### 面试官可能怎么问

1. 为什么要做 provider adapter，而不是直接在 route 里 fetch MiMo？
2. 你怎么保护 API Key？
3. 模型输出非法 JSON 怎么办？
4. 为什么模型不能输出 `memory_delta`？
5. 如果 MiMo、Kimi、DeepSeek 返回格式不同，怎么兼容？
6. 你怎么处理 timeout、HTTP error 和非 JSON 响应？
7. 为什么要把 `thinking` 关闭？
8. 为什么 malformed JSON 里出现 `memory_delta` 也要拦截？
9. 为什么 `error.code` 之外还需要 `provider_debug`？
10. 你怎么保证模型输出结构稳定？有没有 schema enforcement？

### 推荐回答

我会这样回答：

我没有把 MiMo 调用写在 route 里，而是抽成 Anthropic-compatible provider adapter。这样 `/api/diagnose` 只依赖统一的 `VisionExtractionProvider` 接口，不关心底层是 MiMo、Kimi 还是 DeepSeek。未来新增 provider 的成本会低很多。

API Key 只在服务端通过 `.env.local` 读取，前端代码、文档和日志里都不出现真实 key。前端只调用自己的 `/api/diagnose`，由服务端决定是否调用模型。

模型输出是最大的不确定性，所以我把视觉模型限制在“图片抽取器”的角色。它只能输出题干、学生答案、步骤、置信度和 warnings，不负责生成标准解法。它不能写 `memory_delta`，也不能覆盖 `student_profile`。如果它输出这些字段，parser 会拒绝。这样可以防止长期画像被模型直接污染，也减少视觉模型在看不清图片时编造解法的风险。

真实测试里我还遇到 MiMo 返回合法 JSON 但字段类型不完全符合要求，比如把步骤数组输出成多行字符串。我没有直接放宽所有校验，而是只对 `student_solution_steps` 和 `warnings` 做可控规范化，仍保留字段白名单和长度边界。

我会把这叫作结构化输出保证，而不是单纯 prompt engineering。prompt 的字段约束和 JSON 输出示例只能提高模型返回正确 JSON 的概率，真正的保证来自代码层：parser 只接受项目定义的字段和类型，禁止越权字段进入业务流程；安全范围内的小偏差可以规范化，越界输出就进入 recoverable error 或一次安全重试。这样即使模型这次输出格式飘了，整个诊断流程也不会把错误结构继续传下去。

我也把 malformed JSON 当成不可信输入处理。即使这段文本最后无法 parse，只要原始输出里已经出现 `memory_delta`、`student_profile` 这类越权字段，我也不会让 provider 进入修复重试。因为重试可能把一次越权意图包装成看似合法的 JSON。对学习画像这种长期状态，我宁愿本次图片诊断失败，也不让模型越过确定性规则直接影响学生画像。

我还把“用户稳定错误码”和“开发诊断信息”分开。前端仍然只依赖 `model_request_failed`、`model_timeout` 这类稳定 code 做可恢复错误态，但 response 可以带一个安全的 `provider_debug`，区分是 `http_error`、`invalid_json`、`empty_text_content`、`network_failed` 还是 `timeout`。其中 `empty_text_content` 专门覆盖“provider HTTP/JSON 成功，但没有返回可解析文本”的情况。这样本地排查更快，未来接 OCR 也能复用同一套错误通道，同时不会把图片、原始模型响应或 API Key 暴露给前端。

后来切到 Kimi Code 时，我没有新建一套 provider，也没有把 Kimi 写死进业务代码，而是把配置层从 `MIMO_*` 改成 `VISION_PROVIDER_*`。这样代码表达的是“图片诊断模型 provider”，不是某个厂商；`provider_debug` 默认显示 `anthropic_compatible_vision`，如果本地需要区分 provider，可以用 `VISION_PROVIDER_NAME` 设置。这个调整的价值是降低模型切换成本，同时保留旧 `MIMO_*` 兼容，避免破坏已有演示环境。

接 GLM 时，我延续了这个边界，只新增协议差异：Anthropic-compatible 和 OpenAI-compatible 的请求体、认证头和响应解析不同，但对上层仍暴露同一个 `extractQuestionFromImage()`。所以切 provider 不会影响 `/api/diagnose`、`/api/confirm`、低置信度不写画像这些产品规则。

### 可能被继续追问

- 如果模型没识别到学生答案，现在怎么处理？
- 你如何判断 recoverable error 和 fatal error？
- provider adapter 如何支持不同模型的鉴权方式？
- Parser 越来越复杂时是否该迁移到 Zod？
- 如果模型输出看似合法但数学内容错误怎么办？
- 是否需要保存模型原始响应用于 debug？

### 反思与后续优化

当前 provider 已经能跑通真实 image smoke，并已补上模型缺少 `student_answer` 时的 prompt 约束和安全调试摘要。模型识别质量和输出稳定性仍需要继续打磨；后续新增的“识别结果编辑确认”把 provider 输出从直接诊断输入改成待确认草稿，避免一次识别错误直接进入画像写入决策。

另一个后续优化是引入 provider-level telemetry，但必须小心隐私。可以记录错误码、耗时、模型名和是否 recoverable，但不要记录完整图片 base64 或学生敏感原文。

### 项目中的真实证据

- 代码：
  - `src/lib/anthropic-compatible-provider.ts`
  - `src/lib/provider-error.ts`
  - `src/lib/vision-extraction-parser.ts`
  - `src/lib/diagnose-service.ts`
  - `src/lib/image-input.ts`
  - `src/lib/image-confirmation-token.ts`
- 测试：
  - `scripts/anthropic-compatible-provider.test.mjs`
  - `scripts/diagnose-client.test.mjs`
  - `scripts/vision-extraction-parser.test.mjs`
  - `scripts/image-diagnosis-pipeline.test.mjs`
- 文档：
  - `docs/superpowers/plans/2026-05-30-mimo-anthropic-provider.md`
  - `README.md`
  - `docs/TECHNICAL_ROADMAP.md`
- 验证：
  - 真实 MiMo image smoke：`status=200`、`source=image`、`confidence=high`、`practice_count=3`
  - `npm test`
  - `npm run build`

---

## 6. P0 回归测试与 localStorage 状态恢复

### 当前状态

已完成，已合并到 main。localStorage 用于 P0 Demo 的学生画像状态恢复；损坏数据、不可用 storage 等情况已有回退测试。

### 功能价值

这个阶段服务的是演示稳定性。用户完成一次诊断后，前端会把更新后的 demo 学生画像保存到 localStorage；刷新页面后，工作台能恢复上次画像状态。这让 Demo 有“长期画像”的感觉，而不是每次刷新都回到初始状态。

同时，它也覆盖了浏览器状态可能损坏的情况。localStorage 中可能有非法 JSON、旧版本结构或浏览器不可用异常，系统不能因此白屏。

### 关键设计

状态恢复逻辑位于 `src/lib/demo-state.ts`，核心能力包括：

- `parseStoredStudentProfile`
- `serializeStudentProfile`
- `readStoredStudentProfile`
- `writeStoredStudentProfile`
- `clearStoredStudentProfile`
- `createMemoryStorage`

前端工作台只在 client component 中读写 localStorage，服务端 API route 保持无状态。这符合当前 P0 边界：不引入数据库，但仍能展示画像变化。

### 技术决策与取舍

我没有在 P0 引入数据库。原因是当前重点是 Demo 闭环和错因诊断逻辑，数据库会引入 auth、schema、迁移、权限和部署成本。localStorage 足够支撑单用户 Demo 的状态恢复。

但我没有把 localStorage 当成可信来源。读取时会做结构校验，遇到非法数据回退到 `demoStudentProfile`。写入失败也不让页面崩溃。

代价是：这不是真实多设备长期记忆，也不支持用户账户和历史错题列表。它只是 P0 阶段对“画像变化”概念的轻量模拟。

### 性能收益（如适用）

P0 使用 localStorage 的性能收益是读取和恢复画像不需要额外网络请求或数据库连接，页面刷新后可以在浏览器侧快速恢复 demo 状态。对演示来说，这比每次刷新都重新请求服务端更稳定。

同时，localStorage 读取被封装成可测试的轻量 helper。损坏数据会直接回退默认画像，避免因为一次解析失败导致页面白屏或阻塞主流程。

### 面试官可能怎么问

1. 为什么用 localStorage 而不是数据库？
2. localStorage 数据损坏怎么办？
3. 画像数据为什么不能完全相信前端？
4. 刷新后如何恢复状态？
5. 低置信度图片结果会不会写入 localStorage？
6. 后续从 localStorage 迁移到数据库怎么做？
7. localStorage 里有没有隐私风险？

### 推荐回答

我会这样回答：

P0 阶段我用 localStorage 是为了用最小成本展示“长期画像变化”这个产品价值。用户做完一次样例题诊断后，画像掌握度和错因频次会变化，刷新后还能恢复。这样 Demo 能表现出“系统记住了你的错因”。

但我没有把 localStorage 当成可信数据库。读取时会校验结构，非法 JSON 或畸形字段都会回退到默认 demo 画像；写入失败也不会让页面崩溃。服务端仍然是无状态的，真正长期记忆会放到后续数据库阶段。

对于图片诊断，我还加了低置信度保护：如果模型抽取置信度低，或者 `memory_delta.should_persist=false`，前端不会写 localStorage。这是为了避免不可靠识别污染学生画像。

### 可能被继续追问

- localStorage 状态和服务端返回的 `student_profile` 冲突怎么办？
- 如果多个 tab 同时打开，会不会互相覆盖？
- 后续数据库迁移时怎么设计 `memory_delta` 表？
- 当前 demo 画像是否包含真实学生隐私？
- localStorage schema 版本升级怎么做？

### 反思与后续优化

后续进入真实产品阶段，需要把画像变化从“保存最终 profile”升级为“保存诊断事件和 memory_delta”。长期系统不应该只保存最后分数，而应该能追踪每次错题如何影响画像，这样才方便回滚、解释和复盘。

如果继续使用 localStorage 作为离线缓存，也应该加入 schema version 和迁移函数，避免后续字段变化导致旧数据不可读。

### 项目中的真实证据

- 代码：
  - `src/lib/demo-state.ts`
  - `src/components/mathtrace-workbench.tsx`
  - `src/lib/diagnose-client.ts`
- 测试：
  - `scripts/demo-state.test.mjs`
  - `scripts/diagnose-client.test.mjs`
- 文档：
  - `docs/superpowers/plans/2026-05-30-p0-demo-state-stability.md`
  - `docs/superpowers/plans/2026-05-30-p0-regression-tests.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- 验证：
  - `npm test`
  - 手动刷新恢复检查

---

## 7. P1 图片诊断前端入口与错误态体验

### 当前状态

已完成，已通过本地测试、构建和真实 image smoke；当前仍在分支 `codex/image-diagnosis-frontend-experience` 待最终合并。Claude Code 审查已完成，并已处理两个建议项：压缩后超限判断和 `gaokao_focus` 元素校验。

### 功能价值

这个阶段让用户可以真正上传数学错题图片，而不是只看内置样例题。它把 MiMo 后端能力变成用户可操作的前端体验：选择图片、预览、压缩、提交、展示识别结果和诊断报告。

它对找工作也很有价值，因为它同时涉及前端体验、文件处理、图片压缩、API 调用、错误态、模型不稳定性和状态持久化边界。面试官可以从这里深挖很多真实工程问题。

### 关键设计

前端新增了几个边界清晰的模块：

- `src/components/image-upload-panel.tsx`：图片选择、预览、清除、准备状态和上传错误展示。
- `src/lib/image-upload-client.ts`：客户端文件类型校验、base64 大小计算、data URL 解析、压缩结果选择。
- `src/lib/diagnose-client.ts`：构建 sample/image 请求 payload、调用 `/api/diagnose`、处理错误响应、判断是否持久化画像。
- `src/lib/diagnosis-view-model.ts`：把 sample/image API 响应转成 UI 更容易消费的 view model。

工作台支持两种模式：

- `sample`：稳定样例题路径，成功后可以写 localStorage。
- `image`：图片诊断路径，成功后展示模型识别结果；低置信度不写 localStorage。

### 技术决策与取舍

我把图片处理逻辑放到 `image-upload-client.ts`，而不是散落在组件里。这样文件类型校验、base64 大小计算和压缩候选选择可以单独测试，组件只关心 UI 状态。

我没有直接把手机原图发给服务端，而是在前端压缩到 1MB 内再上传。原因是手机照片经常 4-5MB，base64 后更大，直接传给模型会更慢、更容易失败，也可能影响 Demo 稳定性。当前策略是允许较大原图选择，但发送给后端前压缩。

我也没有让图片诊断失败时自动切成样例题结果。失败时保留当前可见报告，并提供“切回样例题”按钮。这样不会制造“用户上传图片但系统展示样例题”的错觉。

### 性能收益（如适用）

图片上传阶段最明确的性能收益来自客户端压缩。手机随手拍的图片常见是 4-5MB，base64 后体积还会继续膨胀；当前设计是在前端把图片压缩到 1MB 内再提交给 `/api/diagnose`，明显减少请求体积、上传时间和服务端处理压力。

这个策略也降低了模型调用失败率和等待时间。MiMo 接收的是更小的图片 payload，后端也能在进入 provider 前先用大小和 MIME 校验拦截无效输入。对应证据是 `MAX_UPLOAD_IMAGE_BYTES`、`selectUploadSizedDataUrl`、`prepareImageForDiagnosis` 和 image upload 回归测试。

### 面试官可能怎么问

1. 图片上传为什么要做客户端压缩？
2. 你如何计算 base64 图片大小？
3. 为什么发送给后端限制在 1MB？
4. image 模式失败时，为什么不自动 fallback 到 sample？
5. 如何避免低置信度结果污染 localStorage？
6. 为什么要引入 view model 层？
7. 如果用户快速连续选择两张图片，会不会有状态 race？
8. 图片上传支持手机 4-5MB 照片吗？

### 推荐回答

我会这样回答：

图片上传这里我把“原图选择”和“发送给模型”分成两层。用户可以选择较大的手机原图，但前端会校验格式和大小，然后压缩成 1MB 内的 JPEG 再发给 `/api/diagnose`。这样能兼顾用户体验和模型调用稳定性。

我没有把图片处理写在组件里，而是抽成 `image-upload-client.ts`。比如 MIME 类型校验、data URL 解析、base64 byte size 计算、压缩候选选择都可以单独测。组件只负责展示上传态、预览和错误。

对于失败态，我没有自动 fallback 成样例题结果。因为用户上传的是自己的图片，如果系统失败后悄悄展示样例题，会误导用户。我选择保留当前报告，展示 recoverable error，并提供“切回样例题”的明确入口。

低置信度方面，我做了多层保护：后端 pipeline 低置信度时 `should_persist=false`，响应 guard 会拒绝“低置信度但要求持久化”的矛盾响应，前端写 localStorage 前也会再次判断置信度和 `should_persist`。

### 可能被继续追问

- 前端压缩会不会损失数学符号识别质量？
- 为什么压缩目标是 1MB，不是 2MB 或 5MB？
- 如果压缩后仍超过 1MB，用户看到什么？
- `FileReader.readAsDataURL` 和 `URL.createObjectURL` 怎么取舍？
- 图片中只有题干没有学生答案，系统怎么提示？
- 手机拍照方向、模糊、阴影怎么处理？
- 如何做视觉回归验证？

### 反思与后续优化

当前图片上传已能支撑真实体验，但还可以继续优化两点。

第一，手机照片支持可以更友好。现在原图上限和压缩策略已经能处理一部分手机图，但后续可以把原图上限提升到 15MB，并用多档长边尺寸加 quality 的方式压缩，提高成功率。

第二，模型没识别到学生答案时，当前已能显示更友好的可恢复提示，并在开发环境返回字段级安全诊断摘要。后续新增的识别结果确认界面，则让学生能编辑模型抽取出的题干、答案和步骤，再生成报告和画像写入决策。

### 项目中的真实证据

- 代码：
  - `src/components/image-upload-panel.tsx`
  - `src/components/mathtrace-workbench.tsx`
  - `src/lib/image-upload-client.ts`
  - `src/lib/diagnose-client.ts`
  - `src/lib/diagnosis-view-model.ts`
  - `src/lib/diagnose-api.ts`
- 测试：
  - `scripts/image-upload-client.test.mjs`
  - `scripts/diagnose-client.test.mjs`
  - `scripts/diagnosis-view-model.test.mjs`
  - `scripts/vision-extraction-parser.test.mjs`
- 文档：
  - `docs/superpowers/plans/2026-05-30-image-diagnosis-frontend-experience.md`
  - 本地 Claude Code 审查报告
  - `README.md`
- 验证：
  - `npm test`
  - `npm run lint`
  - `npm run build`
  - 真实 MiMo image smoke
  - Playwright 上传态、成功态、错误态、移动端截图

---

## 8. 工程协作流程、审查与本地合并策略

### 当前状态

已完成流程约定，并写入 `AGENTS.md`。当前项目约定复杂或高风险任务采用“分支 -> 计划 -> 实现 -> 自测 -> Claude Code 审查 -> Codex 修复 -> 再测 -> 合并 main”的节奏。审查报告默认本地保留，不上传 GitHub。

### 功能价值

这个阶段不是产品功能，但对面试很有价值。它展示的是工程协作能力：如何控制分支范围、如何处理代码审查、如何保护本地审查材料、如何避免把无关文件提交到 GitHub。

很多候选人在项目里只展示“我写了功能”，但真实工作中更重要的是“我如何让变更可审查、可验证、可回滚”。这个阶段可以帮助我在面试中讲清楚自己的工程习惯。

### 关键设计

项目协作流程包括：

- 一个任务一个分支。
- 复杂任务先写计划。
- Codex 实现并自测。
- Claude Code 做本地或 PR 审查。
- 审查报告默认作为本地材料保留，不提交 GitHub。
- 本地审查材料不进入 staged 范围。
- 修复审查意见后重跑相关测试。
- 合并前检查文档、测试、lint、build 和敏感信息。

### 技术决策与取舍

我选择先本地合并到 main，再按需要推 main，而不是所有任务都立即开 PR。这更符合当前个人项目节奏：我可以在本地用 Claude Code 做审查，修完后再合并，避免 GitHub 上堆积半成品 PR。

但我仍保留 PR 思维：每个分支有明确主题，每次提交有可解释变化，审查报告记录问题和修复结果。这样即使没有远程 PR，项目也保持可审查。

审查报告不上传 GitHub，是因为里面可能包含本地验证细节、截图路径、审查过程记录，长期公开价值不高。真正应该进入仓库的是代码、测试、PRD、Roadmap 和必要 ADR。

### 性能收益（如适用）

这一阶段的收益主要是开发效率和回归验证效率。把复杂任务拆成“计划 -> 实现 -> 自测 -> 审查 -> 修复 -> 再测”，可以更早发现问题，减少后期大范围返工。

本地 review 文档不进入提交范围，也降低了合并噪音。提交只包含代码、测试和长期文档，review 过程材料留本地，后续 `git diff` 和代码审查会更聚焦。

### 面试官可能怎么问

1. 你这个项目是怎么做代码审查的？
2. 为什么审查报告不提交 GitHub？
3. 你怎么避免把临时文件、截图或本地报告提交上去？
4. Codex 和 Claude Code 在项目中分别承担什么角色？
5. 如果审查意见你不同意，你会怎么处理？
6. 为什么复杂功能要先写计划？
7. 你怎么保证每次合并不会破坏 P0 演示路径？

### 推荐回答

我会这样回答：

这个项目虽然是个人项目，但我尽量按团队工程流程做。复杂功能会先开分支和写计划，Codex 负责实现和自测，Claude Code 负责站在 reviewer 角度找 bug、回归风险、测试缺口和安全问题。审查后我会逐条评估，不是盲目接受；确认合理后再修复并重新跑测试。

审查报告默认只留本地，因为它更像开发过程材料，不一定适合公开提交。公开仓库里应该保留真正有长期价值的文档，比如 PRD、Roadmap、架构说明和测试。这样仓库不会被过程性材料污染。

我也把流程写进 `AGENTS.md`，让后续会话继续遵守同样规则。比如复杂任务不能直接在 main 上改，review docs 不要提交，API key 不能进入代码或日志。

### 可能被继续追问

- 本地审查报告不提交，会不会丢失协作记录？
- 你如何区分必须修复项和建议项？
- 如果 AI reviewer 给出错误建议怎么办？
- 为什么不一律走 GitHub PR？
- 你有没有做 pre-commit hook 或 CI？
- 当前人工流程如何演进到团队 CI 流程？

### 反思与后续优化

当前流程适合个人开发和面试项目，但长期可以加入 GitHub Actions，自动跑 `npm test`、`npm run lint`、`npm run build` 和敏感信息扫描。这样合并前不只依赖人工执行。

另外，本地审查材料不提交的规则需要配合 `.gitignore` 或 staged 范围检查，否则仍可能误提交。后续可以考虑把本地审查报告移到仓库外路径，进一步降低误提交风险。

### 项目中的真实证据

- 代码：
  - `AGENTS.md`
  - `.gitignore`
- 测试：
  - `package.json` 中的 `npm test` 串行脚本
- 文档：
  - 本地 Claude Code 审查报告
  - `docs/superpowers/plans/2026-05-30-image-diagnosis-frontend-experience.md`
  - `docs/TECHNICAL_ROADMAP.md`
- 验证：
  - Claude Code 审查报告
  - `git status --short` 检查未跟踪文件
  - `git diff --check main`

---

## 9. 图片诊断失败定位与安全调试摘要

### 当前状态

已完成并已验证。这个阶段是在真实图片诊断体验中发现 MiMo 返回结构缺少 `student_answer`、空 `student_solution_steps`、以及模型自报高置信度但实际未识别学生答案后补上的工程化能力：系统现在能把“模型非法输出”进一步解释为可定位的安全摘要，并对模型自评置信度做业务一致性兜底。

### 功能价值

真实 AI 应用里，模型失败不是一个单一原因。上传图片后如果系统只显示“模型输出缺少 student_answer”，用户不知道自己应该重新拍照、裁剪图片，还是等待系统修复；开发者也很难判断是图片质量问题、模型视觉识别问题，还是模型没有遵守 JSON 协议。

这个阶段的价值是让失败变得可诊断。系统会在开发环境返回安全摘要：模型是否返回 JSON、返回了哪些字段、缺少哪些字段，以及题干和学生答案的长度。这样我可以判断：

- 题干长度正常但学生答案长度为 0：模型识别到题干，但没识别到学生作答区域，或没有按协议返回学生答案字段。
- 输出不是合法 JSON：模型格式没有遵守协议。
- 字段很少或题干长度也为 0：更可能是图片质量、裁剪或视觉识别失败。

这对面试很有价值，因为它能展示我不是把模型当黑盒调用，而是在做可观测、可恢复、可解释的 AI 工程。

### 关键设计

这个能力分成三层：

- Prompt 层：要求模型即使没有识别到学生答案，也必须输出 `student_answer="未识别到学生答案"`，并将 `extraction_confidence` 设为 `low`。
- Provider 层：请求 MiMo 时显式设置 `temperature=0`，尽量降低同图重复上传时的输出波动。
- Parser 层：继续严格校验 JSON 和字段边界，但在失败时生成 `debug_summary`，只包含输出类型、字段列表、缺失字段和字段长度；如果模型返回空 `student_solution_steps` 或 `student_answer="未识别到学生答案"`，则强制降级为低置信度可展示结果，并补充 warning。
- 前端错误层：如果缺少 `student_answer`，用户看到的是“没有识别到学生作答区域，请上传包含题干和学生解题痕迹的图片”，开发环境再附带安全诊断摘要；如果新请求失败但保留旧报告，页面会标明当前显示的是上一次成功结果或样例题结果。

`debug_summary` 不包含图片 base64、不包含完整题干、不包含完整学生答案，只返回长度和字段结构。这样既能定位问题，又不扩大未成年人学习数据和图片内容的泄露面。

### 技术决策与取舍

我没有简单放宽 parser，比如允许模型缺少 `student_answer` 后继续进入诊断。原因是缺少学生答案时，后续错因诊断很容易变成系统臆测，甚至污染学生画像。

我选择的是“严格校验 + 业务一致性归一化”：模型输出缺字段仍然失败；如果模型字段齐全但业务含义是“未识别到学生答案”或“没有步骤”，则转为低置信度可展示结果，不写画像。这样既避免 502 过多，也不会让模型自报的 high confidence 直接污染长期画像。

我也没有把完整模型原文写进日志或返回给前端。虽然这会让调试更直接，但会带来隐私风险。错题图片和学生作答可能包含未成年人学习数据，开发期也只应该暴露最小必要信息。

### 性能收益（如适用）

这个阶段的直接收益是问题定位效率，而不是运行时吞吐。`debug_summary` 只返回字段列表、缺失字段和长度信息，可以快速判断失败发生在图片识别、JSON 协议还是字段校验层，减少反复重传图片和盲目改 prompt 的时间。

它也控制了调试数据体积：不返回完整模型原文和图片 base64，只返回最小摘要，既降低前端错误对象大小，也避免为了排查问题引入高风险日志。

### 面试官可能怎么问

1. 你怎么判断图片诊断失败到底是图片问题还是模型问题？
2. 为什么不直接把模型原始输出打印出来？
3. 缺少 `student_answer` 时为什么不继续诊断？
4. 开发环境 debug 信息和生产环境有什么区别？
5. 这个设计如何保护学生隐私？
6. Prompt 和 parser 各自承担什么责任？
7. 如果模型返回字段名不同，比如 `answer`，你会怎么处理？
8. 这个能力和 LLM trust boundary 有什么关系？

### 推荐回答

我会这样回答：

在真实图片诊断里，我遇到过模型返回 JSON 但缺少 `student_answer` 的情况。这个问题不能简单理解成“模型看不懂图片”，因为它可能是图片里没有学生答案，也可能是模型识别到了内容但没有按我们的协议输出字段。

所以我没有直接放宽 parser，而是做了一个安全调试摘要。它只告诉我模型返回了哪些字段、缺少哪些字段，以及题干和学生答案的长度。比如题干长度大于 0、学生答案长度为 0，就说明模型大概率识别到了题干，但没有识别到学生作答区域或没有按协议填字段。

同时我在 prompt 里要求模型即使没有识别到学生答案，也要输出 `student_answer="未识别到学生答案"`，并把置信度设为 low。但我不完全相信模型的自评置信度：如果返回的是“未识别到学生答案”或步骤为空，代码层会强制降为 low。低置信度结果不会写入 localStorage，也不会更新长期画像。

我没有把完整模型原文或图片 base64 返回给前端，因为这些内容可能包含学生作答和隐私信息。这个设计的核心是：让错误可定位，但不突破数据安全边界。同时，如果本次请求失败但页面保留旧报告，UI 会标明“当前显示的是上一次成功结果”，避免把旧结果误认为本次模型输出。

### 可能被继续追问

- 如果生产环境也需要排查模型失败，怎么做安全日志？
- debug summary 会不会仍然泄露敏感信息？
- 如果模型把学生答案放进了 `question_text`，字段长度还能判断吗？
- “识别结果编辑确认”现在怎么防止污染长期画像？
- 是否应该改为 Zod schema 或 JSON Schema 强约束？
- 如果 MiMo、Kimi、DeepSeek 输出格式不同，adapter 如何统一？

### 反思与后续优化

当前 debug summary 能解决开发期定位问题；后续新增的图片识别确认流程进一步把“模型输出可观测”推进到“用户可校正”。图片诊断后会先展示模型识别出的题干、学生答案和步骤，让学生确认或编辑，然后再决定是否允许写入画像。

如果未来进入生产环境，还需要设计服务端安全日志策略。日志可以记录错误码、字段列表、缺失字段和长度，但不能记录完整题干、学生答案、图片 base64 或真实学生身份信息。

另一个后续方向是把 parser 从手写类型守卫迁移到 Zod 或 JSON Schema，并为不同 provider 的输出差异建立更清晰的 adapter 层。

### 项目中的真实证据

- 代码：
  - `src/lib/vision-extraction-parser.ts`
  - `src/lib/anthropic-compatible-provider.ts`
  - `src/lib/diagnose-api.ts`
  - `src/lib/diagnose-service.ts`
  - `src/lib/diagnose-client.ts`
  - `src/lib/diagnosis-view-model.ts`
  - `src/components/mathtrace-workbench.tsx`
- 测试：
  - `scripts/vision-extraction-parser.test.mjs`
  - `scripts/diagnose-client.test.mjs`
  - `scripts/diagnosis-view-model.test.mjs`
  - `scripts/agent-pipeline.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `interview/mathtrace-project-narrative.md`
- 验证：
  - `npm test`
  - `npm run lint`
  - `npm run build`

---

## 10. 图片识别结果编辑确认入口

### 当前状态

已完成本地实现并通过子智能体规格审查、质量审查和脚本验证。当前还未推 PR；按协作流程，完成自测和浏览器视觉验证后会交给 Claude Code 做最终审查。

### 功能价值

这个阶段解决的是图片诊断最大的信任问题：模型看错题干、漏掉学生答案或误判步骤时，不能直接把错误结果写进长期画像。现在图片路径会先返回可编辑的识别草稿，学生检查题干和解题步骤后，再确认生成诊断报告；标准解法不再要求视觉模型在预览阶段生成，而是在确认后由文本分析模型生成。

对用户来说，这让系统从“模型说了算”变成“模型先帮我识别，我确认后再分析”。对演示来说，它能清楚展示 MathTrace 的长期画像不是随便被一次 OCR 结果污染，而是有确认门槛。

### 关键设计

图片路径被拆成两段：

- `/api/diagnose` 的 `image_diagnosis`：只调用 MiMo provider 做图片抽取，返回 `stage="extraction_review"`、可编辑识别草稿、warnings 和 `confirmation_token`。
- `/api/confirm`：接收用户确认后的 `confirmed_extraction`，校验 token 和草稿边界，再复用确定性 `runImageMathTraceAgent` 生成完整报告、`memory_delta`、练习和复习计划。

前端工作台新增 `EditableExtractionDraft` 状态。抽取成功后不更新右侧新报告，也不写 localStorage，而是在图片上传面板下方展示识别结果确认区。只有用户点击确认并拿到完整图片诊断响应后，前端才调用 `createImageDiagnosisViewModel` 更新报告区；是否写 localStorage 继续由 `shouldPersistDiagnoseProfile` 决定。

### 技术决策与取舍

我选择新增无状态 `/api/confirm`，而不是把确认语义继续塞回 `/api/diagnose`。这样抽取和诊断边界更清楚：`/api/diagnose` 负责“不可信图片抽取”，`/api/confirm` 负责“用户确认后诊断”。

我没有引入数据库、LangGraph、OpenAI Agents SDK 或 Vercel AI SDK。当前确认流程只需要一次人类校验，不需要 durable execution 或复杂 Agent handoff；用 TypeScript service 和签名 token 更轻、更容易测试。

当前无状态实现有一个明确代价：如果用户编辑草稿，服务端会发现草稿指纹和原 token 不匹配。系统仍会生成报告，但会强制降为 low confidence，不写长期画像。这是为了避免前端随意构造高置信诊断污染长期状态。真正要支持“编辑后也可持久化”，后续需要服务端保存草稿版本或数据库诊断 run，再让用户确认写入。

### 性能收益（如适用）

这个阶段的收益主要是稳定性和错误传播控制，而不是单次请求更快。未确认图片结果不会进入知识点映射、错因诊断、画像写入和 localStorage 更新，减少了错误状态向后传播的机会。

同时，确认 token 不包含题干、学生答案、标准解法或图片 base64，只包含签名 payload 和草稿指纹。这降低了前端状态和调试输出携带敏感学习内容的风险。

标准解法展示后来补了一层更细的取舍：报告区不再给每个句子强行生成编号，只把原文里已经存在的 `(1)`、`（1）`、`②` 这类结构标记迁移到左侧 marker；普通段落保持自然阅读。公式渲染也不主要依赖前端猜测裸公式，而是要求确认后的 text analysis provider 在 `standard_solution` 中用 `$...$` 或 `$$...$$` 包裹数学表达式。前端仍保留有限兜底，但它只是展示容错，不是完整数学解析器。

展示层后来又补了一层保守排版优化：`createStandardSolutionBlocks` 会在长段标准解法里识别 `当...时`、`综上` 等高置信分段 cue，把连续推导拆成多个 paragraph block，改善阅读节奏；但它不新增模型字段、不改写原答案编号，也不让前端承担完整数学结构解析。

### 面试官可能怎么问

1. 为什么图片诊断要拆成抽取和确认两步？
2. `/api/confirm` 为什么是无状态的？
3. 用户编辑识别结果后为什么不能直接写画像？
4. 低置信度确认后还会不会生成报告？
5. token 里有没有题干或学生答案？
6. 为什么不直接用 LangGraph 的 human-in-the-loop？
7. 前端怎么避免未确认结果写 localStorage？
8. 后续怎么支持编辑后可信持久化？
9. 为什么标准解法展示不自动给每句话编号？
10. 图片识别出的裸公式怎么保证能被 KaTeX 渲染？

### 推荐回答

我会这样回答：

图片诊断最大的问题不是能不能识别，而是识别错了以后会不会污染长期画像。所以我把流程拆成两段：第一段 `/api/diagnose` 只做图片抽取，返回可编辑草稿；第二段 `/api/confirm` 才基于用户确认后的草稿生成完整诊断。

我没有让模型直接进入 `memory_delta`，也没有让前端直接决定画像写入。服务端会校验确认 token、草稿字段和置信度。低置信度即使用户确认，也只生成报告，不写长期画像；如果用户编辑后的草稿和 token 指纹不匹配，当前无状态版本也会强制 non-persist。

这个取舍比较保守，但符合学习画像的风险等级。报告可以临时展示，长期画像不能轻易被一次不可靠识别污染。后续如果要支持编辑后也能持久化，我会引入数据库保存 extraction draft 和 diagnosis run，让服务端拥有草稿版本历史，而不是相信前端传回来的文本。

标准解法展示上，我没有继续让前端自动给每个句子编号。真实标准解法里经常已经有 `(1)`、`②` 这类引用关系，如果再叠一套 1-13 的 UI 编号，会打乱原来的证明逻辑。所以我只迁移原文已有编号到左侧 marker，没有编号的内容保持段落。

公式渲染也是类似思路：前端正则只能做有限兜底，不能可靠理解所有数学文本。早期我试过让图片抽取阶段携带标准解法过渡文本，后来发现视觉模型生成标准解法既慢又容易不完整，所以最终收窄为：视觉模型只抽取题干、学生答案和学生步骤，确认后由 text analysis provider 独立生成 `standard_solution`，并要求它用 `$...$` 或 `$$...$$` 标注数学表达式。这样比前端猜 `f'(x)`、`1/a`、`ln(1/a)` 哪些该包成公式更稳定，也减少视觉模型编造解法的风险。

### 可能被继续追问

- 如果用户确实编辑对了，为什么不能写画像？
- 指纹不匹配时生成的报告是否仍可信？
- token secret 怎么管理？
- 生产环境缺少 `MATHTRACE_CONFIRM_SECRET` 会怎样？
- 如果确认接口被重复提交怎么办？
- 未来数据库版本怎么设计草稿状态？
- 如果模型还是输出裸公式，前端兜底到什么程度？
- 自动格式化会不会改变标准解法原有逻辑？

### 反思与后续优化

当前方案满足 P1 Demo 的安全边界，但还不是完整商业持久化。最明显的缺口是：无状态 token 不能区分“恶意篡改”和“用户合理编辑”。所以编辑后的报告可以用于即时学习，但不进入长期画像。

标准解法格式化目前也保持保守：只识别有限的原文编号形态和常见裸公式，不追求完整 Markdown/LaTeX 自动修复。更可靠的演进方向是继续提升 text analysis provider prompt，后续再评估是否引入更明确的结构化字段，例如 `standard_solution_steps`，而不是让前端无限扩张正则。

后续如果引入数据库，应增加 `diagnosis_runs` 或 `image_extraction_drafts`，保存原始抽取、用户编辑版本、确认时间、确认人和最终 `memory_delta`。那时才能把“编辑后确认写入”做成真正可审计的长期记忆流程。

### 项目中的真实证据

- 代码：
  - `src/lib/diagnose-service.ts`
  - `src/lib/confirm-service.ts`
  - `src/lib/image-confirmation.ts`
  - `src/lib/image-confirmation-token.ts`
  - `src/lib/diagnose-client.ts`
  - `src/lib/diagnosis-view-model.ts`
  - `src/components/mathtrace-workbench.tsx`
  - `src/lib/vision-extraction-parser.ts`
- 测试：
  - `scripts/image-confirmation.test.mjs`
  - `scripts/image-diagnosis-pipeline.test.mjs`
  - `scripts/diagnose-client.test.mjs`
  - `scripts/diagnosis-view-model.test.mjs`
- 文档：
  - `docs/superpowers/plans/2026-06-03-image-diagnosis-confirmation.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
- 验证：
  - `npm test`
  - `npm run lint`
  - `./node_modules/.bin/tsc --noEmit`

---

## 10. GLM 图片抽取与 DeepSeek 确认后文本分析增强

### 当前状态

已完成，已验证。图片诊断链路现在拆成两个模型责任：GLM-4.6V-FlashX 继续通过 `VISION_PROVIDER_*` 做图片识别和结构化抽取；用户确认识别草稿后，DeepSeek `deepseek-v4-flash` 可通过 `ANALYSIS_PROVIDER_*` 增强错因说明、步骤分析和标准解法表达。长期画像写入、`memory_delta` 和学生画像合并仍由本地确定性规则控制。

### 功能价值

这个阶段解决的是“模型能力好用，但不能越权”的问题。视觉模型适合看图抽取，文本模型适合把确认后的题干、学生答案和步骤整理成更像老师的分析；但学习系统的长期记忆不能交给模型自由决定。

对演示来说，这个拆分也更稳定：GLM 只做图片抽取，DeepSeek 只看用户确认后的文本。即使 DeepSeek 未配置、超时或返回非法 JSON，确认流程也会回退到本地规则报告，不影响 `sample_diagnosis` 和图片确认后的基本诊断闭环。

### 关键设计

关键模块包括：

- `src/lib/analysis-provider.ts`
- `src/lib/confirm-service.ts`
- `src/lib/image-diagnosis-pipeline.ts`
- `src/lib/anthropic-compatible-provider.ts`
- `src/lib/vision-extraction-parser.ts`

`AnalysisProvider` 只暴露 `analyzeConfirmedExtraction()`，输入是用户确认后的 `VisionExtractionDraft`，不接收图片 base64。它要求 DeepSeek 用 OpenAI-compatible `chat/completions` 和 JSON Output 返回受控 JSON。

DeepSeek 只能增强四类展示字段：

- `expected_diagnosis`
- `step_analysis`
- `solution_highlights`
- `standard_solution`

它不能输出或影响：

- `memory_delta`
- `student_profile`
- `mistake_history`
- `knowledge_mapping`
- `mistake_causes`
- `severity`

Pipeline 的顺序也故意保持保守：先用本地规则完成知识点映射、错因标签、严重度和 `memory_delta`，再把 DeepSeek 的增强结果覆盖到展示文本上。

如果确认 token 的 fingerprint 与提交草稿不匹配，后端会把本次诊断强制降级为不写画像，并跳过 DeepSeek 文本增强。这样既避免把不匹配草稿继续发给外部模型，也避免为不可持久化结果消耗额外 provider 配额。

### 技术决策与取舍

我没有把 DeepSeek 复用到 `VISION_PROVIDER_*`，而是新增 `ANALYSIS_PROVIDER_*`。这是为了让模型职责在配置层就清楚：`VISION_PROVIDER_*` 是“看图抽取”，`ANALYSIS_PROVIDER_*` 是“确认后文本分析”。这样以后更换视觉模型或文本模型时，不会把两类能力混在一起。

Kimi Code 的本地调查也影响了这个决策。它在 text-only 和小图片 smoke test 里可以通，但真实数学图片 OCR 路径响应较慢，曾触发 60 秒超时。这个结论不是“Kimi 不行”，而是“当前这条真实图片抽取链路不适合作为 3-5 分钟 Demo 的主路径”。所以我保留 provider timeout、`provider_debug` 和样例题稳定路径，把模型选择变成可替换配置，而不是让演示依赖某个 provider 当天的表现。

接 GLM 时，最大的坑不是业务逻辑，而是 provider 协议细节。GLM 走 OpenAI-compatible `chat/completions`，但这一路图片字段需要裸 base64，而不是默认 data URL。于是我把 `VISION_PROVIDER_IMAGE_FORMAT=base64` 做成配置，而不是把 GLM 特例写死在 route 里。

模型配置收口时，我又补了一层边界：确认 token 的 HMAC secret 不能回退到 provider API Key。否则本地从 MiMo/Kimi 切到 GLM 时，用户已经拿到但还没确认的 `confirmation_token` 会因为签名 secret 变化而失效。现在生产环境必须配置 `MATHTRACE_CONFIRM_SECRET`，开发环境未配置时使用稳定 demo secret，模型 key 只服务模型调用，不再承担确认状态签名职责。

DeepSeek 这边也做了小的配置容错：`ANALYSIS_PROVIDER_BASE_URL` 既可以写 provider 根地址，也可以直接写完整 `/chat/completions` endpoint。这个不是为了“支持更多框架”，而是降低频繁换模型时的操作认知成本，避免把 `.../chat/completions/chat/completions` 这种低级配置错误变成难排查的 provider 失败。

公式渲染也有一个重要经验：前端不能无限猜裸公式。更可靠的策略是把约束前移到 prompt 和模型输出格式：视觉模型抽取题干、学生答案和学生步骤时要尽量用 LaTeX 包裹数学表达式；确认后的 text analysis provider 生成 `standard_solution` 时也必须用 `$...$` 或 `$$...$$` 包裹数学公式。前端 KaTeX 做渲染和有限兜底，但不承担完整数学解析器职责。

这次清理还调整了标准解法来源：过渡期标准解法字段已从内部 schema、确认 payload、确认指纹和前端预览中删除，视觉模型只负责 OCR/结构化抽取。DeepSeek 在 `/api/confirm` 后根据用户确认的题干、学生答案和步骤独立生成最终 `standard_solution`。这样把“看图”和“解题”拆成两个模型职责，减少视觉模型编造或截断标准解法的风险。

标准解法编号也做了调整。最初强行给每行加序号，看起来规整，但数学证明文本里原本的 `(1)`、`②` 可能是逻辑引用。后来改成只迁移原文已有编号到左侧 marker，普通段落不硬加编号，避免 UI 改变原答案逻辑。

真实模型输出还暴露了一个更细的展示层问题：DeepSeek/vision provider 有时会把 Markdown 和 LaTeX 半成品混进标准解法，例如 `即$\ln a` 这种未闭合公式、`**(1)**` 这种 Markdown 加粗编号，或行首 `- 当...` 的列表前缀。我没有引入完整 Markdown 渲染器，也没有把这些清洗写进画像或诊断数据层，而是只在 `createStandardSolutionDisplayText()` 和 `createStandardSolutionBlocks()` 做窄规范化：去掉孤立公式起始符、清理 Markdown 加粗符号和列表符号，同时保留 `(1)`、`(2)` 这类题目原有编号。这样能修复演示中的脏格式，又不会改变 API 原始输出和长期画像语义。

### 性能收益（如适用）

这个阶段的性能收益主要是减少不必要的模型耦合和失败等待。图片抽取、用户确认、文本增强被拆开后，DeepSeek 不会参与图片上传路径，也不处理 base64；它只在用户确认后处理较短文本。DeepSeek 失败也不阻塞确认流程，避免一次增强模型波动拖垮整个 Demo。

图片侧继续使用约 600KB 客户端压缩和 1MB 后端上限，减少 GLM/Kimi/MiMo 请求 payload。文本侧使用 JSON Output 和字段白名单，减少后续 parser 猜测成本。

### 面试官可能怎么问

1. 为什么不用一个模型直接完成识别、分析和画像更新？
2. 为什么 DeepSeek 不放进 `VISION_PROVIDER_*`？
3. Kimi Code 测出来慢，你怎么处理这个发现？
4. GLM 接入时为什么要单独配置 `VISION_PROVIDER_IMAGE_FORMAT=base64`？
5. 公式渲染为什么不完全靠前端正则修？
6. 为什么不能给标准解法强行加统一编号？
7. DeepSeek 如果输出 `memory_delta` 怎么办？
8. DeepSeek 增强失败时用户会看到什么？
9. 为什么确认 token 的 secret 不能复用模型 API Key？
10. 为什么只修 analysis URL 容错，没有顺手支持 Anthropic analysis？

### 推荐回答

我会这样回答：

我没有把这个系统做成“一个模型说了算”，因为这是学习画像产品，不是一次性聊天回答。视觉模型负责看图，文本模型负责把确认后的内容表达得更清楚，但长期画像和 `memory_delta` 仍然由确定性代码生成。

DeepSeek 没有放进 `VISION_PROVIDER_*`，是因为它在这个阶段不是视觉抽取 provider。它只看用户确认后的文本，所以我用 `ANALYSIS_PROVIDER_*` 单独配置。配置层分清职责，比在业务代码里靠注释提醒更可靠。

Kimi Code 的调查也说明了为什么要做 provider 边界。它不是完全不可用，text-only 和小图片 smoke 可以通，但真实数学图片识别在当前链路里太慢，不适合做 Demo 主路径。所以我没有硬编码某个厂商，而是把超时、错误可观测性和 provider 切换都做出来。

GLM 的接入体现了 adapter 的价值。OpenAI-compatible 不代表每个 provider 的图片字段都完全一样，GLM 这里需要 raw base64，所以我用 `VISION_PROVIDER_IMAGE_FORMAT` 表达协议差异，而不是把 GLM 特例塞进 route。

公式和编号这两个 UI 问题，本质上都是“不让展示层篡改数学语义”。公式应该尽量在模型输出阶段就用 `$...$` 规范起来，前端只做 KaTeX 渲染和有限兜底。编号也是一样，不能为了排版好看强行给每句话编号，因为原文的 `(1)`、`②` 可能是证明结构的一部分。

后来处理 Markdown/LaTeX 残留时，我也沿用了这个原则。比如 `**(1)**` 不能直接原样展示，但也不能把 `(1)` 这个题号删掉；正确做法是只移除 Markdown 的 `**`，保留数学解答里的结构编号。未闭合的 `$\ln a` 也类似，前端只做展示层兜底，把孤立 `$` 清掉后交给已有 loose math 逻辑包成合法公式，不让这类格式脏数据进入画像或诊断判断。

如果 DeepSeek 输出 `memory_delta`、`student_profile` 或 `mistake_history`，parser 会拒绝这次增强结果，确认流程回退到本地规则报告。这样即使模型不稳定，也不会污染长期画像。

确认 token 的 secret 也要独立。API Key 是模型调用凭据，经常会因为切换 GLM、Kimi、MiMo 或 DeepSeek 而变化；确认 token 是用户流程状态，应该在一次上传、识别、确认之间保持稳定。如果把两者绑在一起，切模型会让还没确认的草稿突然验签失败，这是很隐蔽的演示风险。

我没有顺手把 analysis provider 也扩成 Anthropic-compatible，因为当前真实需求是 DeepSeek OpenAI-compatible。为了架构对称去加一个没有在用的协议，会扩大测试矩阵和维护面。这里更好的取舍是先把切模型时真的会踩的坑修掉，把未来可能要做的 Anthropic analysis 留到有真实 provider 需求时再做。

我还让 token fingerprint 不匹配的草稿跳过 DeepSeek。因为这种情况通常意味着用户大幅改写了识别结果，当前无状态版本无法审计编辑来源；让它只生成本地 non-persist 报告更稳，也减少把不匹配文本发给外部模型的机会。

### 可能被继续追问

- DeepSeek 增强后的文本如果数学上有错，怎么发现？
- 是否需要把 DeepSeek 增强前后的版本都保存？
- 未来数据库版本如何审计用户确认和模型增强？
- `ANALYSIS_PROVIDER_*` 是否也需要 provider_debug？
- 是否应该把 parser 迁移到 Zod 或 JSON Schema？
- 图片抽取和文本增强能否并行？

### 反思与后续优化

当前方案仍是 P1 Demo 级别：没有数据库审计，也没有保存增强前后的诊断版本。它适合证明“双模型分工 + 人类确认 + 本地画像规则”的架构边界，但还不是生产级长期记忆系统。

后续如果引入数据库，可以保存 `image_extraction_drafts`、`confirmed_extractions`、`analysis_enhancements` 和最终 `memory_deltas`。这样既能回放模型输出，也能解释某次画像变化为什么发生。

另一个优化是给 text analysis provider 增加安全 debug 元数据，但仍然不能暴露完整题干、学生答案、原始响应或 API Key。它可以记录 provider 名、阶段、失败类型和 HTTP 状态，帮助排查但不扩大隐私面。

### 项目中的真实证据

- 代码：
  - `src/lib/analysis-provider.ts`
  - `src/lib/confirm-service.ts`
  - `src/lib/image-diagnosis-pipeline.ts`
  - `src/lib/anthropic-compatible-provider.ts`
  - `src/lib/vision-extraction-parser.ts`
  - `src/lib/diagnosis-view-model.ts`
- 测试：
  - `scripts/analysis-provider.test.mjs`
  - `scripts/image-confirmation.test.mjs`
  - `scripts/image-diagnosis-pipeline.test.mjs`
  - `scripts/anthropic-compatible-provider.test.mjs`
  - `scripts/diagnosis-view-model.test.mjs`
- 文档：
  - `README.md`
  - `docs/superpowers/plans/2026-06-05-deepseek-analysis-provider.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
- 验证：
  - `node scripts/analysis-provider.test.mjs`
  - `node scripts/image-confirmation.test.mjs`
  - `node scripts/image-diagnosis-pipeline.test.mjs`
  - `npm test`
  - `npm run lint`
  - `npm run build`

---

## 11. 可信诊断降级、快速追问与 eval harness

### 当前状态

已完成 P1.5 本地实现和脚本验证。图片确认后会先评估学生作答证据，只有学生步骤充分或用户确认追问分析后才写具体错因；题干-only 路径会进入快速追问或只记录题型/考点关注。

### 功能价值

这个阶段解决的是 AI 教育产品里很危险的一个问题：模型只看到了题目，却假装知道学生为什么错。现在系统会承认“不知道”，先给出题型、考点、常见卡点和标准解法摘要，再问学生主要卡在哪里。用户跳过时只轻微下调相关考点掌握度，不写具体错因；用户回答后也要先看到分析草稿，再确认写入画像。

### 关键设计

核心设计是把“题目风险”和“学生错因证据”拆开。`assessExtractionEvidence()` 输出 `student_work_sufficient`、`problem_only` 或 `insufficient`；`persistence_evidence` 记录写入依据来自学生步骤、用户确认、题目-only 上传或没有证据；`profile_update_kind` 区分 `mistake_cause` 和 `problem_type_focus`。

`/api/confirm` 不新增接口，而是通过 `confirmation_action` 表达四种动作：默认正常诊断、跳过追问、提交卡点生成草稿、确认卡点分析。模型和前端仍不能直接写 `memory_delta`、`student_profile` 或 `mistake_history`，这些字段继续由本地规则生成。

### 技术决策与取舍

我没有引入数据库、RAG、LangGraph 或新的 Agent SDK，因为这个阶段的问题不是“让 Agent 更聪明”，而是“让写入边界更可信”。也没有改 localStorage 的 `StudentProfile` schema，`problem_type_focus` 先落在现有 `MemoryDelta.knowledge_mastery_changes` 和 `review_priority_changes` 上，降低迁移成本。

一个重要取舍是：跳过追问仍会对相关知识点做固定 `-2` 的轻微掌握度下调。这样比完全不记录更有学习价值，但它不增加 `frequent_mistake_causes`，避免把题目常见易错点误当成学生真实错因。

### 性能收益

P1.5 主要收益是稳定性和回归效率。`problem_only` 追问路径不额外调用模型；DeepSeek/text analysis provider 只在正常确认路径增强展示文本，不参与追问写入策略。新增 `npm run test:eval` 用 fixture 在本地快速验证证据策略，比每次手动上传图片更快，也更能证明“不会污染画像”。

### 面试官可能怎么问

1. 你怎么判断什么时候可以写学生具体错因？
2. 为什么只有题干时不能直接写错因？
3. 用户跳过追问为什么还要降低掌握度？
4. 为什么不新增 `problem_type_focus` 字段到学生画像？
5. `submit_stuck_point` 和 `confirm_stuck_point_analysis` 为什么分开？
6. 如果模型夹带 `memory_delta` 怎么办？
7. eval harness 具体防了什么回归？
8. 这个方案离生产级还差什么？

### 推荐回答

我把写入长期画像的依据显式建模了，而不是让模型输出直接决定。学生步骤清晰时，具体错因来自学生作答证据；只有题干时，系统最多知道这道题属于什么题型、涉及哪些考点、常见卡点是什么，所以只能进入追问或记录考点关注。

用户跳过追问时，我允许系统轻微下调相关知识点掌握度，因为上传错题本身说明这个考点值得复习，但我不增加具体错因次数。用户选择或输入卡点后，也不是马上写入，而是先生成分析草稿，用户确认后才用 `user_confirmed` 写入 `mistake_cause`。

### 可能被继续追问

- `-2` 这个掌握度变化以后怎么校准？
- 如果用户乱点卡点，系统怎么避免错误写入？
- 数据库版本如何审计每次 `persistence_evidence`？
- 未来引入 RAG 后，题目风险和学生证据怎么继续分离？

### 反思与后续优化

当前方案仍是 Demo 级可信写入边界，没有真实数据库审计，也没有保存每次追问草稿版本。后续如果引入数据库，应保存 `persistence_evidence`、`profile_update_kind`、用户确认动作和最终 `memory_delta`，这样才能回放每一次画像变化的证据链。

### 项目中的真实证据

- 代码：
  - `src/lib/diagnosis-evidence.ts`
  - `src/lib/confirm-service.ts`
  - `src/lib/image-diagnosis-pipeline.ts`
  - `src/lib/diagnose-client.ts`
  - `src/lib/diagnosis-view-model.ts`
  - `src/components/mathtrace-workbench.tsx`
- 测试：
  - `scripts/diagnosis-evidence.test.mjs`
  - `scripts/image-diagnosis-pipeline.test.mjs`
  - `scripts/image-confirmation.test.mjs`
  - `scripts/diagnose-client.test.mjs`
  - `scripts/diagnosis-view-model.test.mjs`
  - `scripts/eval-harness.test.mjs`
  - `scripts/fixtures/eval/p15-trusted-diagnosis-cases.mjs`
- 文档：
  - `docs/superpowers/plans/2026-06-10-p15-trusted-diagnosis-fallback.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
- 验证：
  - `npm test`
  - `npm run test:eval`
  - `npm run lint`
  - `npm run build`

---

## 12. Demo smoke 稳定性收口

### 当前状态

已完成 P1.6a 本地实现和脚本验证。这个阶段不新增用户功能，而是把样例题主路径、图片识别草稿、`/api/confirm`、低证据追问动作和标准解法展示清洗固化为可复现 smoke。

### 功能价值

P1.5 之后，项目最需要的不是马上堆新功能，而是防止后续错题本、RAG 或知识库扩展破坏现有演示闭环。P1.6a 让项目从“能跑一次”变成“每次合并前都能快速知道核心 Demo 有没有坏”。

### 关键设计

新增 `npm run test:smoke`，由两个脚本组成：`scripts/api-smoke.test.mjs` 覆盖 `/api/diagnose`、`/api/confirm`、图片识别草稿和确认主路径；`scripts/demo-smoke.test.mjs` 覆盖样例题、`problem_only` 追问、跳过、提交草稿、确认写入和标准解法显示残留。

浏览器层没有引入新的测试框架，而是新增 `docs/demo-smoke-checklist.md`，用于演示前人工核对首页、样例题、未配置 provider 错误态和公式展示。低证据追问的细节用 smoke/eval 自动化覆盖，避免为了 Demo 稳定性引入 fake provider UI 开关。

### 技术决策与取舍

我没有立刻引入 Playwright，因为当前最容易回归的是服务契约、画像写入边界和展示文本清洗，Node 脚本能用更低成本覆盖。真实 provider 也没有纳入 smoke，因为它会把稳定性绑定到外部模型、API Key 和网络状态上；这一阶段只验证本地可控契约。

实现过程中 smoke 暴露了一个小的展示层缺口：已闭合的 inline math 如果紧贴中文，例如 `即$\ln a<0$`，会保留贴边显示风险。最终只在 `createStandardSolutionDisplayText()` 中补了公式前边界空格，并用 `scripts/diagnosis-view-model.test.mjs` 固化回归。

### 性能收益

收益主要是回归效率和演示稳定性。`npm run test:smoke` 不依赖 API Key、网络或 dev server，就能快速验证核心演示路径；相比每次手动上传图片、等待真实模型返回，它更快、更稳定，也更适合作为后续功能扩展前的基础护栏。

### 面试官可能怎么问

1. 为什么先做 smoke，而不是继续做新功能？
2. smoke 和 eval harness 有什么区别？
3. 为什么不直接上 Playwright？
4. 为什么 smoke 不接真实 provider？
5. 这些测试怎么防止模型污染画像？
6. 未来做 RAG 后这层 smoke 还有用吗？

### 推荐回答

P1.5 做完后，系统的关键风险已经不是“缺一个功能”，而是后续功能很容易改坏证据边界和演示路径。所以我先补了 smoke guard：eval 继续验证策略细节，smoke 验证 Demo 主路径和 API contract 能不能跑通。

我暂时没有引入 Playwright，因为这会增加依赖和维护成本。当前阶段先用 Node 脚本锁 API contract、service contract 和展示文本，再用手动 checklist 做浏览器视觉确认。等 UI 状态和真实图片流程进一步稳定，再把 checklist 升级成 Playwright E2E 会更划算。

### 可能被继续追问

- 如果未来引入数据库，smoke 怎么覆盖写入回放？
- 如果接入真实 provider，如何设计不脆弱的模型 smoke？
- `npm test` 越来越长时，如何拆分本地和 CI 测试层级？
- 为什么展示层修复放在 P1.6a，而不是单独开 bugfix？

### 反思与后续优化

当前 smoke 仍是本地脚本级和人工浏览器 checklist，没有 CI，也没有真实 provider 的可观测 smoke。后续可以在错题本和 RAG 前后继续扩展 fixture，并在引入 CI 时把 `npm run test:smoke` 作为合并前必跑命令。

### 项目中的真实证据

- 代码：
  - `scripts/api-smoke.test.mjs`
  - `scripts/demo-smoke.test.mjs`
  - `src/lib/diagnosis-view-model.ts`
- 测试：
  - `scripts/diagnosis-view-model.test.mjs`
- 文档：
  - `docs/demo-smoke-checklist.md`
  - `docs/superpowers/plans/2026-06-10-p16-demo-smoke-stability.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
- 验证：
  - `npm run test:smoke`
  - `npm test`
  - `npm run test:eval`
  - `npm run lint`
  - `npm run build`

---

## 13. Supabase Postgres 数据底座与错题本 MVP

### 当前状态

P1.7 代码已完成、已通过本地 Claude Code 审查、已合并并推送到 `main`。这一阶段把确认后的诊断结果从纯前端 demo 状态推进到 Supabase Postgres 数据底座：诊断确认后写入 `diagnosis_runs`、`mistake_book_items` 和 `memory_events`，前端通过 Next API 展示错题本并支持二次确认删除，`sample_diagnosis` 作为 demo 自动确认路径也会写。

真实 Supabase 项目已经走通基础建库和环境变量配置；新增的去重与删除 migration `supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql` 仍需要在 Supabase SQL Editor 中应用后，线上数据库才具备 `question_fingerprint` 唯一约束、重复题返回 `duplicate`、错题删除权限和级联删除能力。

同时，这一阶段仍固定 `demo_student_001`，不做登录、真实 RLS 用户策略、老师端、RAG、pgvector、对象存储或完整学生画像迁移。未配置 Supabase 时，demo 仍要能跑，错题本为空，诊断主流程不能因为数据库缺失失败。

### 功能价值

数据库是这个项目的面试高频问题，因为 MathTrace 的核心卖点是“越用越懂你”。如果没有真实数据底座，长期画像、错题复盘、复发判断和复习计划依据都只能停留在 demo 表达。P1.7 的价值是把“长期记忆”从浏览器 localStorage 的演示状态，推进到可审计、可查询、可解释的后端记录。

我没有一上来做完整账号系统，而是先做最小数据闭环：一次诊断确认后，系统保存诊断运行、错题本条目和画像变化事件。这样面试时可以清楚说明：项目已经从单次 AI 报告进入“学习数据沉淀”的阶段，但仍然有意识地控制范围，不把登录、老师端和 RAG 混进同一次实现。

### 关键设计

P1.7 的数据库表保持很少：

- `students`：当前只固定 `demo_student_001`，作为 demo 学生外键。
- `diagnosis_runs`：保存一次诊断运行的结构化快照，包括来源、证据等级、`memory_delta`、知识点、错因、练习和复习计划。
- `mistake_book_items`：保存错题本条目，服务前端最近错题展示、题目级去重和删除。
- `memory_events`：保存画像变化事件，记录掌握度变化、错因频次变化、复习优先级变化和 rationale。

更细一点说，当前 Postgres 存的是“诊断事实”和“画像变化事件”，不是完整用户系统：

- `students` 存 demo 学生的 `id`、`display_name`、`grade`、`subject`、创建和更新时间；当前约束只允许 `demo_student_001` 和 `math` 学科。
- `diagnosis_runs` 存一次 Agent 运行的完整审计快照：`client_diagnosis_id`、`source`、证据策略字段、`recognized_question`、`knowledge_mapping`、`mistake_diagnosis`、`memory_delta`、`student_profile_snapshot`、`practice_questions`、`review_plan` 和 `warnings`。这张表回答“这次诊断到底发生了什么”。
- `mistake_book_items` 存前端错题本真正展示和删除的条目：题干、学生答案、标准解法、知识点、错因、严重度、诊断摘要、证据字段、`review_status` 和 `question_fingerprint`。这张表回答“学生错题本里现在有哪些题”。
- `memory_events` 存画像变化的原因：完整 `memory_delta`、知识点掌握度变化、错因次数变化、复习优先级变化、是否复发、rationale 和证据字段。它回答“为什么学生画像发生了这次变化”。

写入只发生在确认后的服务端路径。`sample_diagnosis` 是稳定 demo 自动确认路径；图片诊断必须经过 `/api/confirm`，并且由服务端证据策略判断 `memory_delta.should_persist=true` 后才写。`image_diagnosis` 的识别草稿、未确认内容和完整图片 base64 不进入数据库。

前端不直连数据库，也不持有 Supabase service role key。浏览器只能调用 Next API，例如错题本读取和删除接口；真正的 Supabase admin client 只在服务端读取 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。

错题本去重使用 `student_id + question_fingerprint`。重复确认同一道题时，系统保留旧错题，不新增错题条目，也不新增 `memory_events`，前端提示“本题已加入错题本”，并且不重复写入 localStorage demo 画像。删除则只删除 `mistake_book_items` 及其级联的 `memory_events`，保留 `diagnosis_runs` 作为审计记录，避免把“曾经做过这次诊断”的事实抹掉。

重复题的实现不是靠前端字符串比较，而是分三层兜底：

1. 服务端根据确认后的 `question_text` 生成 `question_fingerprint`。当前归一化策略是保守的：去掉中文标点和空白，做 `NFKC` normalize，但保留半角小数点、逗号、冒号等可能影响数学语义的符号，避免把 `1.5` 和 `15`、`x=1,2` 和 `x=12` 误判成同一道题。
2. 数据库在 `mistake_book_items(student_id, question_fingerprint)` 上加唯一索引。这样即使两次请求很接近，最终也由 Postgres 约束保证同一个学生不会插入两条相同 fingerprint 的错题。
3. RPC `persist_mathtrace_diagnosis` 先保存或复用 `diagnosis_runs`，再检查是否已有相同 fingerprint 的错题。已有时返回 `persistence_status='duplicate'` 和 `memory_event_id=null`，不插入新的 `mistake_book_items` 或 `memory_events`；没有时才插入错题和画像事件。

这个设计还有两个细节：第一，重复题仍可保留 `diagnosis_runs` 审计记录，因为用户确实发起过一次诊断；第二，如果用户删除了错题本条目，之后又确认同一道题，RPC 会在发现 `diagnosis_runs` 已存在但错题 item 已不存在时继续重新插入错题和新的 `memory_events`，不会被旧的 run 卡住。前端只根据服务端返回的 duplicate warning 显示“本题已加入错题本”，并跳过本地 demo 画像写入，避免数据库没有新增 event、localStorage 却偷偷更新的状态分裂。

一次诊断写入数据库的步骤是：

1. 用户走 `sample_diagnosis`，或图片识别后通过 `/api/confirm` 确认草稿。
2. 后端跑确定性 pipeline，生成 `recognized_question`、`knowledge_mapping`、`mistake_diagnosis`、`memory_delta`、练习和复习计划。
3. `persistDiagnosisIfNeeded` 先检查响应是否包含 `memory_delta` 和 `student_profile`，再检查 `memory_delta.should_persist`、`persistence_evidence` 和 `profile_update_kind` 是否允许持久化。
4. 服务端根据题干生成 `question_fingerprint`，用于识别同一个学生重复加入同一道题。
5. 服务端调用 Supabase RPC `persist_mathtrace_diagnosis`，由数据库函数统一执行写入策略。
6. 数据库先 upsert `students`，确保 demo 学生存在。
7. 数据库插入或复用 `diagnosis_runs`。同一个 `student_id + client_diagnosis_id` 不重复插入，保留一次诊断审计记录。
8. 数据库用 `student_id + question_fingerprint` 检查错题是否重复。重复时返回 `duplicate`，不新增 `mistake_book_items` 和 `memory_events`。
9. 非重复时插入 `mistake_book_items`，让前端错题本可以展示这道题。
10. 数据库插入 `memory_events`，记录这次画像变化的依据。删除错题本条目时，这条事件会随错题级联删除。
11. 如果 Supabase 没配置，服务端返回“数据库暂未配置” warning；如果写入失败，返回“错题本写入失败” warning。两种情况都不让诊断主流程失败。

真实接入 Supabase 的落地步骤可以这样讲：

1. 在 Supabase dashboard 新建组织和项目，区域选择离演示网络更近的位置；这只决定数据库物理位置和访问延迟，不改变代码结构。
2. 在 SQL Editor 先执行基础 migration `20260611000000_p17_mistake_book.sql`，创建 `students`、`diagnosis_runs`、`mistake_book_items` 和 `memory_events`，以及初版 `persist_mathtrace_diagnosis` RPC。
3. 因为项目创建时权限默认更保守，补充执行 service role grant，让服务端 admin client 能对 P1.7 所需表执行 select、insert、update。
4. 在 Project Settings / API Keys 中只复制 `Project URL` 和 `secret/service role` key 到本地 `.env.local`，不把 key 写入代码、日志或文档。浏览器端不配置 Supabase key。
5. 重启 Next dev server，让服务端读取新的 `SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY`。
6. 回到 MathTrace 页面跑一次样例诊断或确认后的图片诊断，确认诊断报告不受影响，同时“最近错题”能从数据库读到新条目。
7. 再执行新增 migration `20260611001000_p17_mistake_book_dedupe_delete.sql`，补上 `question_fingerprint`、唯一索引、去重 RPC 分支和删除权限。
8. 重新验证重复确认同一道题：前端提示“本题已加入错题本”，数据库不新增第二条 `mistake_book_items`，也不新增 `memory_events`。
9. 验证删除：前端点击删除按钮，二次确认后调用服务端 `DELETE /api/mistake-book`；数据库删除对应错题条目和级联的 `memory_events`，但保留 `diagnosis_runs`。
10. 如果 migration 因历史重复数据 fail fast，先查看 `mistake_book_item_dedupe_candidates` 候选报告，人工确认后处理重复数据，再重新应用 migration；不要让 migration 静默删除学习记录。

错题本读取和删除也保持服务端收口：

1. 前端请求 `/api/mistake-book?student_id=demo_student_001&limit=...`。
2. 服务端只从 `mistake_book_items` 选择展示所需字段，不把完整 `diagnosis_runs` 快照直接暴露给浏览器。
3. 前端删除错题时调用 `/api/mistake-book` 的 `DELETE`，只传 `student_id` 和 `item_id`。
4. 服务端验证 `student_id` 固定为 `demo_student_001`，`item_id` 必须是 uuid，再用 service role 在后端执行删除。
5. 数据库删除 `mistake_book_items` 后，相关 `memory_events` 通过外键级联删除；`diagnosis_runs` 保留，作为“这次诊断曾发生过”的审计证据。

P1.7 当时没有存的内容也要说清楚：不存完整图片 base64，不存图片文件，不存真实用户账号，不存完整云端 `student_profiles` 聚合表，不存 `practice_attempts`，也没有 `pgvector` 或 Milvus 向量记忆。localStorage 暂时仍负责 demo 学生画像恢复；Postgres 负责可审计的诊断运行、错题本条目和画像事件。P1.8 后续补的是一个小型当前画像 read model，不改变 P1.7 的事件审计边界。

### 技术决策与取舍

我选择 PostgreSQL/Supabase，是因为这个项目的数据不是一堆聊天文本，而是结构化学习记录：学生、诊断运行、错题条目、画像事件之间有清晰关系，需要外键、一致性和 SQL 约束。PostgreSQL 的 JSONB 又适合保存诊断快照、`memory_delta`、练习和复习计划这类半结构化数据；未来要做相似错题召回或 RAG 时，也可以沿着 pgvector 演进。

Supabase 的价值是快速提供托管 Postgres、RLS、Auth、API 管理和后续 Storage 生态。对一个求职展示项目来说，它让我不用先搭一整套数据库运维和认证基础设施，就能展示真实后端数据建模能力。

我没有选 MySQL，并不是因为 MySQL 不行。MySQL 做关系型业务数据完全可以，但这个项目后续很可能需要 JSONB、pgvector、RLS 和 Supabase 托管生态，Postgres 更贴合演进路线。当前阶段也避免引入 ORM 和复杂多租户，因为这会把重点从“诊断数据如何沉淀”转移到框架和权限系统本身。

`memory_events` 独立成表是一个关键取舍。我不只保存最新画像分数，而是保存每次画像变化的原因。这样后续 Agent 或老师端不仅能看到“这个学生导数掌握度变低了”，还能追溯“是哪一次诊断、什么错因、什么证据导致这次变化”。这对教育产品尤其重要，因为画像变化必须可解释、可回放、可纠错。

去重和删除的取舍也很关键。我没有让前端自己判断重复题，因为浏览器看到的是展示文本，无法作为数据一致性的兜底；服务端计算 fingerprint，数据库用唯一索引兜底。迁移历史数据时也不静默删除重复错题，而是先生成候选重复报告并 fail fast。对学习数据来说，误删比多一条重复记录更难恢复。

### 性能收益（如适用）

P1.7 的主要收益不是响应速度，而是稳定性和数据可追溯性。数据库未配置时走 no-op 或空列表，诊断主流程不被外部数据库阻塞；配置数据库时，写入集中在确认后的服务端路径，前端不需要额外持有数据库连接或密钥。后续 review fix 还把重复错题提示抽成 browser-safe 共享常量，避免服务端 warning 和前端 localStorage 写入判断发生文案漂移。

相比把完整学生画像每次整体覆盖到云端，当前只先保存 diagnosis run、mistake book item 和 memory event，可以降低早期迁移复杂度，也避免在没有登录和 RLS 用户策略前过早承诺完整多设备画像同步。

### 面试官可能怎么问

1. 这个项目为什么现在需要数据库？
2. 为什么选 PostgreSQL/Supabase，而不是 MySQL？
3. 你为什么没有直接做完整登录和多用户权限？
4. service role key 为什么不能放在前端？
5. `diagnosis_runs`、`mistake_book_items` 和 `memory_events` 为什么要拆表？
6. `memory_events` 和 `memory_delta` 的关系是什么？
7. Supabase 未配置时为什么不能让诊断失败？
8. 为什么重复题不新增 `memory_events`？
9. 删除错题为什么保留 `diagnosis_runs`？
10. 未来怎么从错题本 MVP 演进到 RAG 或老师端？

### 推荐回答

我会这样回答：

数据库对这个项目很关键，因为 MathTrace 不是一次性解题工具，它要证明长期学习画像和错题复盘。如果所有状态都只在 localStorage 里，面试官会追问“长期记忆到底在哪里”。所以 P1.7 我先引入 Supabase Postgres，把确认后的诊断运行、错题条目和画像变化事件沉淀下来。

我选 Postgres/Supabase，不是因为 MySQL 做不了，而是因为这个项目后续路径更贴近 Postgres：诊断快照适合 JSONB，未来相似错题和 RAG 可以用 pgvector，Supabase 又提供托管 Postgres、RLS、Auth 和 API 管理。当前阶段我没有引入 ORM，也没有做复杂多租户，因为 demo 还固定 `demo_student_001`，过早做完整账号系统会扩大风险。

我特别把 service role key 限制在服务端。前端如果直接连 Supabase admin client，就等于把数据库高权限凭据暴露给浏览器，这是不可接受的。浏览器只能通过 Next API 请求错题本；服务端根据当前 demo 边界读取或写入数据库。

`memory_events` 独立出来，是因为学习画像不能只保存最后结果。教育系统需要解释“为什么这个学生画像变了”。每次诊断写一个 event，记录掌握度变化、错因变化、复习优先级变化和 rationale，后续 Agent、老师端或复习规划都能追溯依据。

错题本去重我放在服务端和数据库层做，而不是只靠前端提示。重复题再次确认时，我仍然保留 diagnosis run 作为审计，但不再新增错题条目和 memory event，因为这次操作没有带来新的学习证据。删除错题时，我让用户二次确认，并只删除错题条目及其关联画像事件，诊断运行仍然保留，便于以后解释“这次诊断曾经发生过”。

### 可能被继续追问

- 如果未来有真实学生账号，RLS 策略怎么设计？
- P1.8 的 `student_profiles` read model 未来怎么扩展成真实多用户画像？
- 如果数据库写入成功但前端刷新失败，错题本如何保持一致？
- `memory_events` 未来如何支持回滚或重建画像？
- 题目 fingerprint 会不会误判重复？如何控制误删风险？
- 删除错题后画像是否应该重算？
- pgvector 相似错题召回会基于哪些文本生成 embedding？
- service role key 滥用风险如何审计？

### 反思与后续优化

当前 P1.7 仍然是数据底座 MVP，不是生产级多用户系统。已知缺口包括：尚无真实登录，尚无面向用户的 RLS 策略，新增去重/删除 migration 仍需应用到 Supabase，尚未做 pgvector/RAG，错题本支持展示和删除但还不是完整复习工作流；完整云端画像迁移在 P1.7 当时仍留到后续。

后续更合理的演进是：先把 Supabase migration 在真实项目中 apply 并验证；再引入 Auth 和 RLS 用户策略；然后把 P1.8 的 demo 画像 read model 扩展成真实多用户画像；最后再做 pgvector 相似错题召回、RAG 和老师端授权视图。

### 项目中的真实证据

- 代码：
  - `src/lib/persistence/supabase-admin.ts`
  - `src/lib/persistence/diagnosis-persistence.ts`
  - `src/lib/mistake-book/mistake-book-service.ts`
  - `src/lib/mistake-book/mistake-book-client.ts`
  - `src/app/api/mistake-book/route.ts`
  - `src/components/mistake-book-panel.tsx`
  - `src/lib/shared/persistence-warnings.ts`
  - `src/lib/diagnosis/diagnose-service.ts`
  - `src/lib/diagnosis/confirm-service.ts`
  - `supabase/migrations/20260611000000_p17_mistake_book.sql`
  - `supabase/migrations/20260611001000_p17_mistake_book_dedupe_delete.sql`
- 测试：
  - `scripts/tests/persistence/diagnosis-persistence.test.mjs`
  - `scripts/tests/persistence/mistake-book-api.test.mjs`
  - `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - `scripts/tests/diagnosis/diagnosis-view-model.test.mjs`
  - `scripts/tests/smoke/api-smoke.test.mjs`
  - `scripts/tests/smoke/demo-smoke.test.mjs`
- 文档：
  - `README.md`
  - `docs/superpowers/plans/2026-06-11-p17-supabase-mistake-book.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/TECHNICAL_ROADMAP.md`
- 验证：
  - `npm test`
  - `npm run test:eval`
  - `npm run test:smoke`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`

---

## 14. P1.8 云端当前画像快照

### 当前状态

P1.8 已实现并完成文档收口。这个阶段新增 `student_profiles` 表，用来保存 `demo_student_001` 在 `math` 学科下的当前学生画像快照。它不是完整账号系统，也不是新的记忆事实源，而是从受控 `memory_events` 投影出来的 read model。

前端现在仍先从 localStorage 或 demo 默认画像恢复，保证页面立刻可用；随后通过 `GET /api/student-profile` best-effort 拉取云端画像。诊断成功持久化后、错题本删除成功后，服务端会尝试重新从 `memory_events` 同步 `student_profiles`。如果数据库未配置、读取失败或同步失败，系统只返回 warning 或 fallback，不破坏诊断、删除和 `sample_diagnosis` 稳定路径。

这个阶段的状态要诚实表达：P1.8 仍固定 `demo_student_001` 和 `math`，没有登录、真实多用户、老师端、面向用户的 RLS 策略、RAG、pgvector 或 Milvus；前端也不直连数据库，`SUPABASE_SERVICE_ROLE_KEY` 只允许服务端读取。localStorage 仍然只是 demo fallback，不代表完整云端学生画像。

### 功能价值

这个阶段解决的是“长期画像在哪里读”的问题。P1.7 已经把诊断事实、错题条目和画像变化事件沉淀到 Postgres，但工作台刷新时仍主要依赖 localStorage。P1.8 加上当前画像快照后，面试时可以更清楚地讲：历史证据保存在 `memory_events`，当前 UI 读取的画像来自 `student_profiles`，二者职责不同。

它也让项目从“有事件历史”推进到“可以云端恢复当前画像”，但仍保持黑客松 demo 的范围：固定 `demo_student_001`，不做登录、多用户、老师端、RAG、pgvector 或 Milvus。

从产品叙事上，这一步把“越用越懂你”从前端演示状态推进到服务端可恢复状态。P1.7 能回答“这次诊断和画像变化有没有被记录”；P1.8 进一步回答“下次打开工作台时，系统能不能读到当前聚合画像”。这对面试很重要，因为它把 Agent memory 讲成了可验证的数据流，而不是一句抽象口号。

### 关键设计

`student_profiles` 的来源不是模型输出，也不是前端上传的整包画像。服务端先读取 `memory_events`，只接受 `memory_delta.should_persist === true` 且字段通过校验的事件，再按 `created_at` 和 `id` 顺序把这些增量合并到 demo 初始画像上。投影结果还要通过 shared `StudentProfile` guard 校验，校验失败就不写快照，只返回“云端画像同步失败” warning。

这几张表的分工要讲清楚：

- `diagnosis_runs` 保存一次诊断运行的完整审计快照，回答“这次 Agent 运行发生了什么”。
- `mistake_book_items` 保存题目级错题本条目，回答“现在错题本里有哪些题”。
- `memory_events` 保存每次画像变化的原因和增量，回答“为什么画像会变”。
- `student_profiles` 保存当前画像快照，回答“工作台现在该展示哪份云端画像”。

前端读取边界也很窄：浏览器只 import browser-safe 的 `requestCloudStudentProfile()`，请求 `/api/student-profile?student_id=demo_student_001`；Supabase admin client 和 `SUPABASE_SERVICE_ROLE_KEY` 只在服务端 persistence 层使用。reset 画像时会递增 refresh id，避免旧的云端请求回来后覆盖用户刚重置的 demo 状态。

一次画像同步可以这样讲：

1. `/api/diagnose` 或 `/api/confirm` 先完成确定性诊断 pipeline。
2. `persistDiagnosisIfNeeded` 只在证据策略允许且 `memory_delta.should_persist=true` 时尝试持久化。
3. Supabase RPC 写入或复用 `diagnosis_runs`；如果判断为重复题，则返回 `duplicate`，不新增 `memory_events`，也不更新 `student_profiles`。
4. 服务端读取当前学生剩余的 `memory_events`，按 `created_at asc, id asc` 排序。
5. 从空历史 `demoStudentProfile` 起始，用 shared `applyMemoryDeltaToProfile` 逐条合并事件。
6. 合并结果必须通过 shared `isStudentProfile` guard；通过后才 upsert 到 `student_profiles`。
7. 删除错题本条目后，因为关联 `memory_events` 会级联删除，服务端也会基于剩余事件重新投影当前画像。
8. 未配置数据库、重复题、持久化失败或投影失败都不阻塞诊断报告，只返回 warning 或 fallback。

这个投影不变式是 P1.8 的核心：

```text
student_profiles.profile
  = fold(demoStudentProfile, current memory_events ordered by created_at asc, id asc)
```

后续我把内置 `demoStudentProfile` 从“预置薄弱学生”改成“空历史基线”。这样做不是改变诊断算法，而是让演示和面试更容易解释：页面上新增的知识点弱项、错因累计和复习优先级，都来自这次确认写入的错题证据，而不是系统提前塞进去的样例历史。这里有两个边界要讲清楚：第一，`mistakeHistory` 仍作为 demo 诊断上下文存在，但不再代表当前画像基线；第二，如果 Supabase 里已有 `demo_student_001` 的 `memory_events`，前端仍会读回云端画像，本地“重置画像”只清理 localStorage 和当前 session，不删除云端事件。

它故意不直接保存 pipeline 返回的 `response.student_profile`。原因是请求里的 `student_profile` 可能来自 localStorage，而 localStorage 可能包含数据库不可用期间、本地 demo 或旧版本留下的变化；如果直接写入云端快照，`student_profiles` 就可能无法被 `memory_events` 解释。

### 为什么这是 MathTrace 的记忆系统，而不是 RAG / 错题本 / localStorage

P1.8 里的“记忆”是结构化学习画像记忆，不是通用聊天记忆，也不是把历史文本丢进向量库。MathTrace 要记住的是：哪些知识点掌握度变化了、哪些错因重复出现了、复习优先级为什么变化、这些变化来自哪一次被确认的诊断证据。

所以它和几个容易混淆的概念要区分开：

- 它不是 RAG：RAG 解决“检索哪些相似题、教材 chunk 或历史材料给模型参考”，而 P1.8 解决“当前学生画像是什么，以及为什么变成这样”。相似内容召回以后可以用 pgvector 或 Milvus 做，但不能替代 `memory_events` 和 `student_profiles` 这套事实层。
- 它不是错题本本身：`mistake_book_items` 记录“有哪些错题”，`memory_events` 记录“这道错题怎样改变画像”，`student_profiles` 记录“当前画像聚合后是什么”。错题本是题目列表，画像记忆是学习状态。
- 它不是 localStorage：localStorage 只是 P0/P1 demo fallback，用来保证刷新和数据库未配置时页面可用；云端画像必须从服务端受控事件投影得到，前端不能把本地整包画像直接当事实上传覆盖。
- 它不是模型直接记忆：视觉模型和文本分析模型都只能做抽取或展示增强，不能直接决定 `memory_delta`、`student_profile` 或持久化策略。画像写入必须经过服务端证据门控、运行时校验和确定性合并规则。

面试里可以把它概括成一句话：MathTrace 的 Agent memory 不是“模型脑子里记住了学生”，而是“确认后的学习证据变成结构化事件，事件再投影成当前画像”。

### 技术决策与取舍

我没有把 `student_profiles` 做成完整用户画像系统，而是先做“当前快照”。原因是当前阶段还没有登录和真实 RLS 用户策略，如果直接承诺多用户云端画像，会把权限、数据隔离和迁移问题提前放大。现在这个 read model 只支持 `demo_student_001` 和 `math`，service role only，刚好覆盖演示和面试叙事需要。

我也没有用 pgvector、Milvus 或 RAG 来存画像。学生画像是结构化学习状态，应该由确定性规则从诊断证据合并出来；向量库适合后续召回相似错题，不能替代掌握度、错因次数、复习优先级这些结构化字段。

另一个取舍是保留 localStorage。云端画像是 best-effort 增强，不是页面启动的硬依赖。这样即使 Supabase 未配置或网络失败，demo 仍能立刻展示本地画像，`sample_diagnosis` 也不会被数据库状态拖垮。

我还没有在数据库 trigger 里实现画像合并。合并规则已经存在于 TypeScript shared helper，如果再用 SQL/PLpgSQL 写一套规则，很容易出现口径漂移。P1.8 仍是单学生 demo，服务端应用层重放事件足够简单，也更容易用现有 Node tests 覆盖。

事件 + 快照的组合是这阶段最重要的取舍：

- 只存事件：解释性最好，但每次页面读取都要重放历史，demo 阶段会增加读取和 fallback 复杂度。
- 只存快照：读取最快，但删除错题或追溯画像原因时缺少解释链。
- 事件 + 当前快照：正常读取 `student_profiles`，解释和重建依赖 `memory_events`，用一点写入时重放成本换来可解释和可恢复。

P1.8 选择第三种，因为教育场景里“为什么画像变了”比单纯读分数更重要。

### 参考资料与借鉴边界

P1.8 设计时参考了通用 Agent memory 系统，但只吸收原则，不声称项目集成了这些库或框架。

- Hermes Agent persistent memory docs：https://hermes-agent.nousresearch.com/docs/user-guide/features/memory

  借鉴点是 bounded curated memory、session start 注入冻结快照、写入审批和 persistent memory / session_search 分层的思想。对应到 MathTrace，就是 `student_profiles` 只保存当前关键画像，`memory_events` 保存可追溯变化历史，画像写入必须经过服务端证据门控。没有借鉴的是：MathTrace 不把学生画像写成 `MEMORY.md` / `USER.md`，也不做通用自然语言常驻记忆。

- Hermes Memory Providers docs：https://hermes-agent.nousresearch.com/docs/user-guide/features/memory-providers

  借鉴点是 external memory provider 作为 additive 增强，而不是替代内置事实层。对应到 MathTrace，未来 pgvector、Milvus 或知识图谱可以作为相似题、教材 chunk、跨会话建模的增强层，但当前结构化事实仍在 Postgres 的 `diagnosis_runs`、`memory_events` 和 `student_profiles`。没有借鉴的是：P1.8 不接 external memory provider，也不把检索层提前混进画像事实层。

- mem0 README：https://github.com/mem0ai/mem0

  借鉴点不是直接接入 mem0，而是它把长期记忆当成一层独立服务来处理：写入和检索分开，按 `user_id` / `session_id` / `agent_id` 等范围隔离记忆，并允许用 metadata filters 控制召回边界。对应到 MathTrace，当前所有画像记录先收口到固定 `demo_student_001`，后续真实用户阶段再扩展用户范围、权限过滤和多学生隔离；`memory_events` 负责 add-like 的事实写入，profile evidence API 负责 read/search-like 的安全摘要读取。

  mem0 近期的 v2 思路还强调 ADD-only extraction、entity resolution、向量/图/关键词等多信号检索和 temporal reasoning。MathTrace 只借鉴这些思想里的“写入门控、身份范围、长期记忆和检索增强分层”：学生画像事实仍由 Postgres 结构化表保存，当前画像仍从 `memory_events` 投影得到；未来如果引入 pgvector、知识图谱或 external memory provider，也只能作为相似题和历史上下文召回增强，不能替代 `diagnosis_runs` / `memory_events` / `student_profiles` 这层可审计事实来源。没有借鉴的是：项目没有集成 mem0，也没有实现 semantic/BM25/entity/temporal 的 hybrid retrieval；P1.8-P1.10 仍只做结构化画像投影和摘要 evidence。

- OpenClaw README/docs：https://github.com/openclaw/openclaw

  借鉴点是本地 workspace、session tools/history、skills、sandbox/remote exposure 的安全边界意识：上下文应该可检查，外部输入和远程能力必须有边界。对应到 MathTrace，就是前端不直连数据库，service role 只在服务端，模型输出视为不可信输入，历史事件和当前常驻画像分层。没有借鉴的是：MathTrace 不采用 OpenClaw 的通用自主 Agent 形态，也不把学习系统改造成通用工具型 agent workspace。

这些参考资料给 P1.8 的核心启发是：长期记忆要有分层、门控和可检查事实来源。MathTrace 的落地方式则必须贴合教育业务：结构化字段、证据链、服务端权限边界和可回放画像投影。

### 性能收益（如适用）

P1.8 的收益主要是读取稳定性和演示恢复速度，而不是数据库吞吐优化。页面启动时先用 localStorage / demo 画像渲染，再 best-effort 拉云端画像，避免首屏被数据库连接拖慢；云端合法画像存在时，读取 `student_profiles` 这个小快照即可，不需要前端每次加载都拉取和重放完整 `memory_events`。

写入路径上，诊断持久化或错题删除后会重放当前事件，这比直接覆盖快照多一次读取成本。但当前只有 `demo_student_001`，事件规模很小，这个成本换来的是删除后可重建、快照可解释、模型和前端不能越权写画像。对 P1.8 来说，这个取舍比微优化更有价值。

### 面试官可能怎么问

1. `student_profiles` 和 `memory_events` 有什么区别？
2. 为什么不直接每次覆盖云端 `student_profiles`，还要保留事件表？
3. 如果删除错题后画像要变，怎么保证当前画像同步？
4. 为什么前端不直接读 Supabase？
5. 这个方案是不是已经等于完整云端学生画像？
6. 为什么不用 Milvus 或 pgvector 存学生记忆？
7. localStorage 和云端画像同时存在，会不会冲突？
8. 为什么 P1.8 不先做 RAG？
9. 为什么不能让模型直接记住学生画像？
10. 为什么说这是 Agent memory，而不是普通数据库缓存？
11. 如果未来接入真实用户，当前设计要补哪些能力？
12. 为什么 `student_profiles.profile` 不直接保存诊断响应里的 `student_profile`？

### 推荐回答

我会这样回答：

P1.8 里我把“事件历史”和“当前画像”拆开了。`memory_events` 是事实历史，记录每次画像变化的原因、证据和增量；`student_profiles` 是从这些事件投影出来的当前快照，主要服务工作台读取和 demo 恢复。这样既能快速读当前画像，也不会丢掉“为什么变成这样”的审计链。

我没有让模型或前端直接写 `student_profiles`。诊断 pipeline 先生成受控 `memory_delta`，持久化成功后服务端从 `memory_events` 重建画像，再用 shared `StudentProfile` guard 校验后 upsert。删除错题后，因为对应的 `memory_events` 会变化，服务端也会重新同步快照。

前端只能通过 `/api/student-profile` 读画像，不能 import Supabase 或 service role key。localStorage 仍保留为 demo fallback：页面先恢复本地状态，云端画像回来后再刷新；如果云端失败，就继续用本地 demo 画像。这保证了演示稳定性。

这还不是完整商业记忆系统。现在仍固定 `demo_student_001`，没有登录、真实多用户、老师端、RLS 用户策略，也没有 RAG、pgvector 或 Milvus。P1.8 只是把当前画像快照补上，下一步才是把这个 read model 扩展到真实用户和权限体系。

如果面试官问为什么不是 RAG，我会说：RAG 适合“找相似内容给模型参考”，比如相似错题、教材片段或讲义 chunk；但学生画像是事实状态，必须结构化、可解释、可回放。先做 Postgres 事实层和当前画像 read model，后面再把 pgvector/Milvus 接成检索增强，这样边界更稳。

如果问为什么不是模型直接记忆，我会说：模型可以总结和表达，但不能成为学习状态的事实来源。未成年人学习数据、错因标签和掌握度变化都需要证据门控和可审计规则。MathTrace 里模型输出一律视为不可信输入，最终能否写画像由服务端确定性逻辑决定。

如果问为什么不是完整生产级画像，我会说：当前阶段还没有 Auth、真实 RLS 用户策略、多学生权限、数据删除/导出、后台修复任务和长期规模优化。P1.8 做的是黑客松 demo 里最小但真实的一步：固定 demo 学生、服务端读写、事件可解释、快照可恢复。它证明架构方向，但不夸大成商业系统。

如果问参考了哪些资料，我会说：我参考了 Hermes Agent 对常驻记忆和 session search 的分层、memory provider 作为 additive 增强的边界、mem0 对写入/检索分离、身份范围过滤和多信号记忆召回的思路，以及 OpenClaw 对本地可检查上下文和安全边界的强调。但 MathTrace 没集成这些库，只把它们的原则落到教育场景的结构化事件、当前快照和安全 evidence 摘要里。

### 可能被继续追问

- 如果未来接入 Supabase Auth，`student_profiles` 的主键和 RLS 策略怎么调整？
- 多学生、多学科后，`student_profiles` 是继续单表 JSONB，还是拆成更细的 mastery / mistake cause 表？
- 当前事件全量重放在长历史下会不会变慢？什么时候引入基线快照或后台投影任务？
- 删除错题后重建失败，怎样让后台或管理员修复 `student_profiles`？
- 如果某条 `memory_events.memory_delta` 后来被发现有问题，怎么回滚或重算画像？
- pgvector 相似错题召回接入后，如何避免模型把召回内容直接写成画像事实？
- external memory provider 如果未来接入，哪些数据可以给它，哪些必须留在 Postgres 事实层？

### 反思与后续优化

P1.8 的边界很清楚：它是云端当前画像 MVP，不是完整学习档案系统。当前设计依赖 `demo_student_001` 和较小事件规模，所以用服务端全量重放事件生成快照是合理的；未来如果进入真实用户和长历史，就需要增量投影、快照基线、后台修复任务、用户级 RLS、数据导出/删除策略和更细的审计工具。

另一个后续点是 RAG 的接入顺序。P1.8 不急着做 RAG，是因为没有结构化事实层时，RAG 只会让系统看起来更智能，却无法回答“画像为什么这么变”。更合理的路线是：先稳定 `memory_events` 和 `student_profiles`，再把 pgvector/Milvus 接到相似错题和教材检索，最后让 Agent 在受控上下文里使用这些资料。

### 项目中的真实证据

- 代码：
  - `supabase/migrations/20260617000000_p18_student_profiles.sql`
  - `src/lib/student-profile/student-profile-service.ts`
  - `src/lib/persistence/student-profile-persistence.ts`
  - `src/app/api/student-profile/route.ts`
  - `src/lib/student-profile/student-profile-client.ts`
  - `src/components/mathtrace-workbench.tsx`
  - `src/lib/diagnosis/diagnose-service.ts`
  - `src/lib/diagnosis/confirm-service.ts`
  - `src/lib/mistake-book/mistake-book-service.ts`
- 测试：
  - `scripts/tests/persistence/student-profile-persistence.test.mjs`
  - `scripts/tests/persistence/diagnosis-persistence.test.mjs`
  - `scripts/tests/persistence/mistake-book-api.test.mjs`
  - `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - `scripts/tests/smoke/api-smoke.test.mjs`
  - `scripts/tests/smoke/demo-smoke.test.mjs`
  - `scripts/run-tests.mjs`
- 文档：
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
  - `docs/superpowers/specs/2026-06-17-p18-cloud-student-profile-memory-design.md`
  - `docs/superpowers/plans/2026-06-17-p18-cloud-student-profile-memory.md`
  - `docs/TECHNICAL_ROADMAP.md`
  - `docs/adr/2026-06-17-cloud-student-profile-memory.md`
  - `interview/mathtrace-project-narrative.md`
- 验证：
  - `npm test`
  - `npm run test:smoke`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`

---

## 15. P1.9 学生画像展示语义重构

### 当前状态

已完成设计与实现，保持 P1.8 云端 `student_profiles` 和 `memory_events` 数据流不变。这个阶段只改变画像区域的展示语义，不改数据库 schema、`memory_delta` 契约、画像投影规则或 `/api/student-profile` 返回结构。

### 功能价值

P1.9 解决的是“学生看到画像变化时怎么理解”的问题。P1.8 已经能从云端恢复当前画像，但页面如果继续把一次错题诊断直接展示成“掌握度扣分”，会让学生误以为系统在根据一道错题判断完整能力下降。

我把画像区改成“薄弱证据和复习优先级”：学生看到的是本次错题暴露了哪些薄弱点、哪些错因值得关注、为什么建议优先复习某个知识点。这样更符合当前数据来源，因为系统现阶段主要有错题负向证据，还没有完整练习正确率、复习完成情况或长期趋势证据。

### 关键设计

底层仍保存 `mastery_scores`、`memory_delta` 和从 `memory_events` 投影出的 `student_profiles` 当前快照。展示层派生“薄弱指数 = 100 - mastery_score”，数字越大表示越需要优先处理；这个派生值只用于 UI，不写入数据库，也不替代 `mastery_scores`。

前端展示拆成四块：本次诊断结论、全部知识点优先级、需要关注的错因、推荐依据。错因展示从内部 key 转成人话标题和一句话解释，并把低频、近期无变化的错因折叠到“其他错因”里。推荐依据只基于当前 `StudentProfile`、本次 `DiagnosisViewModel.memory_delta` 和已有 demo 历史派生，不声称读取完整 `memory_events`。

### 技术决策与取舍

我没有新增数据库表，也没有新增 `/api/student-profile/evidence` 或 `/api/memory-events`。原因是 P1.9 要解决的是展示语义问题，不是历史证据接口问题；如果为了一个 UI 文案问题提前暴露完整 `memory_events`，会把权限、分页、隐私、审计和多用户边界都提前带进来。

我也没有把 `mastery_scores` 改名或迁移成新的“薄弱指数”字段。`mastery_scores` 仍是当前 read model 的结构化数值，适合继续支撑排序、投影和后续兼容；“薄弱指数”只是展示层把同一个数值换成更符合用户直觉的方向。

P1.9 也不做 RAG、正向练习证据表、`practice_attempts`、`review_sessions` 或真实历史趋势计算。这些能力需要独立产品和数据设计，不能混进一次前端展示语义重构。

### 性能收益（如适用）

这次改动不增加网络请求，不新增数据库查询，也不让前端读取完整 `memory_events`。画像展示派生逻辑集中在前端纯函数里完成，因此不会影响 P1.8 的云端画像读取性能。

另一个收益是测试反馈更集中：薄弱指数、状态分层、错因筛选和推荐依据都可以通过 view model 的 UI 回归测试覆盖，不需要为了验证展示文案启动数据库或真实 provider。

### 面试官可能怎么问

1. 为什么不直接把 `mastery_scores` 改成薄弱指数？
2. 为什么要把“掌握度变化”改成“薄弱证据”？
3. 推荐依据为什么不直接读取完整 `memory_events`？
4. P1.9 和真正的学习画像还有什么差距？
5. 后续如何加入练习正确率这类正向证据？
6. 这个阶段为什么不新增 profile evidence API？
7. 你怎么避免 UI 展示和数据库语义漂移？

### 推荐回答

我会这样回答：

P1.9 不是在重做画像系统，而是在修正展示语义。当前系统主要从错题诊断拿到负向证据，如果页面直接写“掌握度下降”，用户容易理解成系统根据一道错题给能力扣分。所以我保留底层 `mastery_scores`、`memory_delta` 和 `student_profiles` 投影规则，只在展示层派生“薄弱指数”，让数字越大代表越需要优先复习。

我没有新增 profile evidence API，因为当前阶段的前端只需要解释“为什么这次建议优先复习某个知识点”。这可以从当前画像、本次 `memory_delta` 和已有 demo 历史派生出来。真正的“近 N 次趋势”“具体事件证据”或“练习正确率证明掌握度回升”，应该等正向练习闭环和权限边界设计清楚后单独做。

这个取舍的重点是诚实：P1.9 让 demo 更容易被学生理解，但不把它包装成完整学习测评系统。它仍然没有 `practice_attempts`、`review_sessions`，也没有 RAG 或完整历史事件浏览。

### 可能被继续追问

面试官可能会继续问 profile evidence API 的返回结构、`memory_events` 历史如何分页和脱敏、练习完成后的正向证据如何影响画像、多用户后 `student_profiles` 如何扩展，以及 UI 的“薄弱指数”阈值如何校准。

### 反思与后续优化

P1.9 仍是 demo 级画像解释，还没有真正读取完整 `memory_events` 给出历史趋势。下一步如果要继续推进画像可信度，可以先设计服务端 profile evidence 摘要接口，而不是把完整事件表直接暴露给前端；也可以在练习闭环后增加 `practice_attempts` 和 `review_sessions`，用正确率和复习完成情况补充正向证据。

另一个后续点是命名一致性。当前数据库仍保存 `mastery_scores`，前端展示“薄弱指数”。这两个名称必须在文档和代码中持续说明清楚，避免未来维护者误以为薄弱指数是新的持久化字段。

### 项目中的真实证据

- 代码：
  - `src/components/workbench/profile-view-model.ts`
  - `src/components/workbench/profile-insights.tsx`
  - `src/components/workbench/workbench-labels.ts`
- 测试：
  - `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-06-17-p19-profile-display-semantics-design.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- 验证：
  - `node scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - `npm run test:smoke`
  - `git diff --check`

---

## 16. P1.10 真实画像证据接口

### P1.8-P1.10 记忆系统总览

P1.8-P1.10 可以作为 MathTrace 的“云端学生画像记忆系统”来讲，但要注意它不是通用聊天记忆，也不是 RAG。它的核心链路是：

```text
被采信的诊断证据
-> memory_events 画像变化事件
-> student_profiles 当前画像快照
-> /api/student-profile/evidence 推荐依据摘要
-> 前端画像区的复习优先级解释
```

这条链路里，`memory_events` 是事实账本，保存每次画像变化的原因和增量；`student_profiles` 是 read model，保存当前画像快照；`/api/student-profile/evidence` 是只读摘要接口，用最近画像事件解释为什么推荐某个复习重点。三者分工不同，不能互相替代。

错题本只回答“有哪些错题”；画像记忆回答“这些错题怎样长期影响学生画像”。RAG 未来可以回答“该召回哪些相似题或教材片段”；但 P1.8-P1.10 先解决的是结构化事实层和可解释画像依据。没有这个事实层，直接做 RAG 会让系统看起来更智能，却很难回答“画像为什么这么变”。

这套设计也有清晰边界：当前仍固定 `demo_student_001`，没有登录、真实多用户、老师端、用户级 RLS 策略、RAG、pgvector 或 Milvus；前端不直连数据库；service role key 只在服务端；不存完整图片 base64；不把模型输出直接当画像事实。

### 当前状态

P1.10 已实现并完成本地验证。它在 P1.8 当前画像快照和 P1.9 展示语义之上，补了一个只读的 profile evidence API。

### 功能价值

P1.9 能解释当前推荐，但只能基于前端已有的当前画像和本次诊断。P1.10 让推荐依据可以使用服务端从 `memory_events` 汇总出的真实历史证据，所以页面不再只是“看起来像长期记忆”，而是能引用最近画像事件支撑复习优先级。

### 关键设计

我没有把完整 `memory_events` 暴露给前端，而是新增 `GET /api/student-profile/evidence`。服务端只读取最近事件中的结构化摘要字段，聚合出 top knowledge focus、top mistake causes 和 recent event summaries。当前画像仍走 `/api/student-profile`，历史证据走 evidence API，两条路径互不阻塞。

### 技术决策与取舍

这不是 RAG，也不是完整事件浏览器。RAG 解决相似题或材料召回；P1.10 解决“这条复习建议有什么历史证据”。我也没有 join `diagnosis_runs` 或错题正文，因为推荐依据不需要把题目原文、学生答案或标准答案暴露给浏览器。

### 性能收益（如适用）

读取最近 N 条 `memory_events` 并做服务端摘要，避免前端拉全量历史或重放画像。当前 `memory_events_student_created_idx` 支持按学生和时间读取最近事件。

### 面试官可能怎么问

1. 为什么不直接返回完整 `memory_events`？
2. 为什么 evidence API 不合并进 `/api/student-profile`？
3. 如何避免泄漏学生答案或题目内容？
4. evidence API 和 RAG 有什么区别？
5. 数据库不可用时页面如何降级？
6. 为什么只统计最近 N 条，不声称完整历史趋势？

### 推荐回答

我把当前画像和历史证据拆开了。`student_profiles` 负责快速恢复当前画像；profile evidence API 负责解释推荐依据。它只返回摘要，不返回完整 `memory_delta` 或诊断原文，这样前端可以展示“最近几条画像事件支持这个建议”，但不会绑定数据库内部结构，也不会泄漏敏感学习内容。

如果面试官问“这个 Agent 的 memory 是怎么做的”，我会把它拆成三层：第一层是 `memory_events`，记录被采信诊断如何改变画像；第二层是 `student_profiles`，把事件投影成当前可读快照；第三层是 profile evidence API，把最近事件压缩成前端可展示的推荐依据。这样做的好处是，UI 可以快速读当前画像，面试时也能追溯每个建议背后的历史证据，而且不会把完整题目、答案或原始模型输出暴露给浏览器。

### 可能被继续追问

后续可以继续问事件分页、老师端时间线、练习后的正向证据、RAG 相似错题召回，以及多用户权限如何改造。

### 反思与后续优化

P1.10 仍然只看最近事件窗口，不是完整长期趋势分析。下一步如果要做更强的学习规划，需要加入练习完成后的正向证据和更明确的时间窗口。

### 项目中的真实证据

- 代码：
  - `src/app/api/student-profile/evidence/route.ts`
  - `src/lib/student-profile/student-profile-evidence-service.ts`
  - `src/lib/student-profile/student-profile-evidence-client.ts`
  - `src/components/workbench/profile-view-model.ts`
  - `src/components/workbench/profile-insights.tsx`
- API：
  - `GET /api/student-profile`
  - `GET /api/student-profile/evidence`
- 数据：
  - `memory_events`
  - `student_profiles`
- 测试：
  - `scripts/tests/persistence/student-profile-persistence.test.mjs`
  - `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - `scripts/tests/architecture/architecture-boundaries.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-06-18-p110-profile-evidence-api-design.md`
  - `docs/superpowers/specs/2026-05-28-math-mistake-agent-prd.md`
- 验证：
  - `node scripts/tests/persistence/student-profile-persistence.test.mjs`
  - `node scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - `node scripts/tests/architecture/architecture-boundaries.test.mjs`
  - `npm test`
  - `npm run test:smoke`
  - `npm run lint`
  - `npm run build`

---

## 17. P2.0 教辅题源到 practice corpus 的 RAG 前置闭环

### 当前状态

已完成本地实现和验证，待合并到 `main`。这个阶段完成的是 RAG MVP 的前置题源工程：把真实扫描版教辅资料经过 MinerU 解析、候选题抽取、人工审核和修正，转换成一个本地 `practice_corpus.json` fixture。它还不是完整 RAG：没有 pgvector、embedding、检索 API、前端推荐接入，也没有让 RAG 写入画像。

### 功能价值

P2.0 的第一步不是直接做“向量库问答”，而是先证明教辅资料能稳定变成变式题来源。对 MathTrace 来说，RAG 的价值是从教辅资料中找相似题、变式题和复习材料，支撑“下一步练什么”；它不应该替代 `memory_events`、`student_profiles` 或 profile evidence API。

这个阶段把最终目标拆成了一个可验证的小闭环：

```text
扫描版导数专题 PDF
-> MinerU 精准解析 JSON
-> candidate_questions.json 候选题
-> 本地审核页人工确认和修正
-> reviewed_practice_seed.json
-> practice_corpus.json
```

这样后续做 metadata/text search 或 pgvector 时，面对的是经过人工审核的题源，而不是直接把 OCR 原文扔进检索系统。对面试来说，这能展示一个重要判断：RAG 的质量首先取决于 corpus 质量，而不是向量数据库本身。

### 关键设计

这个阶段分成三层：

- MinerU JSON candidate mapper：从 MinerU 解析结果里抽出候选题，保留页码、章节、bbox、置信度和 warning。
- Candidate Review UI：生成本地静态审核页，展示题干、公式渲染、原始候选信息和审核状态，支持人工修正题干/选项并导出 seed。
- Practice Corpus Builder：把人工审核后的 `reviewed_practice_seed.json` 转成 `practice-corpus-v0` 的 `practice_corpus.json`。

`reviewed_practice_seed.json` 和 `practice_corpus.json` 被刻意拆开：

- `reviewed_practice_seed.json` 是人工审核和证据链产物，保留原始 OCR 文本、人工修正、审核状态和 source ref。
- `practice_corpus.json` 是后续检索 fixture，只保留检索需要的最小字段：`question_text`、`search_text`、`knowledge_points: ["derivative"]`、`section_title`、`difficulty`、`source_ref` 和 `review_meta`。

`variant_level` 不进入 corpus。它不是题目本体属性，而是“当前错题和召回题之间关系”的推荐结果元数据，应该由后续推荐逻辑动态产生。

### 技术决策与取舍

我没有第一步就上 pgvector。原因是扫描版 PDF 的风险不在“能不能向量检索”，而在“题目能不能被正确抽取、公式能不能保真、图像题怎么处理、跨页题和章节上下文是否可靠”。如果 corpus 质量不稳定，pgvector 只会更快地召回错误材料。

我也没有手工重新建一个题库。用户已经有真实教辅 PDF/DOC，最终目标就是 PDF/DOC RAG，所以第一步直接围绕真实材料做解析和审核。为了控制风险，只截取导数专题，不把 100MB 级整本资料一次性吞进去。

我没有把真实 PDF、MinerU JSON、审核 seed 或 corpus 提交到 Git。这些都是本地敏感 artifact，可能包含教辅版权内容和学生学习材料。Git 里只提交脚本、测试、plan/spec 和边界说明。

人工审核页保留为本地静态工具，而不是正式产品页面。它服务的是 corpus 质量控制，不面向学生。当前阶段也不接数据库、不接 profile、不影响 `sample_diagnosis`。

### 性能收益（如适用）

这个阶段的收益主要是成本和验证效率：

- 用 9MB 导数专题切片替代 100MB 级整本扫描 PDF，降低 OCR/解析调试成本。
- 先生成本地静态审核页，人工一次性快速检查 72 道候选题，比直接读 JSON 更高效。
- 生成 `practice_corpus.json` 时只输出 summary，不打印完整题干，减少敏感内容泄漏面。
- CLI 和 core mapper 都是本地 Node 脚本，测试反馈很快，不依赖网络、数据库或外部模型。

本次真实数据验证结果是：候选题 72 道，人工审核后 69 道进入 corpus，3 道依赖图像的题暂不进入文本 corpus。生成 summary 显示 `item_count=69`、`with_variant_level=0`、`empty_search_text=0`、`knowledge_points=["derivative"]`。

### 面试官可能怎么问

1. 你这里的 RAG 到底解决什么问题？
2. 为什么不直接上 pgvector？
3. 为什么要做人工审核页，而不是全自动抽题？
4. `reviewed_practice_seed.json` 和 `practice_corpus.json` 有什么区别？
5. 为什么 `variant_level` 不放进 corpus？
6. 图像题、公式错误和 OCR 错误怎么处理？
7. RAG 和 `memory_events` / `student_profiles` / evidence API 有什么区别？
8. 为什么不把 corpus 存进数据库？

### 推荐回答

我会这样回答：

MathTrace 里的 RAG 不是学生画像记忆，也不是错题本事实层。它解决的是“下一步练什么”：从教辅资料里召回相似题、变式题或复习材料，给当前错题提供外部题源。学生画像仍然由确认后的诊断证据进入 `memory_events`，再投影成 `student_profiles`；RAG 不能决定画像写入。

我没有一开始就上 pgvector，是因为这个阶段最大的风险不是检索算法，而是 corpus 质量。扫描版 PDF 会有 OCR 错字、根号和不等号识别问题、公式渲染问题、题目跨页和图像题问题。如果直接 embedding，后面召回结果看起来像 RAG，但实际题源不可靠。所以我先做“教辅资料 -> 候选题 -> 人工审核 -> practice corpus”的闭环。

`reviewed_practice_seed.json` 是审核证据，保留原始 OCR、人工修正和 source ref；`practice_corpus.json` 是检索 fixture，只保留后续搜索需要的字段。这个拆分让我们既能追溯题目从哪里来，也能避免检索层背上太多审核状态和临时字段。

`variant_level` 我没有放进 corpus，因为它不是题目自己的属性。同一道教辅题，对某个错题可能是同构变式，对另一个错题可能只是同知识点练习。这个关系应该在“当前错题 -> 召回结果”时动态计算，而不是静态写死在题库里。

### 可能被继续追问

- 后续 metadata/text search 会用哪些字段？
- pgvector 什么时候引入？embedding 文本怎么拼？
- 如何为图像题补充图片 crop 或人工转写？
- corpus 扩到多个专题后，`knowledge_points` 怎么从 `["derivative"]` 演进成内部知识点体系？
- 如何评估召回题是否真的是好变式？
- RAG 召回内容给 LLM 后，如何避免模型把召回内容写成画像事实？

### 反思与后续优化

当前 P2.0 只是题源工程化闭环，不是完整 RAG 产品闭环。它还没有 metadata/text search、pgvector、embedding、推荐 API 和前端变式题接入。图像题也暂时从文本 corpus 排除，需要后续单独处理图片 crop、图文混合题和版权边界。

下一步更合理的是先做 metadata/text search prototype，用 `practice_corpus.json` 的 `question_text`、`search_text`、`knowledge_points` 和 `section_title` 做可解释召回；等召回质量和评估方式稳定后，再考虑 pgvector。这样可以避免过早把问题归因到向量数据库，而忽略题源质量。

### 项目中的真实证据

- 代码：
  - `scripts/rag/mineru-json-candidate-mapper-core.mjs`
  - `scripts/rag/map-mineru-json-to-candidates.mjs`
  - `scripts/rag/candidate-review-ui-core.mjs`
  - `scripts/rag/build-candidate-review-ui.mjs`
  - `scripts/rag/practice-corpus-core.mjs`
  - `scripts/rag/build-practice-corpus.mjs`
- 测试：
  - `scripts/tests/rag/mineru-json-candidate-mapper-core.test.mjs`
  - `scripts/tests/rag/mineru-json-candidate-mapper-cli.test.mjs`
  - `scripts/tests/rag/candidate-review-ui-core.test.mjs`
  - `scripts/tests/rag/candidate-review-ui-cli.test.mjs`
  - `scripts/tests/rag/practice-corpus-core.test.mjs`
  - `scripts/tests/rag/practice-corpus-cli.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-06-22-p20-candidate-question-review-ui-design.md`
  - `docs/superpowers/plans/2026-06-22-p20-reviewed-seed-to-practice-corpus.md`
  - `docs/reviews/2026-06-22-p20-reviewed-seed-to-practice-corpus-implementation-review.md`（本地审查材料，不提交）
- 本地 artifact（不提交）：
  - `artifacts/rag/mineru-candidate-mapper/candidate_questions.json`
  - `artifacts/rag/reviewed_practice_seed.json`
  - `artifacts/rag/practice-corpus/practice_corpus.json`
- 验证：
  - `node scripts/tests/rag/practice-corpus-core.test.mjs`
  - `node scripts/tests/rag/practice-corpus-cli.test.mjs`
  - `node scripts/run-tests.mjs default`
  - `npm run lint`
  - `npm run build`
  - `node scripts/rag/build-practice-corpus.mjs --input artifacts/rag/reviewed_practice_seed.json --out artifacts/rag/practice-corpus`

---

## 18. P2.1 Local Variant Practice Agent MVP

### 当前状态

已完成本地实现和验证，待合并到 `main`。这个阶段把 P2.0 的 reviewed practice corpus 接成一个本地 Variant Practice Agent MVP：它还不是正式产品 UI，也不接 `/api/diagnose`，但已经能从本地 Practice Query 出发，调用 corpus search 工具，排序候选题，输出有顺序、有推荐类型、有理由的变式练习建议。

真实 demo run 的结果是：从 8 道候选题中推荐 2 道，类型为 `foundation` 和 `near_transfer`，并返回 `insufficient_recommendations`。这不是失败路径，而是 P2.1 的边界选择：题源 metadata 还不足以稳定凑出第三类综合迁移题时，Agent 明确给 warning，不伪造或硬凑推荐。

### 功能价值

P2.0 证明了“教辅资料可以变成可检索 corpus”；P2.1 进一步证明“corpus 可以服务下一步练什么”。它把裸检索结果转成学生可用的练习顺序：先同章节巩固，再跨章节轻微迁移，最后在条件足够时做综合应用。

这个阶段对 Demo 的价值是补上 MathTrace 最初产品叙事里的最后一环：错因诊断不是停在“你错在哪里”，而是能继续回答“下一题该练什么，为什么先练这道”。当前仍是 CLI 层验证，避免过早改前端或 API 主链路。

### 关键设计

核心数据流是：

```text
Practice Query
-> searchPracticeCorpus tool
-> rank candidates
-> rule-based recommendation selection
-> agent_steps / rationale
```

`scripts/rag/practice-corpus-search-core.mjs` 负责可解释召回，只回答“哪些 corpus item 可能相关”。`scripts/rag/variant-practice-agent-core.mjs` 负责 Agent 编排，把 top-k candidates 二次筛选成最多 3 道推荐，并输出 `foundation`、`near_transfer`、`mixed_application` 这类动态推荐类型。`scripts/rag/recommend-variant-practice.mjs` 只是 CLI demo runner：读取本地 corpus 和 query，写出 ignored 的 `recommendations.json`，stdout 只输出 summary。

`agent_steps` 记录 analyze、search、rank、build recommendation 四步，用于后续 UI 或 tracing 展示。顶层 `rationale` 解释整组练习顺序，每道 recommendation 仍保留自己的 `reason` 和 `matched_dimensions`。

### 技术决策与取舍

我没有在 P2.1 引入 pgvector、embedding、LLM rerank、数据库写入或画像写入。原因是这个阶段要验证的是“经过审核的题源能否被确定性 Agent 编排成练习建议”，不是先把召回质量问题交给向量库或模型。

P2.1 也不写 `memory_events`、`student_profiles` 或错题本。Practice Query 里的错因和目标技能只是本地推荐上下文，不构成新的学生画像证据。这样可以保持 RAG/题源层和学生事实层的边界：推荐练习可以用画像摘要作为输入，但不能反过来直接写画像。

我也没有让 LLM rerank 或润色理由。当前 corpus 只有导数专题、metadata 还少，LLM 很容易把“不足以判断”的候选讲得很像老师。先用规则和 warning 暴露不足，比生成漂亮但不可审计的推荐更可靠。

### 为什么这比 top-k search 更像 Agent

Top-k search 只返回“相似的候选题”。P2.1 Agent 多了几层决策：

- 先分析 Practice Query，形成练习目标。
- 把 corpus search 当作工具调用，而不是最终结果。
- 对候选题按教学意图二次排序和分类。
- 按“巩固 -> 迁移 -> 综合”的顺序选择推荐。
- 用 `agent_steps` 暴露过程，用 `rationale` 解释整体策略。
- 候选不足时返回 warning，而不是把 top-k 前三道包装成推荐。

所以它仍是一个很小的本地 Agent，但已经具备“目标分析、工具使用、决策编排、可观测 trace 和降级”的基本形态。

### 性能收益（如适用）

这个阶段继续保持本地、确定性和无网络依赖。一次 CLI demo 只读本地 JSON，不调用模型、不访问数据库、不触发图片处理，因此验证成本低，适合在合并前跑进默认测试套件。

安全收益也很直接：CLI stdout 不打印完整题干、完整 corpus、API key、`.env` 内容或审核细节；完整 recommendations 只写入 `/artifacts/` 下的 ignored local artifact。真实 demo summary 只暴露 recommendation count、candidate count、warning 和泄漏检查布尔值。

### 面试官可能怎么问

1. 为什么不直接把 top-k search 展示给用户？
2. 为什么这能叫 Agent，而不是普通排序脚本？
3. 为什么不先用 LLM rerank？
4. 候选不足 3 道时怎么办？
5. `agent_steps` 和 `rationale` 分别解决什么问题？
6. 以后怎么接入 `/api/diagnose`？
7. 这个 Agent 会不会写入学生画像？
8. 下一步如果推荐质量不够，先补什么？

### 推荐回答

我会这样回答：

P2.1 不是把搜索结果原样展示给学生。搜索工具只负责召回候选题，Agent 还会根据当前错因和目标技能做练习目标分析，再把候选题编排成“先巩固、再迁移、最后综合”的练习顺序。这个顺序、推荐类型、每道题理由和整体 `rationale` 才是 Agent 的输出。

我没有一开始就用 LLM rerank，因为当前最大的未知是 corpus metadata 是否足够支撑稳定推荐。LLM 可以把理由写得很流畅，但如果候选本身不够好，模型会掩盖问题。P2.1 选择确定性规则和 warning，是为了让推荐质量问题暴露出来，方便下一步补 tag proposal 或 metadata enrichment。

候选不足时，Agent 不硬凑 3 道。真实 demo 就只推荐了 2 道，并返回 `insufficient_recommendations`。这说明它不是 top-k 前三道包装器，而是有推荐标准，达不到标准就诚实降级。

未来接入 `/api/diagnose` 时，Practice Query 可以由确认后的诊断结果构造：题干摘要、内部知识点 key、受控错因标签和目标技能进入 Agent。但 P2.1 不读取真实 `student_profiles`，也不写 `memory_events`。画像事实层仍由确认证据控制，RAG/练习 Agent 只是使用上下文做推荐。

### 可能被继续追问

- `foundation`、`near_transfer`、`mixed_application` 的规则如何评估？
- 如果章节标题不稳定，推荐类型会不会偏？
- 多知识点 corpus 扩展后，临时导数词表怎么迁移？
- 如何把 `agent_steps` 展示成前端可理解的 Agent trace？
- 什么时候从 metadata/text search 升级到 pgvector？
- LLM 后续只适合做 rerank、reason polish，还是也能生成新题？

### 反思与后续优化

当前 P2.1 的主要缺口是 metadata 太薄。真实 corpus run 能召回 8 道候选，但只稳定推荐 2 道，说明仅靠 `section_title`、`knowledge_points` 和简单关键词，还不足以稳定区分综合迁移题。下一步更合理的是先做 tag proposal / metadata enrichment，例如题型、方法标签、目标技能、是否含切线/单调/零点等，而不是马上 pgvector。

后续如果要接前端，应该先做一个隔离的 demo page 或 API prototype，展示 Practice Query、Agent steps 和推荐摘要，不要直接改 `sample_diagnosis` 主链路。等推荐质量和安全输出边界稳定后，再考虑把它接入正式诊断报告。

### 项目中的真实证据

- 代码：
  - `scripts/rag/practice-corpus-search-core.mjs`
  - `scripts/rag/variant-practice-agent-core.mjs`
  - `scripts/rag/recommend-variant-practice.mjs`
- 测试：
  - `scripts/tests/rag/practice-corpus-search-core.test.mjs`
  - `scripts/tests/rag/variant-practice-agent-core.test.mjs`
  - `scripts/tests/rag/variant-practice-agent-cli.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-06-22-p21-variant-practice-agent-mvp-design.md`
  - `docs/superpowers/plans/2026-06-22-p21-variant-practice-agent-mvp.md`
- 本地 artifact（不提交）：
  - `artifacts/rag/variant-practice-agent/demo-query.json`
  - `artifacts/rag/variant-practice-agent/recommendations.json`
- 验证：
  - `node scripts/tests/rag/practice-corpus-search-core.test.mjs`
  - `node scripts/tests/rag/variant-practice-agent-core.test.mjs`
  - `node scripts/tests/rag/variant-practice-agent-cli.test.mjs`
  - `node scripts/run-tests.mjs default`
  - `node scripts/rag/recommend-variant-practice.mjs --corpus artifacts/rag/practice-corpus/practice_corpus.json --query artifacts/rag/variant-practice-agent/demo-query.json --out artifacts/rag/variant-practice-agent --limit 8`

---

## 19. P2.2 题源 metadata enrichment（题源元数据增强）

### 当前状态

已完成本地 `deterministic tag proposal`（确定性规则生成标签建议）/ `enriched corpus`（带标签增强题库）工具链，并通过本地测试验证。真实教辅题源 `artifact`（本地生成的中间产物文件）仍保留本地，不进入 `Git`（版本控制历史）。

本次真实本地 `smoke`（端到端冒烟验证）的 `summary`（汇总结果）是：69 道 `corpus item`（题库条目）生成 `tag proposal`（标签建议），其中 57 道 `high confidence`（高置信度）、1 道 `needs fix`（需要修正）、0 道 `needs visual`（依赖原图）；阈值通过后生成 `enriched corpus`（带标签增强题库），其中 68 道 `approved`（已接受，可被 Agent 推荐逻辑消费）、1 道 `needs fix`（需要人工修正）。`enriched Agent evaluation`（基于带标签题库的 Agent 推荐评估）从 12 道候选中推荐 2 道，并给出 `insufficient_approved_tagged_items`（已通过标签审核的题目不足）和 `no_mixed_application_with_related_method_tags`（没有找到带相关方法标签的综合应用题），说明 P2.2 已能更明确解释推荐缺口，但还没有把所有场景稳定提升到 3 道推荐。

### 功能价值

P2.2 解决 P2.1 推荐不足的核心原因：题库只有全文和章节，缺少可解释的技能、方法和题型标签。它让 `Variant Practice Agent`（变式练习推荐 Agent）能基于结构化 `metadata`（题目元数据）选择巩固题、近迁移题和综合应用题。

对 MathTrace 来说，这一步把“教辅资料能进入 `corpus`（题库语料）”继续推进为“`corpus`（题库语料）能被解释性推荐规则消费”。它不是换一个更复杂的检索算法，而是先补足题源结构信息，让后续 `pgvector`（Postgres 的向量检索扩展）、`embedding`（文本向量表示）或前端推荐有更可靠的题目标签层。

### 关键设计

P2.2 的核心不是“再做一个搜索脚本”，而是在 P2.0/P2.1 已经得到可用题库后，给每道题补一层 `Agent`（负责推荐练习的程序逻辑）能理解的结构化语义。对一个没接触过项目的人，可以把这一阶段理解成三步：

```text
practice_corpus.json
-> candidate_tag_proposals.json
-> enriched_practice_corpus.json
```

第一步，`practice_corpus.json`（人工审核后的原始练习题库文件）是 P2.0 产出的“人工审核后的原始题库”。它保留题干、来源页码、章节、搜索文本和 `knowledge_points: ["derivative"]`（粗粒度知识点字段，当前表示导数专题），但它还不知道每道题到底练“切线斜率”、练“单调性”，还是练“参数范围”。这意味着 P2.1 `Agent`（变式练习推荐逻辑）只能根据章节、全文关键词和粗粒度知识点做推荐，能召回相关题，但很难稳定区分“巩固题、近迁移题、综合应用题”。

第二步，`candidate_tag_proposals.json`（机器生成的候选标签建议文件）是“机器标签建议稿”。它不是正式题库，也不是最终 `truth`（事实真值）。脚本会读取每道题的 `question_text`（题干文本）、`search_text`（用于检索的拼接文本）、`section_title`（章节标题）和 `source_ref.section_title`（来源引用里的章节标题），拼成一个用于规则判断的 `source text`（规则输入文本），再用一组导数专题规则提出标签建议。每个建议标签都带四类信息：

```json
{
  "tag": "tangent_slope",
  "display_name": "切线斜率",
  "confidence": "high",
  "evidence_terms": ["切线", "斜率"],
  "source": "rule"
}
```

这里的设计重点是可审核：`tag`（内部标签 key）是系统内部稳定 key，`display_name`（中文展示名）只负责中文展示，`confidence`（置信度）表示规则确信程度，`evidence_terms`（命中证据词）说明为什么命中，`source`（标签来源）说明这是规则生成而不是人工确认或 `LLM`（大语言模型）判断。这样以后做 `tag review UI`（标签审核界面）时，用户看到的不是一个黑盒结论，而是“这题因为出现了这些词，所以系统建议打这些标签”。

第三步，`enriched_practice_corpus.json`（Agent 真正使用的带标签题库文件）是“Agent 真正消费的带标签题库”。它把原始题目和标签合在一起，并给每道题加 `tag_review_meta`（标签审核元信息）。如果有人工审核记录，就用人工审核后的 `reviewed_tags`（人工确认后的标签）；如果没有人工审核记录，第一版本地评估可以用 `--accept-rule-proposals`（接受纯规则建议的本地评估开关）把纯规则、非空的 `proposal`（标签建议）临时升级为 `approved`（已接受）。没有标签、混入非 `rule source`（非规则来源）或被审核为 `needs_fix`（需要修正）/ `skipped`（跳过）的题不会被搜索层当成 `approved tagged item`（已通过标签审核的可推荐题目）消费。

这三层分开的好处是，数据边界很清楚：

- `practice_corpus.json`（人工审核后的原始练习题库文件）：题目内容层，来自 `OCR`（光学字符识别）/ `MinerU`（PDF 解析工具）和人工题干审核。
- `candidate_tag_proposals.json`（机器生成的候选标签建议文件）：机器建议层，便宜、可重复、可批量生成，但不能直接当真值。
- `enriched_practice_corpus.json`（Agent 使用的带标签题库文件）：检索消费层，只有 `accepted`（已接受）或人工确认后的标签才进入 `Agent`（推荐逻辑）推荐路径。

P2.2 的标签体系分成三类：

- `target_skills`（目标能力标签）表示这道题训练什么能力，例如 `tangent_slope`（切线斜率）、`derivative_definition_limit`（极限式识别导数）、`monotonicity`（单调性）、`extrema`（极值最值）、`zero_point`（零点）、`parameter_range`（参数范围）。这是 `Agent`（推荐逻辑）判断“当前错题和候选题是不是同一目标能力”的主信号。
- `method_tags`（解题方法标签）表示这道题可能用什么方法，例如 `derivative_definition`（导数定义式）、`monotonicity_by_derivative`（用导数判断单调性）、`extremum_by_derivative`（用导数判断极值最值）、`zero_count`（零点个数）、`parameter_classification`（参数分类讨论）、`inequality_with_derivative`（用导数处理不等式）。它服务于“综合应用/方法迁移”判断：有些题目标技能不同，但底层方法相近，仍然适合做迁移练习。
- `feature_flags`（题目特征标记）表示题目形态和推荐注意事项，例如 `has_choice_options`（选择题选项）、`has_fill_blank`（填空题空线）、`has_ln_exp`（含对数或指数）、`has_square_root`（含根号）、`has_graph`（涉及图像）、`needs_visual`（必须看原图）。这些标签不决定知识点，但能帮助 `Agent`（推荐逻辑）过滤或解释题目。例如 `needs_visual`（必须看原图）表示当前文本不足以还原题意，文本 `Agent`（纯文本推荐逻辑）默认跳过，避免推荐一道缺图题给学生。

第一版规则是 `deterministic`（确定性、可重复）的：看到“切线/斜率”就建议 `tangent_slope`（切线斜率），看到“单调/递增/递减”就建议 `monotonicity`（单调性），看到“极值/最值/最大值/最小值”就建议 `extrema`（极值最值），看到“参数/恒成立/取值范围”就建议 `parameter_range`（参数范围）；再根据目标技能派生方法标签，例如 `tangent_slope`（切线斜率）会派生 `tangent_slope`（切线斜率方法）和 `derivative_definition`（导数定义式），`parameter_range`（参数范围）会派生 `parameter_classification`（参数分类讨论）。题型特征则通过 `A. B. C. D.`（选择题选项）、`____`（填空空线）、`ln`（自然对数）、`sqrt/√/根号`（根号结构）、`如图/图像/图象`（图像相关描述）等信号生成。

这里有一个刻意保守的边界：第一版规则会把“如图”作为 `visual dependency`（必须依赖原图才能解题）的强信号处理，可能把部分文字已足够的图像题过度标成 `needs_visual`（必须看原图）。我在文档里明确记录这个取舍，因为这是宁可少推荐，也不推荐学生做不了的题。后续 `tag review UI`（标签审核界面）需要允许人工把这类题从 `needs_visual`（必须看原图）修正为仅 `has_graph`（涉及图像但文本可能足够）。

Agent 消费 enriched corpus 时，流程也从“全文搜索”升级为“结构化匹配 + 文本兜底”：

```text
Practice Query（当前错题转成的练习需求）
-> 归一化中文 target_skills（目标能力请求）到 snake_case key（内部英文标签 key）
-> 从 target_skills（目标能力请求）派生 query method_tags（查询侧方法标签）
-> searchPracticeCorpus（题库检索函数）过滤 needs_visual（必须看原图）和未 approved（未接受）的标签
-> 按 knowledge_point（知识点）/ section_title（章节标题）/ target_skill（目标能力）/ method_tag（解题方法）/ query_term（关键词）打分
-> Variant Practice Agent（变式练习推荐 Agent）选择 foundation（巩固题）/ near_transfer（近迁移题）/ mixed_application（综合应用题）
```

其中 `foundation`（巩固题）更偏同章节同知识点巩固；`near_transfer`（近迁移题）要求不同章节但命中同知识点和 `target_skill`（目标能力标签）；`mixed_application`（综合应用题）则避免直接命中同一个 `target_skill`（目标能力标签），转而依赖相关 `method_tags`（解题方法标签），用来寻找方法相近但题目外观不同的迁移应用题。

工具链仍保持本地 artifact 边界：

```text
practice_corpus.json
-> candidate_tag_proposals.json
-> tag_proposal_summary.json
-> enriched_practice_corpus.json
-> enrichment_summary.json
-> enriched Agent evaluation
```

`proposal summary`（标签建议汇总）决定第一版是否可以用 `--accept-rule-proposals`（接受纯规则建议的本地评估开关）做本地评估。如果 `high confidence`（高置信度）、`needs fix`（需要修正）和 `needs visual`（依赖原图）的比例不过阈值，下一步应先做轻量标签审核页，而不是把低质量标签直接喂给 `Agent`（推荐逻辑）。

### 技术决策与取舍

我没有第一步上 `pgvector`（Postgres 向量检索扩展）或 `embedding`（文本向量表示），因为 P2.1 的问题首先不是向量召回，而是题源 `metadata`（结构化元数据）太薄。先用 `deterministic proposal`（确定性标签建议）建立可审核标签层，可以降低人工标注成本，也能为后续 `embedding_text`（用于生成向量的文本字段）/ `pgvector`（向量检索扩展）提供更干净的文本和标签依据。

我也没有让 `LLM`（大语言模型）直接给所有题打最终标签。P2.2 仍然把机器输出定位成 `proposal`（标签建议），最终进入 `enriched corpus`（带标签增强题库）的标签必须是 `accepted`（已接受）或人工审核后的结果。这样可以避免模型或规则把错误标签静默写进正式题源。

当前 `smoke`（冒烟验证）仍只推荐 2 道题，所以我不会把 P2.2 描述成“推荐质量已经完全解决”。更准确的结论是：`metadata enrichment`（题源元数据增强）让缺口更可诊断，下一步可以聚焦补充 `approved tagged items`（已通过标签审核的可推荐题目）或补一个轻量 `tag review UI`（标签审核界面），而不是盲目升级检索技术。

### 性能收益（如适用）

本阶段没有宣称线上性能提升；收益主要是本地 `deterministic pipeline`（确定性处理流水线）可重复、无外部模型成本、无网络依赖，适合作为黑客松 `demo`（演示）的稳定题源加工链路。

另一个实际收益是验证效率：`tag proposal`（标签建议）、`enriched corpus`（带标签增强题库）和 `Agent evaluation`（Agent 推荐评估）都能用 `Node CLI`（Node.js 命令行脚本）在本地跑完，`stdout`（命令行标准输出）只输出 `summary counts`（汇总数量），不打印完整教辅题干、完整 `corpus`（题库语料）、`PDF`（原始教辅文件）/ `MinerU JSON`（PDF 解析结果）或 `recommendation artifact`（推荐结果中间产物）。

### 面试官可能怎么问

1. 为什么 P2.2 还不接向量库？
2. 为什么不用 `LLM`（大语言模型）直接给所有题打标签？
3. 如何避免机器标签污染推荐结果？
4. 为什么标签用英文 `key`（内部稳定标识）而不是中文？
5. 图像题为什么跳过？
6. 这和传统 `RAG`（检索增强生成）的 `embedding`（文本向量）检索有什么关系？
7. 本地 `smoke`（冒烟验证）仍然只有 2 道推荐，说明什么？
8. 什么情况下需要做 `tag review UI`（标签审核界面）？
9. `candidate_tag_proposals.json`（机器生成的候选标签建议文件）和 `enriched_practice_corpus.json`（Agent 使用的带标签题库文件）为什么要拆成两个文件？
10. `target_skills`（目标能力标签）、`method_tags`（解题方法标签）和 `feature_flags`（题目特征标记）分别解决什么问题？

### 推荐回答

我会这样回答：

P2.1 已经能从题库召回候选题，但推荐只能稳定给出 2 道，说明瓶颈不在“有没有向量库”，而在“题目结构信息不够”。所以 P2.2 先做 `metadata enrichment`（题源元数据增强），把每道题的目标技能、解法方法、题型特征结构化出来。这里我刻意拆成两个 `artifact`（本地中间产物）：`candidate_tag_proposals.json`（机器生成的候选标签建议文件）是机器建议稿，`enriched_practice_corpus.json`（Agent 使用的带标签题库文件）才是 `Agent`（推荐逻辑）消费的题库。这样中间可以插入人工审核，也可以保留每个标签的证据、置信度和来源。

标签本身分三类：`target_skills`（目标能力标签）回答“这题练什么”，比如切线斜率、单调性、极值最值；`method_tags`（解题方法标签）回答“这题怎么解”，比如导数定义式、导数判断单调、参数分类讨论；`feature_flags`（题目特征标记）回答“这题长什么样或有什么限制”，比如选择题、填空题、含对数、含根号、依赖图像。`Agent`（推荐逻辑）推荐时，`target_skills`（目标能力标签）更适合找近迁移题，`method_tags`（解题方法标签）更适合找综合应用题，`feature_flags`（题目特征标记）则帮助过滤或解释题目。

我没有让规则或 `LLM`（大语言模型）直接写最终标签，是因为错标签会直接影响后续推荐。P2.2 的规则只负责 `proposal`（标签建议），每个 `proposal`（标签建议）都记录 `evidence_terms`（命中证据词）和 `source: "rule"`（标签来源为规则）。进入 `enriched corpus`（带标签增强题库）时，要么有人工 `review record`（标签审核记录），要么在本地 `MVP`（最小可验证版本）评估里显式使用 `--accept-rule-proposals`（接受纯规则建议的本地评估开关）接受纯规则 `proposal`（标签建议）。这样就算规则不完美，也不会把“机器猜测”伪装成人工确认。

我没有立刻接 `pgvector`（Postgres 向量检索扩展），是因为 `embedding`（文本向量表示）更擅长语义召回，但它不会凭空知道一道题到底训练切线斜率、导数定义、单调性还是参数分类。如果 `metadata`（题目元数据）层太薄，向量检索可能只是更快地召回一批“看起来像导数题”的候选。P2.2 先把标签层补出来，后续 `embedding_text`（用于生成向量的文本字段）也能拼得更干净。

这次 `enriched evaluation`（基于带标签题库的推荐评估）仍然推荐 2 道，并返回两个具体 `warning`（可诊断提醒）。我的理解不是“失败”，而是规则现在能说清楚缺口在哪里：`approved tagged items`（已通过标签审核的可推荐题目）还不够，且没有找到带相关 `method_tags`（解题方法标签）的综合应用题。下一步应该补轻量标签审核或扩充审核后的标签质量，再考虑 `pgvector`（Postgres 向量检索扩展）。

### 可能被继续追问

- `rule-based proposal`（基于规则的标签建议）会不会过拟合导数专题？
- 标签体系扩到多个专题时如何治理 `key`（内部稳定标识）？
- 人工审核的最小 `UI`（用户界面）应该长什么样？
- 如果 `LLM`（大语言模型）未来参与 `proposal`（标签建议），怎么记录 `source`（标签来源）和 `confidence`（置信度）？
- `enriched corpus`（带标签增强题库）进入正式产品前如何处理版权和图像题？
- 如何用 `evaluation`（评估结果）指标判断 `metadata`（题目元数据）是否足够好？

### 反思与后续优化

下一步可以根据 `proposal summary`（标签建议汇总）决定是否做轻量标签审核页；如果标签层稳定但召回仍不足，再做 `embedding_text`（用于生成向量的文本字段）和 `pgvector prototype`（向量检索原型）。

P2.2 也暴露了一个边界：`deterministic rules`（确定性规则）能快速生成第一版标签，但不能替代人工确认。当前 1 道 `needs-fix item`（需要修正的题目）和仍不足的 `mixed application`（综合应用题）推荐，都说明后续要么补审核流程，要么扩充 `method_tags`（解题方法标签）规则和真实题源，而不是让 `Agent`（推荐逻辑）硬凑第三道题。

后续 P2.3 已进一步实现 `AI-assisted tag review`（AI 辅助标签审核）、`auto-approval gate`（自动通过门控）和本地审核 UI，见第 20 节；因此 P2.2 这里的“下一步”应理解为当时的阶段判断，而不是当前仍未完成的事项。

### 项目中的真实证据

- 代码：
  - `scripts/rag/practice-tag-taxonomy.mjs`（标签字典和中文展示名映射）
  - `scripts/rag/practice-tag-proposal-core.mjs`（根据题干和章节生成标签建议的核心逻辑）
  - `scripts/rag/build-practice-tag-proposals.mjs`（生成 `candidate_tag_proposals.json` 的 CLI 脚本）
  - `scripts/rag/enriched-practice-corpus-core.mjs`（把原始题库和标签建议合并成带标签题库的核心逻辑）
  - `scripts/rag/build-enriched-practice-corpus.mjs`（生成 `enriched_practice_corpus.json` 的 CLI 脚本）
  - `scripts/rag/practice-corpus-search-core.mjs`（按知识点、章节、目标能力和方法标签检索候选题）
  - `scripts/rag/variant-practice-agent-core.mjs`（把候选题选择成巩固题、近迁移题和综合应用题的 Agent 逻辑）
- 测试：
  - `scripts/tests/rag/practice-tag-taxonomy.test.mjs`（验证标签字典、中文别名归一化和方法标签派生）
  - `scripts/tests/rag/practice-tag-proposal-core.test.mjs`（验证规则标签建议、证据词、置信度和汇总统计）
  - `scripts/tests/rag/practice-tag-proposal-cli.test.mjs`（验证标签建议 CLI 的输入输出、错误处理和 stdout 安全边界）
  - `scripts/tests/rag/enriched-practice-corpus-core.test.mjs`（验证带标签题库生成、审核状态和非法标签拒绝）
  - `scripts/tests/rag/enriched-practice-corpus-cli.test.mjs`（验证带标签题库 CLI 的默认输出和错误处理）
  - `scripts/tests/rag/practice-corpus-search-core.test.mjs`（验证 enriched corpus 检索时只消费 approved 标签并跳过 needs_visual）
  - `scripts/tests/rag/variant-practice-agent-cli.test.mjs`（验证变式练习 Agent CLI 可以读取 corpus 并生成推荐 artifact）
- 文档：
  - `docs/superpowers/specs/2026-06-23-p22-metadata-tag-proposal-design.md`（P2.2 metadata / tag proposal，即题源元数据增强与标签建议的设计说明）
- 本地 `artifact`（本地生成的中间产物，不提交）：
  - `artifacts/rag/tag-proposals/candidate_tag_proposals.json`（机器生成的候选标签建议文件）
  - `artifacts/rag/tag-proposals/tag_proposal_summary.json`（标签建议汇总文件）
  - `artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json`（Agent 使用的带标签题库文件）
  - `artifacts/rag/enriched-practice-corpus/enrichment_summary.json`（带标签题库生成汇总文件）
  - `artifacts/rag/variant-practice-agent/recommendations.json`（变式练习推荐结果文件）
- 验证：
  - `node scripts/tests/rag/variant-practice-agent-cli.test.mjs`
  - `node scripts/run-tests.mjs default`
  - `npm run lint`
  - `npm run build`
  - `node scripts/rag/build-practice-tag-proposals.mjs --corpus artifacts/rag/practice-corpus/practice_corpus.json --out artifacts/rag/tag-proposals`
  - `node scripts/rag/build-enriched-practice-corpus.mjs --corpus artifacts/rag/practice-corpus/practice_corpus.json --proposals artifacts/rag/tag-proposals/candidate_tag_proposals.json --accept-rule-proposals --out artifacts/rag/enriched-practice-corpus`
  - `node scripts/rag/recommend-variant-practice.mjs --corpus artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json --query /tmp/mathtrace-p22-query.json --out artifacts/rag/variant-practice-agent --limit 12`

---

## 20. P2.3 Taxonomy-aware AI-assisted Tag Review MVP（基于标签体系的 AI 辅助标签审核）

### 当前状态

已完成本地 P2.3 `taxonomy-aware AI-assisted tag review`（基于标签体系的 AI 辅助标签审核）工具链实现，并通过分任务本地测试与子智能体审查。这个阶段没有把 AI 标签能力接入产品前端、数据库、`memory_events`（画像事件表）或 `student_profiles`（学生当前画像快照表），仍然只在本地 RAG 题源工具链里工作。

这一步的目标不是让 AI 直接决定题库标签，而是让 AI 承担 50% 以上的候选判断工作：AI 读取题干和规则建议，输出结构化 `proposal`（建议稿）；代码再用 `taxonomy`（标签体系）和 `auto-approval gate`（自动通过门控）检查它；风险题进入 `review queue`（人工审核队列）；最终进入 `enriched_practice_corpus.json`（Agent 使用的带标签题库文件）的只能是自动门控通过或人工审核后的 `review record`（标签审核记录）。

初始实现时，规则标签链路已经可完整执行：`build-practice-tag-proposals`（规则标签建议生成脚本）基于 69 道题生成标签建议，其中 57 道为 `high confidence`（高置信度）、1 道有 warning；`build-enriched-practice-corpus`（带标签题库生成脚本）生成 69 道 enriched item（带标签题库条目），其中 68 道 `approved`（已接受）、1 道 `needs_fix`（需要修正）；`recommend-variant-practice`（变式练习推荐脚本）从 12 道候选中推荐 2 道，并返回 `insufficient_approved_tagged_items`（已通过标签审核的题目不足）和 `no_mixed_application_with_related_method_tags`（没有找到带相关方法标签的综合应用题）。

后续本地配置 DeepSeek-compatible provider（兼容 OpenAI 协议的 DeepSeek 模型服务）后，又跑过一次 69 道题的真实 AI proposal smoke（真实 AI 标签建议冒烟验证）：`candidate_ai_tag_proposals.json`（AI 生成的候选标签建议文件）包含 69 道题，初始 gate（门控）产出 12 道 `auto approved`（自动通过）和 57 道 `needs review`（需要人工审核）。这次真实 smoke 暴露出一个问题：很多题不是标签明显错，而是 AI 返回的 `evidence_terms`（证据词）和 OCR/LaTeX 文本存在格式差异，触发 `invalid_evidence_terms_removed`（有证据词被清洗移除）。因此 P2.3 后续补了一个小的 evidence gate calibration（证据门控校准）：保留证据校验，但把“部分证据词被删”从一票否决改成审计信号。

### 功能价值

P2.2 的规则标签建议解决了“题库缺 metadata（结构化元数据）”的问题，但它仍然偏确定性关键词规则。规则便宜、可重复，但对题目语义的理解有限。例如一道题同时涉及参数、零点和单调性时，单靠关键词很容易多打或漏打标签；如果未来扩展到数列、解析几何、概率统计，继续手写每个专题的复杂规则会越来越重。

P2.3 的价值是把 AI 放到更像智能体的位置：它不是替代整个系统，而是在受控工具链里完成“理解题意、提出标签建议、给出依据”的工作。系统仍然保留 `taxonomy`（标签体系）、parser（解析器）、validator（校验器）、gate（门控）和 review UI（人工审核界面），所以 AI 的能力被用在最适合它的环节，最终数据质量仍由工程边界控制。

这也让 MathTrace 的 RAG 方向更像一个可解释的学习 Agent，而不是传统“文档切 chunk -> embedding -> top-k -> 拼 prompt”的黑盒检索。题库不是只被切成向量片段，而是被加工成带 `target_skills`（目标能力标签）、`method_tags`（解题方法标签）、`feature_flags`（题目特征标记）和审核证据的练习素材。后续推荐给学生的不是 top-k 原始搜索结果，而是经过 Agent 筛选的巩固题、近迁移题和综合应用题。

### 关键设计

P2.3 的完整数据流可以这样理解：

```text
practice_corpus.json
-> candidate_tag_proposals.json
-> candidate_ai_tag_proposals.json
-> merged_tag_proposals.json
-> auto_tag_review_records.json + tag_review_queue.json
-> tag_review_records.json
-> final_tag_review_records.json
-> enriched_practice_corpus.json
-> Variant Practice Agent
```

`practice_corpus.json`（人工审核后的原始练习题库文件）仍然是题目内容来源。它来自 P2.0 的 OCR/MinerU 抽题和人工题干审核，包含题干、章节、来源页码和检索文本，但不携带足够细的目标能力和方法标签。

`candidate_tag_proposals.json`（规则生成的候选标签建议文件）来自 P2.2。它用确定性规则给题目打第一版标签，并保留 `evidence_terms`（命中证据词）和 `source: "rule"`（标签来源为规则）。它的意义是给 AI 一个可参考的 baseline（基线建议），也给后续 gate 提供“规则和 AI 是否一致”的比较对象。

`candidate_ai_tag_proposals.json`（AI 生成的候选标签建议文件）是 P2.3 新增的 AI 建议稿。生成它的脚本是 `scripts/rag/build-ai-tag-proposals.mjs`（AI 标签建议生成 CLI 脚本），核心逻辑在 `scripts/rag/ai-tag-proposal-core.mjs`（AI 标签建议 prompt、解析和校验核心逻辑）。AI 输入里会包含题干摘要、规则标签建议和 taxonomy 允许的标签范围；AI 输出必须收敛到项目允许的 `target_skills`（目标能力标签）、`method_tags`（解题方法标签）和 `feature_flags`（题目特征标记），不能自由创造中文标签或新 key。

AI 还必须返回 `evidence_terms`（证据词），说明它为什么给出某个标签。`parseAiTagProposalResponse`（解析并清洗 AI 标签建议响应的函数）会检查每个 `evidence_terms`（证据词）是否能在 `question_text`（题干文本）、`search_text`（检索文本）、章节标题或规则标签证据中找到。如果找不到，这个证据词会被移除，并记录到 `removed_evidence_terms`（被清洗移除的证据词列表字段），每条记录包含 `group`（标签组，例如 target_skills）、`tag`（标签 key）、`term`（被移除的证据词）和 `reason`（移除原因）。这样系统不是简单相信 AI 的解释，而是要求 AI 的标签建议能回到题目原文或规则证据上。

这里的 `taxonomy`（标签体系）是 P2.3 的核心治理层。当前版本是 `math_derivative_v0`（数学导数专题第一版标签体系），定义在 `scripts/rag/practice-tag-taxonomy.mjs`（练习题标签体系和展示名映射文件）里。它包含：

- `subject`（学科）：当前是 `math`（数学）。
- `unit`（单元/专题）：当前是 `derivative`（导数）。
- `target_skills`（目标能力标签集合）：例如 `tangent_slope`（切线斜率）、`monotonicity`（单调性）、`extrema`（极值最值）、`zero_point`（零点）、`parameter_range`（参数范围）。
- `method_tags`（解题方法标签集合）：例如 `derivative_definition`（导数定义式）、`monotonicity_by_derivative`（用导数判断单调性）、`parameter_classification`（参数分类讨论）。
- `feature_flags`（题目特征标记集合）：例如 `has_choice_options`（选择题）、`has_fill_blank`（填空题）、`has_ln_exp`（含对数或指数）、`has_square_root`（含根号）、`needs_visual`（必须看原图）。
- `target_skill_to_method_tags`（目标能力到方法标签的映射）：用于从目标能力派生合理的方法标签，避免 AI 给出和目标能力不匹配的方法。

P2.3b 又补了一个真实运行中暴露出来的 taxonomy gap（标签体系缺口）：基础求导题。真实 `tag_review_queue.json`（人工标签审核队列文件）里出现了少量 `missing_ai_target_skill`（AI 缺少目标能力标签），其中真正属于导数 taxonomy 缺口的，是“已知函数，求 `f'(x)`（导函数）”这一类题。于是我在 `scripts/rag/practice-tag-taxonomy.mjs`（练习题标签体系和展示名映射文件）里新增 `derivative_calculation`（求导运算）这个 `target_skill`（目标能力标签），并只新增三个当前题源能支撑的方法标签：`quotient_rule`（商法则）、`logarithmic_derivative_formula`（对数函数求导）和 `power_function_derivative`（幂函数求导）。

这里没有直接让 AI 自由补标签，也没有一次性补全 `product_rule`（乘积法则）、`chain_rule`（链式法则）或全高中数学 taxonomy。原因是 taxonomy 是正式标签空间，必须能被测试和真实题例支撑。P2.3b 的规则识别也很窄：`scripts/rag/practice-tag-proposal-core.mjs`（规则标签建议核心文件）只有在题干或检索文本出现 `f'(x)=`、`导函数`、`求...导数` 或 `求...导函数` 这类明确求导信号时，才会建议 `derivative_calculation`（求导运算）。如果只是 `section_title`（章节标题）里有“导数”，但题干实际是集合、命题或组合题，就不会被误标为求导题。这把“taxonomy 扩展”和“corpus 污染”分开处理：前者补受控标签，后者留给题库清洗或人工审核。

这个设计解决了“以后扩展到更多考点会不会每次重写系统”的问题。未来新增数列、解析几何或概率统计时，理想路径不是重写所有脚本，而是新增或扩展 taxonomy 配置，例如 `math_sequence_v0`（数学数列专题第一版标签体系）或 `math_analytic_geometry_v0`（数学解析几何专题第一版标签体系）。脚本继续读取 taxonomy，AI prompt 继续按 taxonomy 限定输出，merge gate 继续按 taxonomy 校验标签。也就是说，可变的是标签字典和少量规则，稳定的是 proposal、gate、review 和 enriched corpus 这条流程。

`merged_tag_proposals.json`（规则与 AI 合并后的标签建议文件）由 `scripts/rag/merge-tag-proposals.mjs`（规则与 AI 标签建议合并 CLI 脚本）生成，核心逻辑在 `scripts/rag/tag-proposal-merge-core.mjs`（标签建议合并和自动门控核心逻辑）。它会同时看规则建议和 AI 建议，然后决定每道题能否自动通过。

自动通过门控是保守的。只有满足这些条件的题才进入 `auto_tag_review_records.json`（自动通过的标签审核记录文件）：

- AI 正常参与门控时，`item_confidence`（整题标签置信度）必须是 `high`（高）。
- AI 正常参与门控时，不能带 `invalid_ai_json`（AI JSON 非法）、`invalid_ai_schema`（AI schema 非法）、`unknown_tag_removed`（未知标签被移除）等结构性 invalid warning（非法输出警告）。但如果 AI 偶发返回坏 JSON，且 rule proposal（规则标签建议）已经给出明确目标能力，P2.3e 起可以走 `rule_only_fallback`（只用规则标签兜底）自动通过；这个兜底路径只采用 rule tags（规则标签），不会把 AI 在无目标能力监督下给出的 `method_tags`（解题方法标签）或 `feature_flags`（题目特征标记）合并进去。
- `invalid_evidence_terms_removed`（有证据词被清洗移除）不再一票否决。P2.3d 起，证据词只作为审计信息进入 `ai_evidence_terms_partially_removed`（AI 部分证据词被移除），不再因为“求导”这类隐含证据没有逐字出现在题干里就转人工审核。
- AI 如果没有给出 `target_skill`（目标能力标签），但 rule proposal 已经给出明确目标能力，可以用 rule-only fallback 自动通过；如果两边都没有目标能力，才进入人工审核。
- 如果规则和 AI 都有目标能力标签，二者至少要有交集，否则进入 `target_skill_conflict`（目标能力冲突）。
- 规则或 AI 只要标出 `needs_visual`（必须看原图），就不能自动通过，因为当前 Variant Practice Agent 是文本推荐逻辑。
- `method_tags`（解题方法标签）和非图像类 `feature_flags`（题目特征标记）允许 AI 补充，但必须是 taxonomy 已定义标签；这些字段不再因为证据词为空而阻断自动通过。
- rule 或 AI 如果标出 `has_graph`（含图像/图象信息）这类图像依赖信号，仍然要保守进入人工审核。

未通过的题进入 `tag_review_queue.json`（人工标签审核队列文件）。它包含 `question_text`（题干文本）、`section_title`（章节标题）、`rule_tags`（规则建议标签）、`ai_tags`（AI 建议标签）、`gate_reasons`（门控未通过原因）和 `recommended_review_status`（建议审核状态）。这个队列的意义是把人工精力集中到真正有风险的题，而不是让人从 69 道题重新逐题标注。

`scripts/rag/build-tag-review-ui.mjs`（标签审核界面生成 CLI 脚本）会把 review queue 生成一个本地静态 HTML 页面，核心渲染逻辑在 `scripts/rag/tag-review-ui-core.mjs`（标签审核 UI 数据与 HTML 生成核心逻辑）。这个页面不接数据库、不上云，只用于本地人工复核。人工可以看到规则和 AI 的差异，修正 `target_skills`（目标能力标签）、`method_tags`（解题方法标签）和 `feature_flags`（题目特征标记），再导出 `tag_review_records.json`（人工标签审核记录文件）。

`scripts/rag/merge-tag-review-records.mjs`（自动与人工审核记录合并 CLI 脚本）会把 `auto_tag_review_records.json`（自动通过记录）和 `tag_review_records.json`（人工审核记录）合并成 `final_tag_review_records.json`（最终标签审核记录文件）。如果同一道题同时存在自动记录和人工记录，人工记录覆盖自动记录；自动记录顺序保持，人工新增记录追加。这样可以明确表达：AI 可以参与生成和自动门控，但人工修正永远优先。

最后，`scripts/rag/build-enriched-practice-corpus.mjs`（带标签题库生成 CLI 脚本）读取 `final_tag_review_records.json`（最终标签审核记录文件），把审核后的标签写入 `enriched_practice_corpus.json`（Agent 使用的带标签题库文件）。P2.3 还把 `taxonomy_id`（标签体系版本）、`review_origin`（审核来源，例如 auto_gate）、`ai_confidence`（AI 置信度）和 `rule_ai_agreement`（规则与 AI 一致性摘要）保留到 `tag_review_meta`（标签审核元信息）里。这些字段只用于审计、评估和面试解释，不参与检索排序，也不写入学生画像。

### 技术决策与取舍

第一个取舍是：AI 只做 proposal（建议稿），不做 final truth（最终事实）。这是和 `memory_events`（画像事件表）/ `student_profiles`（学生当前画像快照表）相同的安全思路。模型擅长理解题干，但不应该静默修改系统事实。P2.3 让 AI 的输出先经过 parser（解析器）、taxonomy validator（标签体系校验器）和 gate（门控），再进入 review records（审核记录），最终才被 enriched corpus（带标签题库）消费。

第二个取舍是：先做 OpenAI-compatible provider boundary（兼容 OpenAI 协议的模型服务边界），不绑定某一家模型。`build-ai-tag-proposals.mjs`（AI 标签建议生成 CLI 脚本）只在本地 provider 配置存在时调用模型；测试全部使用 fake provider response（伪模型响应），不联网、不需要真实密钥。这样项目可以后续换 GLM、DeepSeek 或其他兼容接口，而不把 provider 细节散落到 merge、review UI 和 Agent 推荐逻辑里。

第三个取舍是：自动通过门控要保守，但不能让 AI 偶发失败变成单点阻塞。高置信度且规则与 AI 一致的题可以自动通过，降低人工审核量；如果 AI 返回坏 JSON 或空标签，但 rule proposal（规则标签建议）已经明确识别出目标能力，P2.3e 起可以走 `rule_only_fallback`（只用规则标签兜底）自动通过，并且最终标签只取规则侧结果。真正需要进 review queue（人工审核队列）的，是目标能力完全冲突、规则和 AI 都缺目标能力、需要图像或 AI 输出无法由规则兜底的题。

第四个取舍是：证据校验不删除，但从“硬拦截”校准为“审计信号”。真实 AI proposal smoke（真实 AI 标签建议冒烟验证）发现，`invalid_evidence_terms_removed`（有证据词被清洗移除）经常来自 OCR、LaTeX、空格、转义差异，或者来自“切线方程隐含要求求导”这类合理推理，不一定代表标签错。因此 `ai-tag-proposal-core.mjs`（AI 标签建议清洗核心文件）继续清洗并记录 `removed_evidence_terms`（被移除证据词列表），但 `tag-proposal-merge-core.mjs`（标签建议合并和门控核心文件）不再用 evidence 缺失作为自动通过硬门槛。这样既保留可追溯性，又避免把证据词格式误差变成人工审核噪音。

第五个取舍是：允许 AI 补充 metadata（元数据），但不允许它绕过 gate（门控）直接写最终事实。P2.3d 里，`tag-proposal-merge-core.mjs`（标签建议合并和门控核心文件）把自动通过规则收敛成更简单的交集判断：只要 rule 和 AI 的 `target_skills`（目标能力标签）有交集，AI 高置信、输出合法且不依赖图像，就可以自动通过。`method_tags`（解题方法标签）和非视觉 `feature_flags`（题目特征标记）只作为 additive metadata（补充元数据）合并进最终标签。例如规则只识别出切线斜率题，AI 额外指出题干里有 `ln x`（自然对数表达）和参数 `a`，系统可以把 `logarithmic_derivative_formula`（对数求导公式）和 `has_parameter`（含参数）补进最终标签。这里放宽的是检索和推荐会用到的辅助 metadata，不是目标能力的事实边界；`target_skills`（目标能力标签）完全冲突、`needs_visual`（依赖图像）、低置信度或非法输出仍然会进入人工审核队列。

第六个取舍是：taxonomy gap（标签体系缺口）由工程补丁收口，不交给 AI 在运行时自由扩展。P2.3b 里 AI 可以暴露出“这类题没有合适标签”的问题，但正式新增 `derivative_calculation`（求导运算）和相关 `method_tags`（解题方法标签）必须写进 `practice-tag-taxonomy.mjs`（练习题标签体系文件），并用 `practice-tag-taxonomy.test.mjs`（标签体系测试）、`practice-tag-proposal-core.test.mjs`（规则标签建议测试）、`enriched-practice-corpus-core.test.mjs`（带标签题库测试）和 `variant-practice-agent-core.test.mjs`（变式练习 Agent 测试）锁住行为。这样做牺牲了一点扩展速度，但避免 AI 造出系统没有定义、也不能稳定检索的标签。

第七个取舍是：不在 P2.3 上 pgvector（Postgres 向量检索扩展）和 embedding（文本向量表示）。P2.3 解决的是标签质量和审核效率，不是大规模语义召回。等 taxonomy、review records 和 enriched corpus 稳定之后，再做 embedding_text（用于生成向量的文本字段）和 pgvector prototype（向量检索原型）会更稳。

### 性能收益（如适用）

P2.3 的主要收益不是线上响应速度，而是人工标注效率和验证效率。原来如果人工想修正题库标签，理论上要从所有题目逐题判断；现在机器先生成 rule proposal（规则建议）和 AI proposal（AI 建议），自动门控只把冲突、低置信度、缺标签或图像依赖题放进 review queue（人工审核队列），人工只处理高风险子集。

另一个收益是测试反馈更稳定。P2.3 新增的核心模块都用 synthetic fixture（合成测试数据）覆盖，不依赖真实教辅题、真实 provider、网络或密钥。`scripts/run-tests.mjs`（本地测试聚合脚本）也把 P2.3 的 AI proposal、merge gate、review UI、review record merge 测试纳入 default suite（默认测试套件），后续改动能快速发现是否破坏 RAG 工具链。

本次真实 smoke 里，provider 未配置时没有伪造 AI 调用，这是有意保守：能跑的规则/enriched/Variant Agent 链路真实跑通，AI proposal 真实链路等 provider 配置后再跑。这样文档和演示不会把 fake response（伪响应）包装成真实模型效果。

### 面试官可能怎么问

1. P2.3 为什么说更像智能体，而不只是传统 RAG？
2. 为什么 AI 不直接写最终标签？
3. `taxonomy_id`（标签体系版本）解决什么问题？
4. 如果扩展到数列、解析几何或其他科目，是不是要重写系统？
5. 自动通过门控具体怎么判断一题能不能通过？
6. `tag_review_queue.json`（人工标签审核队列文件）和 `tag_review_records.json`（人工标签审核记录文件）有什么区别？
7. 为什么当前真实 smoke 没有跑 AI provider？
8. 这些标签以后和 embedding / pgvector 怎么结合？
9. AI 标签错误会不会污染学生画像？
10. P2.3 和 P2.2 最大区别是什么？
11. 如果 AI 返回的证据词和 OCR/LaTeX 原文对不上，为什么不直接判失败？

### 推荐回答

我会这样回答：

P2.3 的核心是让 AI 参与题源理解，但不让 AI 越权。P2.2 只有 deterministic rules（确定性规则），它能快速给出第一版标签，但对复杂题意理解有限。P2.3 增加 AI tag proposal（AI 标签建议）：AI 可以读题干和规则建议，判断这题更像切线斜率、单调性、零点还是参数范围，并给出 evidence terms（证据词）和 rationale（理由）。但 AI 输出不会直接进入正式题库，而是必须经过 taxonomy（标签体系）校验和 auto-approval gate（自动通过门控）。

这里的 taxonomy 很关键。当前是 `math_derivative_v0`（数学导数专题第一版标签体系），它规定 AI 只能从允许的 `target_skills`（目标能力标签）、`method_tags`（解题方法标签）和 `feature_flags`（题目特征标记）里选择，不能自由发明标签。未来扩展到数列或解析几何，不是重写整条链路，而是新增对应 taxonomy，让相同的 proposal、merge、review 和 enriched corpus 流程继续复用。

P2.3b 里我处理过一个具体例子：基础求导题没有合适的 `target_skill`（目标能力标签）。AI 和 review queue 能暴露这个 gap，但我没有让 AI 在运行时自造“求导运算”标签，而是把 `derivative_calculation`（求导运算）正式加入 taxonomy，再补规则、parser、merge、enriched corpus 和 Variant Agent 的回归测试。这说明 AI 是辅助发现问题和提出建议的 agentic worker（智能协作者），但系统事实空间仍由受控 schema 和测试维护。

自动通过门控是保守但不复杂的设计。正常情况下，只有 AI 高置信度、输出合法、规则和 AI 目标能力有交集、题目不依赖图像时，系统才会生成 `auto_tag_review_records.json`（自动通过的标签审核记录文件）。P2.3d 之后，AI 可以补充 rule 漏掉的 `method_tags`（解题方法标签）和非视觉 `feature_flags`（题目特征标记），但这些补充必须来自 taxonomy 允许的标签，不能现场发明。P2.3e 又补了一层 rule-only fallback：如果 AI 偶发失败但 rule proposal 已经有明确 `target_skills`（目标能力标签），系统可以直接采用规则标签自动通过，并且不合并 AI additive tags（AI 补充标签）。目标能力完全冲突、规则和 AI 都缺目标能力、图像依赖、且无法规则兜底的题仍然进入 `tag_review_queue.json`（人工标签审核队列文件）。最终 `final_tag_review_records.json`（最终标签审核记录文件）里，人工记录可以覆盖自动记录。

当前本地真实链路的结果是：69 道导数题中 64 道生成 `auto_tag_review_records.json`（自动通过的标签审核记录文件），5 道仍留在 `tag_review_queue.json`（人工标签审核队列文件）。`enriched_practice_corpus.json`（带标签题库文件）会保留 `proposed`（有建议但未通过审核）和 `needs_fix`（需要修正）条目用于审计，但 Variant Practice Agent（变式练习推荐 Agent）必须通过 `searchPracticeCorpus`（题库检索函数）只消费 `approved`（已通过审核）的题目。

为了让当前 demo 能稳定展示 3 道练习，Variant Practice Agent（变式练习推荐 Agent）增加了一个很薄的 `additional_practice`（补充练习题）兜底：如果严格的 `foundation`（巩固题）、`near_transfer`（近迁移题）、`mixed_application`（综合应用题）凑不满 3 道，就从 approved 候选里选 1 道标签相近题补位，并保留 `demo_fill_used`（演示补位已启用）warning。这个设计不改变推荐算法的质量判断，也不会把补位题伪装成综合应用题，只是让演示链路更完整。

证据词校验这块我做过一次校准。AI 输出的 `evidence_terms`（证据词）仍然会尝试在题干、检索文本或规则证据里匹配；找不到的会进入 `removed_evidence_terms`（被清洗移除的证据词列表）。但 P2.3d 不再把 evidence 缺失作为一票否决，因为真实教辅 OCR、LaTeX 表达和隐含数学推理都会让“证据词逐字匹配”产生误伤。现在的策略是：evidence 用来审计和后续 prompt 优化，自动通过主要看规则与 AI 的目标能力是否有交集。这个设计让 gate（门控）更贴近 MVP：先把明显可用的题进入题库，把人工审核留给目标能力冲突、低置信度、非法输出和图像依赖。

这和传统 RAG 不太一样。传统链路常见是文档切 chunk、做 embedding、进向量库、top-k 检索、拼进 prompt。MathTrace 这一步先做的是题源理解和练习推荐 Agent 的可解释 metadata：一道题练什么、怎么解、有什么题型限制。后续当然可以把 `enriched_practice_corpus.json`（带标签题库文件）再做 embedding 和 pgvector 检索，但向量召回不会替代 taxonomy、review records 和 Agent 推荐规则。

AI 标签也不会污染学生画像。P2.3 全部在本地 RAG 题源工具链里，产物是 corpus artifact（题库中间产物），不写 `memory_events`（画像事件表），不写 `student_profiles`（学生当前画像快照表），也不影响 evidence API（画像证据接口）。学生画像仍然只由确认后的诊断证据驱动。

P2.5 把本地 Variant Practice Agent（变式练习推荐 Agent）的结果接入产品工作台，但只接入经过裁剪的 `ProductVariantPractice`（产品展示模型）。服务端通过 `src/lib/server/rag/variant-practice-product-loader.ts`（服务端本地推荐结果读取器）读取 ignored 的 `recommendations.json`（本地推荐结果文件），再调用 `src/lib/rag/variant-practice-product-view-model.ts`（产品展示模型转换器）把原始 artifact 转成只包含题型、题干、产品侧推荐文案和自然语言提示的前端数据。正式页面由 `src/app/page.tsx`（Next.js 首页服务端组件）把数据传给 `src/components/mathtrace-workbench.tsx`（MathTrace 工作台组件），再交给 `src/components/workbench/practice-lab.tsx`（变式练习展示组件）渲染 3 张练习卡。页面不展示 `score`（检索分数）、`matched_dimensions`（命中维度）、`target_skill`（目标能力标签）、`method_tag`（方法标签）、`item_id`（内部题目 ID）、raw reason（原始推荐理由）或 raw warning（原始调试提示），而是按 `foundation`（巩固题）、`near_transfer`（近迁移题）和 `additional_practice`（补充练习题）生成学生能看懂的文案。这样 P2.5 解决的是“把本地 RAG/Agent 推荐变成可演示产品能力”，不是引入线上检索 API、数据库写入或新的画像事实层。

### 可能被继续追问

- 如果 AI 和规则都错了，人工审核怎么发现？
- `taxonomy`（标签体系）扩到多个专题后，如何管理版本和废弃标签？
- 自动通过阈值如何评估，能不能用历史人工审核结果校准？
- `removed_evidence_terms`（被清洗移除的证据词列表）以后要不要进入审核 UI（标签审核界面）直接展示？
- AI provider 返回格式变了怎么办？
- 为什么 review UI 仍然是本地静态页面，而不是直接接入主应用？
- 如果题目包含图像，文本标签体系如何和图像 crop（题图切片）结合？
- 后续怎么把 `final_tag_review_records.json`（最终标签审核记录文件）迁移到数据库？

### 反思与后续优化

P2.3 已经在本地工具链层面把“AI 做多数标签建议，人类只审核风险题”的闭环搭起来，并且本地跑过一次 provider 配置后的全量 AI proposal smoke。下一步需要把 evidence gate calibration（证据门控校准）的评估报告做得更显式：统计哪些题触发 `invalid_evidence_terms_removed`（有证据词被清洗移除）、被删掉的 `removed_evidence_terms`（被清洗移除的证据词列表）是什么、校准前后 auto approved（自动通过）数量变化多少，再决定是否把这些信息展示到 tag review UI（标签审核界面）。

另一个后续方向是把 taxonomy 从导数专题扩成可组合配置。当前 `math_derivative_v0` 证明了结构，但多专题以后需要治理标签命名、版本升级、同义词、跨专题方法标签和废弃标签迁移。这个问题应该用 taxonomy registry（标签体系注册表）解决，而不是让每个脚本里硬编码不同专题。

最后，P2.3 仍然是本地工具链，不是产品页面。等 AI proposal 和人工审核质量稳定后，可以再决定是做一个主应用里的内部审核页，还是继续保持本地 artifact 工作流。当前阶段选择本地静态 UI，是为了不把题源治理和学生端 demo 混在一起。

### 项目中的真实证据

- 代码：
  - `scripts/rag/practice-tag-taxonomy.mjs`（练习题标签体系、标签展示名和 taxonomy registry）
  - `scripts/rag/practice-tag-proposal-core.mjs`（规则标签建议核心逻辑，包含 P2.3b 的求导运算窄触发规则）
  - `scripts/rag/ai-tag-proposal-core.mjs`（AI 标签建议 prompt、解析、归一化、证据词清洗和 `removed_evidence_terms`（被移除证据词列表）记录核心逻辑）
  - `scripts/rag/build-ai-tag-proposals.mjs`（生成 AI 标签建议 artifact 的 CLI 脚本）
  - `scripts/rag/tag-proposal-merge-core.mjs`（规则建议与 AI 建议合并、基于 target skill 交集的自动通过门控核心逻辑）
  - `scripts/rag/merge-tag-proposals.mjs`（生成 merged proposals、auto review records 和 review queue 的 CLI 脚本）
  - `scripts/rag/tag-review-ui-core.mjs`（本地标签审核 UI 数据和 HTML 生成核心逻辑）
  - `scripts/rag/build-tag-review-ui.mjs`（生成本地标签审核静态页面的 CLI 脚本）
  - `scripts/rag/merge-tag-review-records.mjs`（合并自动审核记录与人工审核记录的 CLI 脚本）
  - `scripts/rag/enriched-practice-corpus-core.mjs`（把最终审核标签写入带标签题库，并保留 P2.3 审计字段）
  - `src/lib/rag/variant-practice-product-view-model.ts`（P2.5 产品展示模型转换器，裁剪内部字段并重写推荐理由）
  - `src/lib/rag/variant-practice-demo-config.ts`（P2.5 默认样例与推荐 query 的共享配置）
  - `src/lib/server/rag/variant-practice-product-loader.ts`（P2.5 服务端本地推荐结果读取器）
  - `src/components/workbench/practice-lab.tsx`（P2.5 变式练习产品卡片展示组件）
  - `scripts/run-tests.mjs`（把 P2.3 测试纳入 default 测试套件）
- 测试：
  - `scripts/tests/rag/practice-tag-taxonomy.test.mjs`（验证 taxonomy registry、允许标签集合和兼容导出）
  - `scripts/tests/rag/practice-tag-proposal-core.test.mjs`（验证规则标签建议、求导运算识别和非导数污染题不误标）
  - `scripts/tests/rag/ai-tag-proposal-core.test.mjs`（验证 AI 标签建议 prompt、解析、非法标签过滤和 `removed_evidence_terms`（被移除证据词列表）记录）
  - `scripts/tests/rag/ai-tag-proposal-cli.test.mjs`（验证 AI 标签建议 CLI、fake provider 和 stdout 安全边界）
  - `scripts/tests/rag/tag-proposal-merge-core.test.mjs`（验证规则与 AI 建议合并、自动通过、review queue 原因和 evidence warning 门控校准）
  - `scripts/tests/rag/tag-proposal-merge-cli.test.mjs`（验证 merge CLI 输入输出和默认路径）
  - `scripts/tests/rag/tag-review-ui-core.test.mjs`（验证审核 UI 数据构造和导出记录兼容性）
  - `scripts/tests/rag/tag-review-ui-cli.test.mjs`（验证审核 UI CLI 生成静态页面和敏感输出边界）
  - `scripts/tests/rag/tag-review-record-merge-cli.test.mjs`（验证自动/人工审核记录合并、覆盖顺序和 stdout 安全边界）
  - `scripts/tests/rag/enriched-practice-corpus-core.test.mjs`（验证 P2.3 审计字段进入 `tag_review_meta`，旧记录缺字段保持兼容）
  - `scripts/tests/rag/variant-practice-agent-core.test.mjs`（验证新增 `derivative_calculation`（求导运算）标签能驱动变式练习推荐）
  - `scripts/tests/rag/variant-practice-product-view-model.test.mjs`（验证 P2.5 产品展示模型字段裁剪、推荐理由重写和题干污染过滤）
  - `scripts/tests/rag/variant-practice-product-loader.test.mjs`（验证 P2.5 服务端 loader 的缺文件、坏 JSON 和 query id 不匹配回退）
  - `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`（验证 P2.5 工作台只消费裁剪后的变式练习 view model，且不展示内部 RAG 字段）
- 文档：
  - `docs/superpowers/specs/2026-06-24-p23-ai-assisted-tag-review-design.md`（P2.3 AI 辅助标签审核设计说明）
  - `docs/superpowers/plans/2026-06-24-p23-ai-assisted-tag-review.md`（P2.3 实施计划）
- 本地 `artifact`（本地生成的中间产物，不提交）：
  - `artifacts/rag/ai-tag-proposals/candidate_ai_tag_proposals.json`（AI 生成的候选标签建议文件，provider 配置后生成）
  - `artifacts/rag/tag-review/merged_tag_proposals.json`（规则与 AI 合并后的标签建议文件，provider 配置后生成）
  - `artifacts/rag/tag-review/auto_tag_review_records.json`（自动通过的标签审核记录文件，provider 配置后生成）
  - `artifacts/rag/tag-review/tag_review_queue.json`（需要人工复核的标签审核队列文件，provider 配置后生成）
  - `artifacts/rag/tag-review/tag_review_records.json`（人工从审核 UI 导出的标签审核记录文件）
  - `artifacts/rag/tag-review/final_tag_review_records.json`（自动和人工合并后的最终标签审核记录文件）
- 验证：
  - `node scripts/run-tests.mjs default`
  - `node scripts/tests/rag/enriched-practice-corpus-core.test.mjs`
  - `node scripts/tests/rag/variant-practice-agent-core.test.mjs`
  - `node scripts/tests/rag/tag-review-record-merge-cli.test.mjs`
  - `node scripts/rag/build-practice-tag-proposals.mjs --corpus artifacts/rag/practice-corpus/practice_corpus.json --out artifacts/rag/tag-proposals`
  - `node scripts/rag/build-enriched-practice-corpus.mjs --corpus artifacts/rag/practice-corpus/practice_corpus.json --proposals artifacts/rag/tag-proposals/candidate_tag_proposals.json --accept-rule-proposals --out artifacts/rag/enriched-practice-corpus`
  - `node scripts/rag/recommend-variant-practice.mjs --corpus artifacts/rag/enriched-practice-corpus/enriched_practice_corpus.json --query artifacts/rag/variant-practice-agent/demo-query.json --out artifacts/rag/variant-practice-agent --limit 12`
  - P2.5 产品页 HTML smoke：本地打开 `http://localhost:3000` 后检查 `巩固题`、`近迁移题`、`补充练习题` 出现，并确认 `matched_dimensions`、`score`、`target_skill`、`method_tag`、`source_candidate_id` 等内部字段不出现在 HTML 中。
  - AI proposal 真实 provider smoke：本地配置 DeepSeek-compatible provider（兼容 OpenAI 协议的 DeepSeek 模型服务）后，已生成 69 道题的 `candidate_ai_tag_proposals.json`（AI 生成的候选标签建议文件），并生成 `merged_tag_proposals.json`（规则与 AI 合并后的标签建议文件）、`auto_tag_review_records.json`（自动通过的标签审核记录文件）和 `tag_review_queue.json`（需要人工复核的标签审核队列文件）。这些文件属于本地 ignored artifact（被 Git 忽略的本地产物），不提交。

---

## 21. P2.7 Dynamic Variant Practice（上传题后的动态变式练习）

### 当前状态

已完成实现和本地验证，待完成本地 Claude Code 审查。这个阶段把 P2.5 的静态推荐 artifact 推进到确认上传题后的只读动态推荐 API：上传题经 `/api/confirm` 生成诊断报告后，前端再异步请求 `POST /api/variant-practice`，服务端基于诊断摘要从本地增强题库中推荐 3 道变式练习。

### 功能价值

P2.5 能在产品页展示真实教辅题库里的练习题，但推荐仍绑定默认样例题 artifact。P2.7 让“上传题诊断 -> 下一步练什么”形成产品闭环：同一个学生上传不同导数题，练习区可以基于本次知识点、错因和题干信号动态推荐，而不是永远展示同一份预生成结果。

### 关键设计

P2.7 没有把 RAG 合进 `/api/confirm`。诊断和画像写入仍走原来的确认链路；RAG 是独立的只读 API。这样 artifact 缺失、题库 JSON 损坏、Agent 模块加载失败或推荐不足，都不会影响诊断报告、错题本写入、`memory_events` 或 `student_profiles`。

动态 Practice Query 的专题归属先看 `knowledge_points`，只支持导数专题。`classification_missing` 这类跨专题错因不能单独把数列或函数定义域题路由到导数题库，只能在已确认导数专题后作为辅助信号。上传题没有 `section_title`，所以服务端用受控映射推导导数章节；如果目标章节在 corpus 中不存在，就降级为只用知识点和目标能力标签搜索。

前端展示仍只消费 `ProductVariantPractice`。正式页面不展示 `score`、`matched_dimensions`、`item_id`、`source_candidate_id`、raw reason 或 raw warnings。动态请求失败时，练习区保持诊断响应自带的 `practice_questions`，避免学生看到空状态。

### 技术决策与取舍

我选择新增 `POST /api/variant-practice`，而不是扩大 `/api/confirm`，是因为 RAG 推荐不是诊断事实，也不是画像写入依据。把它放成独立只读接口，可以让主诊断路径继续稳定，RAG 失败只影响练习展示，不影响报告本身。

第一版坚持“动态 RAG 成功就展示 3 道，否则回退”，是为了保持 P2.5 三卡片演示体验一致。这个策略牺牲了一些部分可用性，但避免把 1-2 道半成品推荐包装成完整练习链路。后续题库更大或 UI 支持不满 3 道提示后，可以放宽为 1-2 道 + notice。

### 性能收益（如适用）

动态推荐不调用模型、不访问数据库、不走网络题库，只读取本地 ignored artifact 并运行确定性 Agent。前端也不等待它完成才展示诊断报告，而是先显示 fallback 练习题，RAG 成功后替换，因此不会拉长 `/api/confirm` 主流程。

### 面试官可能怎么问

1. 为什么不把 RAG 直接放进 `/api/confirm`？
2. 上传题没有章节标题，你怎么构造 RAG query？
3. 怎么避免非导数题误召回导数题库？
4. RAG 推荐会不会污染学生画像？
5. 为什么动态推荐不足 3 道就回退？
6. 前端怎么避免旧请求覆盖新报告？
7. 为什么只返回 product view model，不返回 score 和 source ref？

### 推荐回答

我会这样回答：

P2.7 的重点是把 RAG 变成“下一步练什么”的只读题源服务，而不是把它变成诊断事实来源。`/api/confirm` 仍然负责用户确认、证据等级、错因诊断、`memory_delta` 和可选持久化；`/api/variant-practice` 只负责在报告完成后，根据诊断摘要找 3 道练习题。这样 RAG artifact 坏了，学生还是能看到诊断报告和 fallback 练习题。

上传题没有章节标题，所以我没有让前端传自由章节名，而是在服务端按受控规则从知识点和题干信号推导。专题归属必须先看 `knowledge_points`，例如 `derivative_monotonicity` 或 `parameter_classification`。`classification_missing` 只是跨专题错因，不能单独决定导数路由，这避免了数列分类讨论题被错误推荐导数参数题。

RAG 输出不会写画像。它不写 `memory_events`、不改 `student_profiles`、不影响 `memory_delta.should_persist`。它返回的也不是 raw Agent artifact，而是裁剪后的 `ProductVariantPractice`：只包含题型、题干和学生可读理由，隐藏内部标签、分数和调试字段。

### 可能被继续追问

- 多专题题库接入后，query 映射如何从硬编码演进为 taxonomy registry？
- 什么时候允许返回 1-2 道动态推荐？
- 真实 corpus 足够大后，是否还需要 pgvector？
- 如何评估动态推荐质量，而不是只看是否凑满 3 道？

### 反思与后续优化

P2.7 仍然是 demo-scoped：固定 `demo_student_001`，只支持导数专题，题库来自本地 ignored artifact。下一步更合理的是增加动态推荐质量评估和多专题 taxonomy 映射，而不是马上引入登录、老师端或向量数据库。

### 项目中的真实证据

- 代码：
  - `src/app/api/variant-practice/route.ts`
  - `src/lib/rag/dynamic-variant-practice-query.ts`
  - `src/lib/server/rag/dynamic-variant-practice-service.ts`
  - `src/lib/rag/dynamic-variant-practice-client.ts`
  - `src/components/mathtrace-workbench.tsx`
- 测试：
  - `scripts/tests/rag/dynamic-variant-practice-query.test.mjs`
  - `scripts/tests/rag/dynamic-variant-practice-service.test.mjs`
  - `scripts/tests/rag/dynamic-variant-practice-client.test.mjs`
  - `scripts/tests/ui/mathtrace-workbench-ui.test.mjs`
  - `scripts/tests/smoke/api-smoke.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-06-26-p27-dynamic-variant-practice-design.md`
  - `docs/superpowers/plans/2026-06-26-p27-dynamic-variant-practice.md`
- 验证：
  - `node scripts/run-tests.mjs default`
  - `npm run test:smoke`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`

---

## 22. P2.8 GLM-OCR 在线图片抽取 Provider

### 当前状态

已完成本地实现和 fake provider 验证，真实 GLM-OCR smoke 取决于本地是否配置 `VISION_PROVIDER_API_KEY`。这个阶段没有改变 `/api/confirm`、画像写入 gate 或 P2.7 RAG 推荐边界，而是在现有 `VisionExtractionProvider` 下新增 `VISION_PROVIDER_PROTOCOL=glm_ocr` 可选分支。

### 功能价值

真实上传题链路曾出现通用视觉模型 HTTP/JSON 成功、但响应里没有可解析文本内容的问题，导致题干无法进入确认表单。P2.8 把在线图片抽取补充为 OCR/layout 专用 provider：先用 GLM-OCR 稳定得到题干和可能的学生作答草稿，再交给用户确认。这样即使只识别到题干，系统也可以继续走标准解法展示和只读 RAG 推荐，但不会误写具体错因或长期画像。

### 关键设计

GLM-OCR 是显式配置的第三种 vision protocol。未设置 `VISION_PROVIDER_PROTOCOL` 时仍保持原有 `anthropic` 默认行为；`openai` chat vision 和 legacy MiMo 配置也继续保留。

实现上，`glm_ocr` 只调用智谱文档解析接口 `/api/paas/v4/layout_parsing`。请求体只包含 `model`、当前图片 `file` 和安全 OCR 选项，不发送 `student_profile_summary`、学生画像、错题历史、`memory_delta`、chat messages 或 repair prompt。响应先由 runtime parser 读取 `md_results` 和 `layout_details`，再由本地 mapper 生成 `VisionExtractionDraft`。

`md_results` 是主输入，`layout_details` 只作为可选 fallback 和版面辅助。mapper 采用保守切分：能识别 `解：/证明：/答：` 或作答类 layout 时才填学生答案；只识别题干时返回 `student_answer="未识别到学生答案"`、低置信度和用户确认提示。

### 技术决策与取舍

我没有把 MinerU 接进在线上传题主路径。MinerU 更适合离线 PDF/题库入库，服务的是 P2.0 之后的 corpus 生产；在线学生上传题需要低延迟、少 artifact、可恢复错误和可编辑确认表单。GLM-OCR 更适合作为在线抽取 provider，而 MinerU 继续做离线题源工程。

我也没有把 GLM-OCR 变成默认 provider。第一版保持显式配置，是为了不破坏已有本地 demo 和 Anthropic/OpenAI-compatible vision 路径；是否切默认要等真实上传题 smoke 稳定后再决定。

最重要的取舍是边界：GLM-OCR 不生成标准解法、不决定错因、不写 `memory_events` 或 `student_profiles`，也不调用 RAG。它只把图片变成确认草稿；诊断事实和画像写入仍由用户确认后的确定性 pipeline 决定。

### 性能收益（如适用）

P2.8 主要收益是稳定性和调试效率。GLM-OCR 路径绕开通用 vision chat 模型空 `content` 的问题，错误阶段也从 `vision_llm` 区分为 `ocr`，便于本地定位是 chat JSON 生成失败，还是 OCR 文档解析失败。请求仍复用前端压缩图片和服务端大小限制，不增加前端直连模型或额外数据库写入。

### 面试官可能怎么问

1. 为什么 GLM-4.6V-FlashX 已经能看图，还要接 GLM-OCR？
2. 为什么不用 MinerU 直接做在线 OCR？
3. GLM-OCR 为什么不能直接生成标准解法？
4. 只识别到题干时，为什么还允许继续生成标准解法和推荐题？
5. OCR 错了会不会污染学生画像？
6. 为什么 `glm_ocr` 不作为默认 provider？
7. 怎么防止图片、API Key 或学生答案泄露到日志？

### 推荐回答

我会这样回答：

通用视觉模型适合做“看图 + 结构化 JSON”，但真实上传题里出现过 HTTP 成功却没有可解析文本的情况。这个问题发生在图片抽取阶段，不是标准解法或 RAG 的问题。所以我把图片抽取拆出一个 OCR/layout 专用 provider：GLM-OCR 先负责把图变成 markdown 和版面文本，本地 mapper 再把它收口成确认草稿。

我没有让 GLM-OCR 直接生成标准解法，因为它在系统里的职责是 OCR，不是解题。标准解法仍然在用户确认题干后由 text analysis provider 或本地规则生成。这样可以保证“模型看图识别”和“确认后分析”两件事分开，避免 OCR 误读直接变成错因结论或画像事实。

只识别到题干时，系统仍然可以继续生成展示用标准解法和相似练习推荐，但证据等级会是 `problem_only`，具体错因不会写入画像。也就是说，用户体验不断掉，但长期记忆不会被低证据污染。

### 可能被继续追问

- 真实 GLM-OCR smoke 失败时会怎么降级？
- mapper 如何处理复杂版面、多小问和手写步骤？
- 未来是否会把 GLM-OCR 和 text analysis provider 串成多阶段模型链？
- 如果 GLM-OCR 识别出题干但作答为空，RAG query 怎么构造？
- 多 provider 配置如何避免确认 token 失效？

### 反思与后续优化

当前实现仍是 demo-scoped：GLM-OCR 需要显式本地配置，真实 smoke 依赖 API Key；mapper 是保守规则，不追求完美切分所有手写版面。后续可以补真实上传题 smoke、记录更细的 OCR warning taxonomy，并基于真实失败样本改进 mapper，但不应该把 OCR 输出升级成画像写入依据。

### 项目中的真实证据

- 代码：
  - `src/lib/providers/glm-ocr-provider.ts`
  - `src/lib/providers/glm-ocr-response-parser.ts`
  - `src/lib/vision-extraction/glm-ocr-draft-mapper.ts`
  - `src/lib/providers/anthropic-compatible-provider.ts`
- 测试：
  - `scripts/tests/providers/glm-ocr-provider.test.mjs`
  - `scripts/tests/providers/glm-ocr-response-parser.test.mjs`
  - `scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs`
  - `scripts/tests/providers/anthropic-compatible-provider.test.mjs`
  - `scripts/tests/smoke/api-smoke.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-06-27-p28-glm-ocr-image-extraction-design.md`
  - `docs/superpowers/plans/2026-06-27-p28-glm-ocr-image-extraction-provider.md`
- 验证：
  - `node scripts/tests/providers/glm-ocr-provider.test.mjs`
  - `node scripts/tests/image-diagnosis/glm-ocr-draft-mapper.test.mjs`
  - `node scripts/tests/smoke/api-smoke.test.mjs`
  - `node scripts/run-tests.mjs default`

---

## 23. P2.9 pgvector-backed Variant Practice Retrieval（pgvector 变式练习检索）

### 当前状态

代码与本地验证已完成，真实 Supabase / embedding smoke 待补充。这个阶段把 P2.7 的本地 JSON 动态推荐升级为优先 pgvector 检索：审核通过的导数题库通过本地 CLI 同步到 Supabase Postgres + pgvector，运行时 `/api/variant-practice` 先用 query embedding 召回候选题，失败时回退本地 enriched corpus。

### 功能价值

P2.7 已经证明上传题诊断后可以动态推荐真实教辅题。P2.9 解决的是运行时题库形态：从本地 ignored JSON 文件推进到可在线查询的数据库候选源，为后续更多题量、多专题和质量评估打基础。

### 关键设计

pgvector 只替换候选召回来源。推荐仍由 Variant Practice Agent 编排，前端仍只消费 `ProductVariantPractice`。RAG 不写 `memory_events`、不改 `student_profiles`、不写错题本，也不进入 `/api/confirm` 主链路。

### 技术决策与取舍

我选择 pgvector 候选源加本地 JSON fallback，而不是 pgvector-only。原因是演示稳定性仍是第一优先级：Supabase 未配置、migration 未应用、embedding provider 超时或 RPC 失败时，学生仍能看到诊断报告和已有练习题。

### 性能收益（如适用）

相比每次读取整个本地 corpus 后做文本/metadata 搜索，pgvector 可以把候选召回交给数据库索引。第一版 corpus 只有 64 道 approved 题，性能收益不是主要目的；主要收益是把 RAG 从本地 artifact 过渡到可在线扩展的数据层。

### 面试官可能怎么问

1. 为什么先用 pgvector，而不是 Milvus？
2. 为什么保留本地 JSON fallback？
3. embedding provider 会不会污染学生画像？
4. pgvector 检索和 `memory_events` / `student_profiles` 的关系是什么？
5. 为什么不把 RAG 合进 `/api/confirm`？
6. 如果 embedding provider 超时怎么办？

### 推荐回答

我会这样回答：

P2.9 里的 pgvector 是题源检索层，不是学生记忆层。学生画像仍然来自确认后的 `memory_events`，再投影成 `student_profiles`。pgvector 只回答“题库里哪些练习题适合当前诊断目标”，并且结果还会经过现有 Agent 和 product view model 裁剪。

我没有做 pgvector-only，是因为 MathTrace 当前仍是 demo-first。数据库或 embedding provider 不可用时，系统应该回到 P2.7 已验证的本地 corpus，而不是让练习区空掉。这样可以证明线上检索方向，同时不牺牲演示稳定性。

### 可能被继续追问

- 多专题 corpus 接入后，embedding 表是否要拆分？
- 如何评估 pgvector 召回质量？
- 什么时候从 pgvector 迁移到 Milvus？
- 是否需要缓存 query embedding？

### 反思与后续优化

第一版固定 1536 维 embedding 和导数专题，避免过早做多模型/多维度兼容。后续题量扩大后，再评估 embedding model、召回质量指标、缓存和 Milvus。

### 项目中的真实证据

- 代码：
  - `supabase/migrations/20260630000000_p29_pgvector_variant_practice.sql`
  - `src/lib/providers/embedding-provider.ts`
  - `src/lib/persistence/variant-practice-corpus-persistence.ts`
  - `src/lib/server/rag/variant-practice-corpus-source.ts`
  - `scripts/rag/sync-variant-practice-pgvector.mjs`
- 测试：
  - `scripts/tests/persistence/variant-practice-pgvector-migration.test.mjs`
  - `scripts/tests/rag/variant-practice-embedding-text.test.mjs`
  - `scripts/tests/providers/embedding-provider.test.mjs`
  - `scripts/tests/persistence/variant-practice-corpus-persistence.test.mjs`
  - `scripts/tests/rag/variant-practice-corpus-source.test.mjs`
  - `scripts/tests/rag/sync-variant-practice-pgvector-core.test.mjs`
- 文档：
  - `docs/superpowers/specs/2026-06-30-p29-pgvector-variant-practice-retrieval-design.md`
  - `docs/superpowers/plans/2026-06-30-p29-pgvector-variant-practice-retrieval.md`
  - `docs/adr/2026-06-30-pgvector-variant-practice-retrieval.md`
- 验证：
  - `node scripts/run-tests.mjs default`
  - `npm run test:smoke`
  - `npm run lint`
  - `npm run build`
  - `git diff --check`

---

## 后续可追加的阶段

这些阶段还没有完全完成，后续实现后可以继续按同一模板追加：

- 真实云端 migration apply、Auth/RLS 用户策略和多用户画像。
- 数据库支持的图片确认草稿版本审计。
- P2.3 evidence gate calibration（证据门控校准）评估报告：统计 `invalid_evidence_terms_removed`（有证据词被清洗移除）、`removed_evidence_terms`（被清洗移除的证据词列表）和校准前后的 auto approved（自动通过）数量变化。
- 多专题 taxonomy registry（标签体系注册表）和 tag key（内部标签 key）治理。
- 多专题动态变式练习推荐和推荐质量评估。
- 图像题 corpus 处理和图文混合题召回。
- 动态生成变式练习题。
- Kimi / GLM / DeepSeek provider 的生产级 telemetry 与审计。
- LLM 输出迁移到 Zod schema。
- GitHub Actions CI 与合并前自动检查。
- 面向老师端或家长端的只读报告。

## 面试前快速复习索引

### LLM 安全边界

重点阶段：5、7、9、10、11、12、13、14、15、16、17、20、21、23。核心表达：模型只做抽取、确认后文本增强或受控 proposal，不直接写画像；所有模型输出先过 JSON parser、业务边界校验或 taxonomy validator；只有学生步骤或用户确认构成足够证据时才写具体错因；数据库写入也必须经过服务端确认和证据策略，云端当前画像也只能从受控 `memory_events` 投影。P1.9 进一步强调展示层只能派生“薄弱指数”和推荐依据，P1.10 只暴露服务端摘要后的 evidence，不把模型、UI 文案或完整事件历史升级成画像写入事实；P2.0 题源 corpus 也只能作为检索来源，不能决定画像写入。P2.3 让 AI 做标签建议，但最终标签必须经过 taxonomy、auto gate 或人工 review records；P2.7 让 RAG 只返回练习展示模型，P2.9 让 pgvector 只替换练习候选召回来源，都不写画像事实层。

### Demo 稳定性

重点阶段：1、2、6、9、10、11、12、13、14、15、16、17、19、20、21、23。核心表达：P0 样例题是正式演示路径，不依赖模型；P1 图片诊断失败不会破坏样例题主线；题干-only 图片进入可信追问，不污染画像；P1.6a 用 `npm run test:smoke` 和浏览器 checklist 锁住合并前主路径；P1.7/P1.8 未配置数据库时仍保持 demo 可运行；P1.10 读取 evidence 失败、数据库未配置或无事件时继续使用 P1.9 fallback；P2.0/P2.2/P2.3 题源工具只生成本地 ignored artifact，不影响 `sample_diagnosis`；P2.7 动态推荐失败时继续展示诊断响应自带练习题，P2.9 pgvector 不可用时继续回退本地 enriched corpus。

### Agent 工程化

重点阶段：4、5、13、14、15、16、17、18、19、20、21、23。核心表达：先用确定性 pipeline 表达 Agent 流程，再逐步把适合的环节替换为模型或工具调用；长期记忆不是模型自由记忆，而是确认后的学习证据先进入 `diagnosis_runs` / `memory_events`，再投影成 `student_profiles` 当前画像。P1.9 把展示派生收口到前端 view model，P1.10 再用只读 evidence API 解释推荐依据，说明 Agent 产生的结构化事实、当前画像和 UI 解释层要分开。P2.0 开始把 RAG 拆成题源工程、人工审核、corpus fixture 和后续检索模块，P2.1/P2.2 再用本地 Agent 和 metadata enrichment 证明题源如何服务“下一步练什么”，P2.3 进一步让 AI 做 taxonomy-bound proposal，再由 auto gate 和人工 review 收口，P2.7 把这条链路接到上传题后的只读练习推荐 API，P2.9 再把候选源推进到 pgvector。

### 长期记忆与数据持久化

重点阶段：6、13、14、15、16、17、19、20、21、23。核心表达：localStorage 只是 demo fallback，Postgres 才是服务端事实层；P1.7 存诊断运行、错题本条目和画像变化事件，P1.8 再用 `student_profiles` 保存从 gated `memory_events` 投影出的当前画像快照；P1.9 的“薄弱指数”只是从 `mastery_scores` 派生的展示值，不写回 DB；P1.10 读取最近 `memory_events` 摘要增强推荐依据，但不暴露完整事件、完整诊断或题目正文。P2.0/P2.2/P2.3 的 RAG 题源 corpus、enriched corpus 和 tag review records 仍是检索层，不是画像事实层；P2.7 动态推荐和 P2.9 pgvector 候选召回也不写 `memory_events`、`student_profiles` 或错题本。面试时要说清楚当前仍固定 `demo_student_001`，无登录、真实多用户、面向用户的 RLS 策略或老师端，前端不直连数据库，service role only server side。

### 前端状态管理

重点阶段：2、6、7、11、12、13、14、15、16、21。核心表达：单页工作台用 React state 足够；localStorage 只做 P0/P1 演示状态恢复；前端只在服务端 `memory_delta.should_persist=true` 且响应 guard 通过时持久化本地 demo 状态；P1.7/P1.8 前端不直连数据库，只通过 Next API 读取错题本和云端画像。页面启动时先用 localStorage/demo 保证首屏，再 best-effort 拉取 `/api/student-profile` 和 evidence 摘要，云端失败时不覆盖本地 fallback。P1.9 的画像展示由 browser-safe view model 派生，P1.10 的 evidence 请求由 workbench 统一管理，不让 `ProfileInsights` 直接 fetch 或读取 Supabase；P2.7 的动态 RAG 请求由 workbench 管理 request id，避免旧请求覆盖新报告。

### 测试策略

重点阶段：3、4、5、6、7、9、10、11、12、13、14、15、16、17、18、19、20、21、23。核心表达：核心风险点都拆成可测试的 TypeScript helper 或 service；P1.5 用 eval harness 固化“无学生证据不写具体错因”的边界；P1.6a 用 smoke 测试验证 Demo 主路径和 API contract 是否仍能跑通；P1.7/P1.8 需要覆盖数据库未配置、fake repo 写入、只读错题本 API 和云端画像投影/读取；P1.9 用 view model/UI 测试锁住薄弱指数、错因筛选和“不声称读取完整 `memory_events`”的展示边界；P1.10 增加 evidence service/client/UI/architecture 边界测试；P2.0-P2.3 题源工具用 Node 脚本测试覆盖 OCR 候选映射、审核页导出、corpus schema、tag proposal、AI proposal fake provider、merge gate、tag review UI、review record merge、enriched corpus、Agent evaluation、CLI 默认输出和敏感输出边界；P2.7 增加 query mapper、service、client、API smoke 和 workbench 源码回归测试；P2.9 增加 migration SQL、embedding provider、pgvector repository、runtime source 和同步 CLI 测试。

### 性能收益

重点阶段：1、2、3、4、5、6、7、8、9、10、11、12、13、14、15、16、17、19、20、21、23。核心表达：性能收益不只看运行速度，也包括减少模型调用、减少网络往返、压缩上传 payload、缩短测试反馈、降低调试数据体积和提升演示稳定性。面试回答时要尽量绑定证据，例如 1MB 上传上限、一次 `/api/diagnose` 返回完整结果、确定性 pipeline、localStorage 恢复、确认后文本增强失败回退、`npm run test:eval`、`npm run test:smoke`、数据库未配置 no-op 降级、`student_profiles` 当前画像快照读取，P1.9 只在前端纯函数中派生画像展示，P1.10 读取最近 N 条 `memory_events` 摘要而不是前端拉全量历史，P2.0 用 9MB 导数切片、本地静态审核页和 Node CLI 快速验证 69 道可用 corpus item，P2.2 用本地 deterministic pipeline 生成 proposal、enriched corpus 和 Agent evaluation，P2.3 用 AI proposal + auto gate + review queue 降低人工逐题标注成本，P2.7 不拉长 `/api/confirm` 主流程，动态 RAG 成功后再替换练习展示；P2.9 把候选召回交给 pgvector 索引，但第一版主要收益仍是在线数据层扩展性。

### 范围控制

重点阶段：1、8、11、13、14、15、16、17、19、20、21、23。核心表达：不提前做登录、老师端、完整 RAG 和复杂 Agent 框架；先验证错因诊断闭环和可信写入边界，再用 P1.7/P1.8 引入最小数据库底座和当前画像快照。P1.9 只改展示语义；P1.10 只新增 profile evidence 摘要 API，不新增 DB schema、正向练习证据表或完整历史事件浏览。P2.0-P2.3 只完成教辅题源到本地 corpus、proposal、AI-assisted review 和 enriched corpus 的前置闭环，P2.7 只做确认上传题后的只读动态推荐；P2.9 只把练习候选源升级到 pgvector，仍不做多专题线上 RAG、老师端或画像写入。
