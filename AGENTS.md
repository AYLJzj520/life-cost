# 项目说明

这是一个通过 Cloudflare Pages 运行的商品日均成本记录工具。用户录入商品名称、购买价格、使用日期和结束日期后，应用按包含起止日期的总使用天数计算单件商品日均成本，并汇总所有未归档商品的当前日均成本。

## 当前实现

- `index.html`：页面结构与表单、汇总区、商品列表。
- `styles.css`：响应式界面样式。
- `app.js`：前端表单校验、日均成本计算、使用中/已归档切换，并通过 `/api/items` 读写数据。
- `functions/api/items.js`：Pages Function API，负责从 D1 列表读取和新增商品。
- `functions/api/items/[id].js`：Pages Function API，负责按 ID 更新结束日期和删除商品。
- `schema.sql`：Cloudflare D1 数据库表结构。
- `migrations/`：线上 D1 已存在表结构的增量迁移 SQL。
- `package.json`：提供 Cloudflare Pages 可执行的 `npm run build` 构建命令。
- `.gitignore`：忽略本地和 Cloudflare 构建生成的 `dist/` 目录。
- `README.md`：说明本地验证方式与 Cloudflare Pages 自动部署配置。
- 数据保存在 Cloudflare D1 的 `items` 表中，Pages Function 通过绑定名 `DB` 访问数据库。
- 当商品 `endDate` 早于浏览器当天日期时，自动进入已归档列表，不再计入当前日均成本；结束日期当天仍算作使用中。
- 使用中的商品支持通过 `+1天` / `-1天` 调整结束日期，并基于新天数重新计算日均成本；结束日期不能早于使用日期。
- 新增商品支持按结束日期或预计使用天数设置周期，可选择不包含周末；勾选自动续期后，到期归档并生成下一周期的同名商品。

## 维护约定

- 保持无构建依赖的静态前端实现，除非用户明确要求引入框架或后端。
- 修改计算逻辑时优先保持函数小而可验证：`getInclusiveDays`、`isArchived`、`getDailyCost`。
- 修改数据结构时同步更新 `schema.sql`、Pages Functions 和 `README.md` 的部署说明。
- 修改已上线数据库字段时新增 `migrations/` 迁移文件，并在部署前后确认线上 D1 已执行迁移。
- Cloudflare Pages 部署使用 `npm run build`，输出目录为 `dist`；保持构建脚本只复制实际发布所需的静态文件。
- Cloudflare D1 绑定名固定为 `DB`，不要在代码中改成其他名字，除非同步更新部署文档。
- `dist/` 是构建产物，不提交到仓库。
- 只做和用户需求直接相关的改动，不进行无关重构、批量格式化、重命名或清理。
- 禁止批量删除文件或目录；需要删除文件时只能一次删除一个明确路径的文件。
- 每次改动后运行最相关验证，例如 `node --check app.js` 和 `npm run build`，并按需要补充本文件中的项目说明。
