# 项目说明

这是一个通过 Cloudflare Pages 运行的每日平均固定支出记录工具。用户录入商品名称、购买价格、使用日期和结束日期后，应用按包含起止日期的总使用天数计算单件商品日均成本，并汇总所有未归档商品的当前日均成本。

## 当前实现

- `index.html`：页面结构与表单、汇总区、商品列表。
- `styles.css`：响应式界面样式。
- `app.js`：前端表单校验、日均成本计算、使用中/已归档切换，并通过 `/api/items` 读写数据。
- `date-utils.js`：前端与 Pages Functions 共用的无时区日期计算、工作日计算和日期范围校验。
- `renewal-utils.js`：自动续期记录的纯计算逻辑。
- `api-utils.js`：Pages Functions 共用的 JSON 请求体限制、错误响应和严格布尔值读取。
- `functions/api/items.js`：Pages Function API，负责从 D1 列表读取和新增商品。
- `functions/api/items/[id].js`：Pages Function API，负责按 ID 更新结束日期、更新自动续期开关和删除商品。
- `functions/api/items/renew.js`：独立的自动续期写接口，按批次推进过期续期链。
- `schema.sql`：Cloudflare D1 数据库表结构。
- `migrations/`：线上 D1 已存在表结构的增量迁移 SQL。
- `tests/`：使用 Node 内置测试运行器验证日期、工作日、自然周、续期积压与并发、列表分页、PATCH、DELETE 和 API 规范化逻辑。
- `package.json`：提供 `npm run check` 验证命令，并在 Cloudflare Pages 执行 `npm run build` 前通过 `prebuild` 自动运行检查。
- `.gitignore`：忽略本地和 Cloudflare 构建生成的 `dist/` 目录。
- `README.md`：说明本地验证方式与 Cloudflare Pages 自动部署配置。
- 数据保存在 Cloudflare D1 的 `items` 表中，Pages Function 通过绑定名 `DB` 访问数据库。
- 当商品 `endDate` 早于浏览器当天日期时，自动进入已归档列表，不再计入当前日均成本；结束日期当天仍算作使用中。
- 商品列表在总使用天数与日均成本之间单独显示剩余天数列；使用中商品按浏览器当天日期至结束日期包含首尾计算，并遵守“不包含周末”设置，列表按剩余天数从少到多排列；已归档商品显示 `-`。
- 页面桌面端整体容器较宽，左侧新增表单较窄，优先给右侧使用中/已归档列表保留横向展示空间。
- 使用中的商品支持通过 `+1天` / `-1天` 调整结束日期，并基于新天数重新计算日均成本；结束日期不能早于使用日期。
- 新增商品支持总价分摊或每日固定成本；总价分摊支持按结束日期或预计使用天数设置周期；每日固定成本按使用日期所在自然周自动设置周期，勾选不包含周末时为周一至周五，否则为周一至周日；勾选自动续期后，到期归档并生成下一周期的同名商品。
- 已生成商品支持通过编辑弹窗手动修改总金额或每日成本、选择结束日期、使用 `-1天` / `+1天` 调整有效使用日，并修改到期后是否自动续期；弹窗实时预览总使用天数、剩余天数和日均成本，保存后服务端重新计算周期价格与天数。
- 使用中商品和汇总通过只读 GET 加载；自动续期由独立 POST 接口按每批最多 40 条处理，前端会继续请求至积压周期全部补齐，并按商品轮转避免单个商品独占额度。
- 已归档商品由 API 按每页 50 条分页读取，前端提供上一页、下一页和加载/重试状态；列表操作错误显示在对应商品行内。
- 每日固定成本模式使用 `cost_mode` 和 `daily_cost` 字段；对应迁移文件为 `migrations/20260717_add_daily_cost_mode.sql`，部署前必须完成数据库迁移，API 请求期间不修改表结构。
- 自动续期通过 `renewed_from_id` 唯一索引、条件插入和并发时跟随已有子记录避免重复；对应迁移文件为 `migrations/20260718_add_unique_renewal_index.sql`，旧普通索引可通过 `migrations/20260718_remove_redundant_renewal_index.sql` 清理。
- 日期计算统一使用 UTC 日序号，业务上的“今天”固定按 `Asia/Shanghai` 时区确定，避免浏览器夏令时造成天数误差。
- API 限制 JSON 请求体、名称长度、金额、真实日期范围和日期跨度，并严格要求布尔字段使用 JSON 布尔值。
- 新增、编辑、日期调整和删除操作具备重复提交防护；删除前需要用户确认，编辑弹窗和列表标签页提供键盘与 ARIA 支持；已归档商品延长结束日期后可以重新进入使用中列表。

## 维护约定

- 保持无构建依赖的静态前端实现，除非用户明确要求引入框架或后端。
- 修改计算逻辑时优先保持函数小而可验证：`getInclusiveDays`、`isArchived`、`getDailyCost`。
- 日期与续期计算优先复用 `date-utils.js` 和 `renewal-utils.js`，不要在前端或 Pages Functions 中复制实现。
- 修改数据结构时同步更新 `schema.sql`、Pages Functions 和 `README.md` 的部署说明。
- 修改已上线数据库字段时新增 `migrations/` 迁移文件，并在部署前后确认线上 D1 已执行迁移。
- Cloudflare Pages 部署使用 `npm run build`，输出目录为 `dist`；保持构建脚本只复制实际发布所需的静态文件。
- `npm run build` 必须通过 `prebuild` 执行 `npm run check`，确保语法检查和测试失败时阻止部署构建。
- 前端静态资源如 `app.js` 或 `styles.css` 修改后，可在 `index.html` 的资源地址上更新版本查询参数，避免浏览器或 CDN 继续使用旧缓存。
- Cloudflare D1 绑定名固定为 `DB`，不要在代码中改成其他名字，除非同步更新部署文档。
- `dist/` 是构建产物，不提交到仓库。
- 只做和用户需求直接相关的改动，不进行无关重构、批量格式化、重命名或清理。
- 禁止批量删除文件或目录；需要删除文件时只能一次删除一个明确路径的文件。
- 每次改动后运行最相关验证，例如 `node --check app.js`、`npm test` 和 `npm run build`，并按需要补充本文件中的项目说明。
