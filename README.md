# 每日平均固定支出

一个每日平均固定支出记录工具。页面通过 Cloudflare Pages 托管，数据通过 Pages Functions 写入 Cloudflare D1 数据库。

## 本地验证

```sh
node --check app.js
node --check date-utils.js
node --check renewal-utils.js
node --check functions/api/items.js
node --check 'functions/api/items/[id].js'
npm test
npm run build
```

`npm run build` 会把实际发布所需的静态文件复制到 `dist/`。

## Cloudflare Pages 自动部署

在 Cloudflare Pages 中连接 GitHub 仓库后，每次推送到 `main` 分支都会自动触发生产部署。Pull Request 或其他分支推送通常会生成预览部署，便于上线前检查。

推荐设置：

- 项目类型：Pages
- Git 仓库：`AYLJzj520/life-cost`
- 生产分支：`main`
- 构建命令：`npm run build`
- 构建输出目录：`dist`
- D1 绑定名：`DB`

部署步骤：

1. 登录 Cloudflare Dashboard。
2. 进入 `Workers & Pages`，选择 `Create application`。
3. 选择 `Pages`，连接 GitHub，并授权访问 `AYLJzj520/life-cost` 仓库。
4. 选择仓库后按上面的推荐设置填写构建配置。
5. 创建项目并等待首次部署完成。
6. 创建 D1 数据库并初始化表结构。
7. 在 Pages 项目中把 D1 数据库绑定为 `DB`。
8. 重新部署项目。
9. 之后只要把代码推送到 GitHub 的 `main` 分支，Cloudflare Pages 就会自动更新线上项目。

## D1 数据库配置

### 方式一：Cloudflare Dashboard

1. 进入 Cloudflare Dashboard。
2. 打开 `Workers & Pages` > `D1 SQL Database`。
3. 选择 `Create database`，数据库名建议使用 `life-cost-db`。
4. 创建后进入该数据库的 `Console`。
5. 复制 [schema.sql](./schema.sql) 的内容并执行，创建 `items` 表。
6. 回到 Pages 项目，进入 `Settings` > `Bindings`。
7. 添加 `D1 database` 绑定：
   - Variable name：`DB`
   - D1 database：选择刚创建的 `life-cost-db`
8. 保存后重新部署 Pages 项目。

### 方式二：Wrangler CLI

```sh
npx wrangler d1 create life-cost-db
npx wrangler d1 execute life-cost-db --remote --file=./schema.sql
```

然后在 Cloudflare Pages 项目的 `Settings` > `Bindings` 中添加 D1 绑定，变量名必须是 `DB`。

## 数据保存位置

商品数据会保存在 Cloudflare D1 的 `items` 表中，不再保存到浏览器 `localStorage`。

当前版本没有登录系统，所以任何能访问网站的人都会使用同一个数据库。只给自己用时，建议通过 Cloudflare Access 或其他访问控制方式限制网站访问。

## 使用说明

新增商品时可以选择两种成本方式：

- 总价分摊：填写购买价格，并通过结束日期或预计使用天数计算日均成本。
- 每日固定成本：填写每日成本和使用日期；系统会按该日期所在自然周创建记录，不需要填写结束日期。勾选“不包含周末”时记录周期为周一至周五，不勾选时为周一至周日。

## 数据库变更

已有数据库升级时，按时间顺序执行 `migrations/` 目录中的 SQL 文件。当前线上数据库需要执行：

```sh
npx wrangler d1 execute life-cost-db --remote --file=./migrations/20260717_add_usage_options.sql
```

这次升级会为商品增加结束方式、预计天数、不包含周末、自动续期和续期来源字段。

每日固定成本模式需要执行：

```sh
npx wrangler d1 execute life-cost-db --remote --file=./migrations/20260717_add_daily_cost_mode.sql
```

Pages Functions 不会在请求期间修改数据库表结构，因此部署新代码前必须先完成上述迁移。

自动续期并发保护需要执行：

```sh
npx wrangler d1 execute life-cost-db --remote --file=./migrations/20260718_add_unique_renewal_index.sql
```

该迁移会保证同一条商品记录最多生成一个直接续期记录。执行前可先检查是否存在重复数据：

```sql
SELECT renewed_from_id, COUNT(*) AS renewal_count
FROM items
WHERE renewed_from_id IS NOT NULL
GROUP BY renewed_from_id
HAVING COUNT(*) > 1;
```

如果查询有结果，需要先人工确认并处理重复记录，再执行唯一索引迁移。

如果需要自定义域名，可以在 Pages 项目的 `Custom domains` 中添加域名，并按 Cloudflare 提示完成 DNS 配置。
