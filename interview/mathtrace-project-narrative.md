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

已完成，已验证。这个阶段最初以 MiMo 作为优先 provider 跑通真实图片诊断，后续已把配置层通用化为 `VISION_PROVIDER_*`，当前可通过本地配置切换 Kimi Code、MiMo 等 Anthropic-compatible provider，也可以切到 GLM-4.6V-FlashX 这类 OpenAI-compatible vision provider。parser/provider 也做了真实模型输出韧性增强：模型返回多行字符串、对象数组、空步骤项或缺少标准解法草稿时，会被有界规范化或进入一次安全修复重试。

### 功能价值

这个阶段让项目从“稳定 mock demo”进入真实 AI 能力：用户上传图片后，服务端调用 MiMo 多模态模型抽取题干、学生答案、学生解题步骤和标准解法草稿。

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
- `standard_solution_draft`
- `extraction_confidence`
- `warnings`

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

真实测试还暴露了一个比“能不能识别图片”更工程化的问题：模型有时字段名齐全，但字段值不稳定，例如把步骤写成对象数组、空项列表，或漏掉标准解法草稿。我把这类问题放在 provider/parser 边界处理，而不是让后续 Agent Pipeline 猜测模型意图：parser 做有界规范化，provider 对安全的非法输出只重试一次，仍然禁止模型写画像和 `memory_delta`。

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

### 推荐回答

我会这样回答：

我没有把 MiMo 调用写在 route 里，而是抽成 Anthropic-compatible provider adapter。这样 `/api/diagnose` 只依赖统一的 `VisionExtractionProvider` 接口，不关心底层是 MiMo、Kimi 还是 DeepSeek。未来新增 provider 的成本会低很多。

API Key 只在服务端通过 `.env.local` 读取，前端代码、文档和日志里都不出现真实 key。前端只调用自己的 `/api/diagnose`，由服务端决定是否调用模型。

模型输出是最大的不确定性，所以我把模型限制在“图片抽取器”的角色。它只能输出题干、学生答案、步骤、标准解法草稿、置信度和 warnings。它不能写 `memory_delta`，也不能覆盖 `student_profile`。如果它输出这些字段，parser 会拒绝。这样可以防止长期画像被模型直接污染。

真实测试里我还遇到 MiMo 返回合法 JSON 但字段类型不完全符合要求，比如把步骤数组输出成多行字符串。我没有直接放宽所有校验，而是只对 `student_solution_steps` 和 `warnings` 做可控规范化，仍保留字段白名单和长度边界。

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
  - `docs/reviews/2026-05-31-image-diagnosis-frontend-experience-review.md`
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
- 审查报告写入 `docs/reviews/YYYY-MM-DD-任务名-review.md`。
- `docs/reviews/*.md` 默认本地-only，不提交 GitHub。
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

另外，review docs 本地-only 的规则需要配合 `.gitignore` 或 staged 范围检查，否则仍可能误提交。后续可以考虑把 `docs/reviews/` 加入 `.gitignore`，或者把本地审查报告移到仓库外路径。

### 项目中的真实证据

- 代码：
  - `AGENTS.md`
  - `.gitignore`
- 测试：
  - `package.json` 中的 `npm test` 串行脚本
- 文档：
  - `docs/reviews/2026-05-31-image-diagnosis-frontend-experience-review.md`
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

这个阶段解决的是图片诊断最大的信任问题：模型看错题干、漏掉学生答案或误判步骤时，不能直接把错误结果写进长期画像。现在图片路径会先返回可编辑的识别草稿，学生检查题干、学生答案、解题步骤和标准解法草稿后，再确认生成诊断报告。

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

标准解法展示后来补了一层更细的取舍：报告区不再给每个句子强行生成编号，只把原文里已经存在的 `(1)`、`（1）`、`②` 这类结构标记迁移到左侧 marker；普通段落保持自然阅读。公式渲染也不主要依赖前端猜测裸公式，而是在图片抽取 prompt 里要求 `standard_solution_draft` 内部数学表达式使用 `$...$` 或 `$$...$$` 包裹。前端仍保留有限兜底，但它只是展示容错，不是完整数学解析器。

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

公式渲染也是类似思路：前端正则只能做有限兜底，不能可靠理解所有数学文本。我把主约束前移到模型抽取 prompt，要求 `standard_solution_draft` 字段内部用 `$...$` 或 `$$...$$` 标注数学表达式，再由 KaTeX 渲染。这样比前端猜 `f'(x)`、`1/a`、`ln(1/a)` 哪些该包成公式更稳定，也方便用户在确认区手动修正。

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

标准解法格式化目前也保持保守：只识别有限的原文编号形态和常见裸公式，不追求完整 Markdown/LaTeX 自动修复。更可靠的演进方向是提升 provider prompt、在确认区提示用户补 `$...$`，以及后续引入更明确的结构化字段，例如 `standard_solution_steps`，而不是让前端无限扩张正则。

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

公式渲染也有一个重要经验：前端不能无限猜裸公式。更可靠的策略是把约束前移到 prompt 和模型输出格式，要求 `standard_solution_draft` 使用 Markdown，并用 `$...$` 或 `$$...$$` 包裹数学公式。前端 KaTeX 做渲染和有限兜底，但不承担完整数学解析器职责。

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

## 后续可追加的阶段

这些阶段还没有完全完成，后续实现后可以继续按同一模板追加：

- 数据库支持的图片确认写入与可审计草稿版本。
- 数据库 schema、`mistake_records`、`memory_deltas` 和 `student_profiles`。
- 动态生成变式练习题。
- Kimi / GLM / DeepSeek provider 的生产级 telemetry 与审计。
- LLM 输出迁移到 Zod schema。
- GitHub Actions CI 与合并前自动检查。
- 面向老师端或家长端的只读报告。

## 面试前快速复习索引

### LLM 安全边界

重点阶段：5、7、9、10、11、12。核心表达：模型只做抽取或确认后文本增强，不直接写画像；所有模型输出先过 JSON parser 和业务边界校验；只有学生步骤或用户确认构成足够证据时才写具体错因。

### Demo 稳定性

重点阶段：1、2、6、9、10、11、12。核心表达：P0 样例题是正式演示路径，不依赖模型；P1 图片诊断失败不会破坏样例题主线；题干-only 图片进入可信追问，不污染画像；P1.6a 用 `npm run test:smoke` 和浏览器 checklist 锁住合并前主路径。

### Agent 工程化

重点阶段：4、5。核心表达：先用确定性 pipeline 表达 Agent 流程，再逐步把适合的环节替换为模型或工具调用。

### 前端状态管理

重点阶段：2、6、7、11、12。核心表达：单页工作台用 React state 足够；localStorage 只做 P0/P1 演示状态恢复；前端只在服务端 `memory_delta.should_persist=true` 且响应 guard 通过时持久化。

### 测试策略

重点阶段：3、4、5、6、7、9、10、11、12。核心表达：核心风险点都拆成可测试的 TypeScript helper 或 service；P1.5 用 eval harness 固化“无学生证据不写具体错因”的边界；P1.6a 用 smoke 测试验证 Demo 主路径和 API contract 是否仍能跑通。

### 性能收益

重点阶段：1、2、3、4、5、6、7、8、9、10、11、12。核心表达：性能收益不只看运行速度，也包括减少模型调用、减少网络往返、压缩上传 payload、缩短测试反馈、降低调试数据体积和提升演示稳定性。面试回答时要尽量绑定证据，例如 1MB 上传上限、一次 `/api/diagnose` 返回完整结果、确定性 pipeline、localStorage 恢复、确认后文本增强失败回退、`npm run test:eval` 和 `npm run test:smoke`。

### 范围控制

重点阶段：1、8、11。核心表达：不提前做数据库、登录、老师端和复杂 Agent 框架；先验证错因诊断闭环和可信写入边界，再逐步演进。
