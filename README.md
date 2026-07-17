# 商品日均成本

一个商品日均成本记录工具。页面通过 Cloudflare Pages 托管，数据通过 Pages Functions 写入 Cloudflare D1 数据库。

## 本地验证

```sh
node --check app.js
node --check functions/api/items.js
node --check 'functions/api/items/[id].js'
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

如果忘记执行该迁移，Pages Functions 会在读取、新增或编辑商品时自动补齐 `cost_mode` 和 `daily_cost` 字段。

如果需要自定义域名，可以在 Pages 项目的 `Custom domains` 中添加域名，并按 Cloudflare 提示完成 DNS 配置。
