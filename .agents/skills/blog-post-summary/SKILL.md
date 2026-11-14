---
name: "blog-post-summary"
description: "把当前会话的主题整理成一篇博客文章，写进 ~/blog/astro 并在本地提交。用户说「写成博客」「总结成文章」「更新到文章里」时使用。"
---

# 把会话主题写成博客文章

用户的习惯是：一个会话一个主题，主题结束时把过程写成博客。博客是 Astro（Firefly 主题），仓库固定放在 Mac 的 `~/blog/astro`（远程仓库 `https://github.com/tracerZzz/tracerZzz.github.io.git`）。推送到 `master` 后：GitHub Actions（`.github/workflows/build.yml`）构建、检查并发布到 GitHub Pages（tracerzzz.github.io，备用站点）；阿里云 ESA Pages 按 `esa.jsonc` 自己拉代码构建，发布到主站 tracerzzz.cn。

## 1. 确认工作目录

- 本 skill 随仓库一起提交在 `.agents/skills/` 下，仓库目录就是工作区，不需要另外申请文件夹权限。
- 动手前确认当前工作目录是 `~/blog/astro`（`git rev-parse --show-toplevel` 的结果应该是 `$HOME/blog/astro`），远程是上面那个仓库。不是的话先停下来告诉用户，README 里有 clone 到这个目录的命令。

## 2. 先看现有文章，保持格式一致

- 文章在 `src/content/posts/<分类文件夹>/<中文标题>.md`，分类文件夹如 `mac`、`work`、`blog`、`game`、`git` 等，选最贴近的；图片放同名的 `<中文标题>.assets/` 文件夹。
- 文件名用中文标题（去掉空格和不适合做文件名的标点）。
- 写之前读一篇同分类的文章，照抄 front matter 结构：

```yaml
---
title: 中文标题：副标题
published: 2026-10-27T19:40:00+08:00   # 当天真实时间，带 +08:00
description: 一两句话说清楚问题、做法和收获
tags:
  - 标签
category: 工具
draft: false
slug: english-kebab-case   # 英文，决定网址 /posts/<slug>/
---
```

- 发布日期用真实日期，同一天写的就是同一天，不要为了好看把日期错开。
- 改写旧文章时保留原来的 `published`，加 `updated`，并在开头注明后来更新了什么。

## 3. 写作要求

- 浅显易懂：先讲背景和目标，再讲概念，再讲最终方案，最后是踩过的坑。
- 把会话里走过的弯路和每次修改的原因讲清楚（「为什么那样改」比「改了什么」更重要）。
- 配置、脚本完整贴出来并逐段解析，换新设备时能直接照着做；结尾给一个快速操作清单。
- 结尾附「参考：」链接，只放实际查过的来源。
- 网络、翻墙相关的主题用中性措辞：说「境外网站」「访问不稳定」，不用「被墙」「翻墙」「DNS 污染」之类的词（博客域名有 ICP 备案）。
- 中文加粗紧挨中文标点没问题（站点已装 remark-cjk-friendly），照常写。

## 4. 博客设置有变动时的额外规则

只要改了博客本身的设定（主题源码、配置、欢迎页、部署、依赖、本 skill 等）：

- 在 `CUSTOMIZATIONS.md` 里记下来（改了什么 / 为什么 / 升级后怎么检查），主题源码、配置文件、自己加的文件分别记在对应的小节。`CUSTOMIZATIONS.md` 是博客设定变更的唯一记录。
- **不用再更新《从 Hexo 迁移到 Astro》**（2026-11-14 起改为这条规则，见 `CUSTOMIZATIONS.md` 开头）。只有用户明确要求时才改它。

## 5. 本地提交

- 在 `~/blog/astro` 用 git 只 `add` 本次相关的文件。
- **提交信息用英文**，风格和仓库已有提交一致：动词开头的一句话，如 `Add post on ...`、`Fix ...`、`Update ...`。不同性质的改动（站点修复 与 新文章）分成不同的提交。
- 不要提交 `src/constants/github-card-data.json`、`src/constants/lqips.json`，这两个是本地构建时自动生成的。按 README 设置过 `skip-worktree` 的话它们不会出现在 `git status` 里；如果出现了，说明这份 clone 还没设置，提醒用户运行 README「拉取项目」里的那条 `git update-index --skip-worktree` 命令。
- 作者信息沿用仓库最近一次提交的作者（`git log -1 --format='%an <%ae>'`）。
- 提交前先看 `git status -sb`，确认用户没有自己先提交过；已经提交或推送过就不要重复提交。
- 不要改写已经推送过的提交（amend、rebase 之前先看 `git status -sb` 里有没有 `ahead`，只有还没推送的提交才能改）。

## 6. 交付时给用户的命令

每次改完文章或站点代码都给这三组（不要写行内 `#` 注释，zsh 会把它当参数）：

本地预览：

```bash
cd ~/blog/astro && pnpm dev
```

并给出文章地址 `http://localhost:4321/posts/<slug>/`；改的是站点代码时，给受影响的那篇文章的地址，并写清楚要检查什么。

推送到 GitHub（提交已经在本地做好，只给推送）：

```bash
cd ~/blog/astro && git push origin master
```

监听 GitHub Actions：

```bash
cd ~/blog/astro
sleep 5
gh run watch "$(gh run list --branch master --workflow build.yml --limit 1 --json databaseId -q '.[0].databaseId')" --exit-status
```

失败时看日志：

```bash
gh run view --log-failed
```

构建失败如果是下载字体、依赖这类网络问题（如 `CannotFetchFontFile`、`fetch failed`），和代码无关，重跑失败的任务即可：

```bash
cd ~/blog/astro && gh run rerun --failed
```

用户说「先别提交，我要审核」时，只写文件不提交，等用户确认后再提交。
