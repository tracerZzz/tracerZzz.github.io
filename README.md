# tracerZzz 的博客

基于 [Astro](https://astro.build/) 和 [Retypeset](https://github.com/radishzzz/astro-theme-retypeset) 主题，由原来的 Hexo 博客迁移而来。

## 本地运行

需要 Node.js 22 和 pnpm（`npm install -g pnpm`）。

```bash
pnpm install   # 第一次运行前安装依赖
pnpm dev       # 本地预览，浏览器打开终端里显示的地址
pnpm build     # 构建静态网站，输出到 dist/
```

## 写文章

- 文章放在 `src/content/posts/`，可以按分类建子文件夹。
- 文件名用英文小写加连字符，比如 `git-commands.md`，它同时是文章的网址：`/posts/git-commands/`。
- 图片放在文章旁边的同名文件夹 `git-commands.assets/` 里，用相对路径引用：`![](./git-commands.assets/xxx.png)`。

Typora 设置（偏好设置 → 图像）：

- 插入图片时：复制图片到 `./${filename}.assets` 文件夹
- 勾选“优先使用相对路径”

文章开头的信息：

```yaml
---
title: 文章标题
published: 2026-10-22T20:00:00+08:00
description: 一两句话的摘要（可选）
tags:
  - git
draft: false        # true 表示草稿，不会发布
abbrlink: git-commands   # 网址，只能用小写字母、数字和连字符
---
```

## 迁移说明

- `scripts/migrate-hexo.py`：一次性的迁移脚本，把 Hexo 文章转换成现在的格式、把七牛上的图片放到每篇文章旁边，并为旧网址生成跳转页面。
- 旧网址（如 `/2018/01/14/iterm2/iterm2自定义命令/`）通过 `public/` 下的跳转页面自动跳到新网址。
- 原来的草稿在 `src/content/posts/drafts/`，都标记为 `draft: true`，不会发布。
