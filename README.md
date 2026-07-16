# 商品日均成本

一个无后端依赖的本地商品日均成本记录工具。数据保存在浏览器 `localStorage` 中，适合通过 Cloudflare Pages 托管为静态网站。

## 本地验证

```sh
node --check app.js
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
- 环境变量：无需配置

部署步骤：

1. 登录 Cloudflare Dashboard。
2. 进入 `Workers & Pages`，选择 `Create application`。
3. 选择 `Pages`，连接 GitHub，并授权访问 `AYLJzj520/life-cost` 仓库。
4. 选择仓库后按上面的推荐设置填写构建配置。
5. 创建项目并等待首次部署完成。
6. 之后只要把代码推送到 GitHub 的 `main` 分支，Cloudflare Pages 就会自动更新线上项目。

如果需要自定义域名，可以在 Pages 项目的 `Custom domains` 中添加域名，并按 Cloudflare 提示完成 DNS 配置。
