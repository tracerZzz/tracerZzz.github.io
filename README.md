# tracerZzz 的博客

基于 [Astro](https://astro.build/) 和 [Firefly](https://github.com/CuteLeaf/Firefly) 主题，由原来的 Hexo 博客迁移而来。

主题的配置都在 `src/config/` 下：站点信息 `siteConfig.ts`、导航 `navBarConfig.ts`、头像和简介 `profileConfig.ts`、首页横幅 `backgroundWallpaper.ts`、侧边栏 `sidebarConfig.ts`。

## 本地运行

需要 Node.js 22 和 pnpm（`npm install -g pnpm`）。

```bash
pnpm install   # 第一次运行前安装依赖
pnpm dev       # 本地预览，浏览器打开终端里显示的地址
pnpm build     # 构建静态网站，输出到 dist/
```

## 写文章

- 文章放在 `src/content/posts/`，可以按分类建子文件夹。
- 文件名用文章标题，比如 `git/git常用命令.md`；文件夹按主题分，用英文。文件名里不要有空格和 `+`。
- 文章网址由开头的 `slug` 决定（如 `slug: git-commands` → `/posts/git-commands/`，这是 Astro 自带的功能），和文件名、文件夹无关，移动或改名都不影响网址。
- 图片放在文章旁边的同名文件夹 `git常用命令.assets/` 里，用相对路径引用：`![](./git常用命令.assets/xxx.png)`。

Typora 设置（偏好设置 → 图像）：

- 插入图片时：选 Typora 自带的"复制图片到 ./${filename}.assets 文件夹"
- 勾选"对本地位置的图片应用上述规则""对网络位置的图片应用上述规则""优先使用相对路径""为相对路径添加 ./"；"插入时自动转义图片 URL"不勾
- 上传服务：无

Obsidian 设置（库打开在 `src/content/posts`）：

- 文件与链接：内部链接类型选"基于当前笔记的相对路径"，关闭"使用 [[Wiki 链接]]"，打开"自动更新内部链接"
- 安装插件 Custom Attachment Location：附件位置 `./${noteFileName}.assets`，文件名 `${date:YYYYMMDDHHmmssSSS}`

详细说明见文章《从 Hexo 迁移到 Astro》的"写作工具配置"一节。

文章开头的信息：

```yaml
---
title: 文章标题
published: 2026-10-22T20:00:00+08:00
description: 一两句话的摘要（可选）
tags:
  - git
category: Git       # 分类（可选），一篇文章一个
image: ./git常用命令.assets/封面.png   # 封面图（可选），显示在文章列表和文章顶部
pinned: false       # true 表示置顶
draft: false        # true 表示草稿，不会发布
slug: git-commands   # 网址，只用小写字母、数字和连字符，不要带 /
---
```

## 欢迎页

`/welcome/` 是原来博客的 SVG 动画欢迎页，独立于博客主题：

- 页面和菜单链接：`src/pages/welcome.astro`
- 动画时间线、菜单效果：`src/scripts/welcome/index.ts`（时间单位是秒）
- 补间动画小工具：`src/scripts/welcome/tween.ts`（不依赖第三方库）
- 大幅插画：`src/components/welcome/`

改完源码直接 `pnpm dev` 预览，`pnpm build` 时 Astro 会自动打包压缩，不需要手动处理。

## 迁移说明

- `scripts/migrate-hexo.py`：一次性的迁移脚本，把 Hexo 文章转换成现在的格式、把七牛上的图片放到每篇文章旁边，并为旧网址生成跳转页面。
- 旧网址（如 `/2018/01/14/iterm2/iterm2自定义命令/`）通过 `public/` 下的跳转页面自动跳到新网址。
- 原来的草稿在 `src/content/posts/drafts/`，都标记为 `draft: true`，不会发布。
