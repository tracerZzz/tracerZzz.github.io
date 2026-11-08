# 对 Firefly 主题做过的修改

本仓库的主题代码复制自 [CuteLeaf/Firefly](https://github.com/CuteLeaf/Firefly)，**不是 fork**，所以升级主题时要手动合并。这份清单记录了和主题原版不一样的每一处，升级时逐项核对。

- **基准版本**：Firefly v6.16.8，提交 `cd920b035b475fe9a6cd3a88afb42cf9440bb8a9`（2026-10-22）
- **规则**：以后每改一次主题源码，都要更新这份清单，并把基准版本改成升级后的版本。
- **规则**：只要改了博客的设定（主题、配置、欢迎页、部署等），都要同步更新博客文章《从 Hexo 迁移到 Astro》（`src/content/posts/blog/从Hexo迁移到Astro.md`）。

## 一、主题源码的修改（升级时最容易冲突）

改动处都有中文注释，搜注释里的关键词就能找到。

| 文件 | 改了什么 | 为什么 | 升级后怎么检查 |
|---|---|---|---|
| `astro.config.mjs` | `integrations` 最前面加了一个 `local-scripts` 小集成，把 `src/scripts/music-resume.ts` 和 `src/scripts/welcome/controller.ts` 注入到每个页面 | 刷新页面后接着播放音乐；欢迎页在 swup 切换时的挂载 / 卸载 | 博客里放歌，点进欢迎页再回来，音乐不中断；欢迎页动画正常、回到博客能正常滚动 |
| `src/utils/layout-utils.ts` | `isHomePage` 把 `/2/`、`/3/`……也算首页 | 分页被当成普通页面，横幅变矮、壁纸取景和第一页不一样 | 打开 `/2/`，横幅和首页一样高、有大标题 |
| `src/utils/navigation-utils.ts` | 同上（浏览器端的判断） | 同上 | 同上 |
| `src/utils/swup-transitions.ts` | 同上（swup 切换页面时的判断） | 不改的话，直接打开 `/2/` 正常，从首页点过去又不一样 | 从首页点分页按钮到第二页，横幅不变 |
| `src/components/misc/SharePoster.svelte` | 加了 `shareUrl()`，复制链接和海报二维码用当前访问的域名 | 网站同时部署在 tracerzzz.cn 和 tracerzzz.github.io，构建时写进页面的是主域名 | 在 tracerzzz.github.io 的文章页点分享 → 复制链接，粘贴出来是 github.io 的地址 |
| `src/components/misc/License.astro` | "本文链接"加了 `data-post-link` 和一段脚本，换成当前域名 | 同上 | 在 tracerzzz.github.io 的文章底部，本文链接是 github.io 的地址 |
| `scripts/new-post.js` | 生成的 `slug` 只取文件名（不带文件夹）；日期带时分和 `+08:00` | 带文件夹的 slug 会让网址多一层目录；没时区会被当成 UTC | `pnpm new-post git/测试`，看生成的开头 |
| `src/components/layout/PostMeta.astro` | 文章页的发布日期前加「发布于」、更新日期前加「更新于」（复用主题自带的 `I18nKey.publishedAt` / `updatedAt` 文案）；列表卡片传了 `hideUpdateDate`，不显示文字 | 原来两个日期只有图标，并排放着分不清哪个是发布、哪个是更新 | 打开一篇有 `updated` 的文章（如 Nginx 那篇），标题下显示「发布于 … 更新于 …」；首页卡片只有日期 |
| `astro.config.mjs` | swup 的 `ignore` 选项：地址最后一段带扩展名、又不是 `.html` 的链接（CSV、脚本、PDF、压缩包、`rss.xml` 等）一律不走 swup；`rehypePlugins` 里加了 `rehypeFileLinks`（见下面第三节） | swup 默认拦截所有站内链接，会把文件当网页去加载：地址栏变成文件地址，页面卡在切换动画里，浏览器后退也错乱。最早只列了 PDF、压缩包等扩展名，后来 CSV、`.py` 漏掉了又出了一次同样的问题，所以改成按"有没有扩展名"判断 | 打开《成本分摊的理论与实践》，点 `bandwidth-sample.csv` 直接下载、页面不变，浏览器后退回到上一页；点旁边的「在 GitHub 上查看」在新标签页打开 GitHub |
| `src/components/layout/Navbar.astro` | 图片 logo 的 `<img>` 加了 `width="28" height="28"` | logo 用的是 `favicon.svg`，只有 viewBox 没有宽高；整页刷新时 CSS 还没加载，会按默认尺寸画出一个大图标闪一下 | 浏览器开慢速网络（DevTools → Network → Slow 3G）刷新页面，导航栏图标不会先变大再缩小 |
| `astro.config.mjs` | 引入 `remark-cjk-friendly`，放在 `remarkPlugins` 第一个（依赖也加进了 `package.json`） | 按 CommonMark 规范，`**` 紧挨着中文标点、另一侧又紧挨着汉字时不算加粗，比如 `是**「需要时启用」**开着`，页面上会原样显示星号 | 打开《让 Mac 指定网站走手机热点》，搜「需要时启用」，是加粗的、没有星号 |
| `src/utils/feed-utils.ts` | 加了 `replaceMermaidWithImages()`：生成 RSS / Atom 正文时，在 sanitize 之前把 Mermaid 流程图（浅色 + 深色两份内嵌 `<svg>`）换成一个 `<img>`，指向另存的浅色 SVG 文件（`https://tracerzzz.cn/diagrams/<哈希>.svg`）；匹配不上时构建日志里打警告 | sanitize-html 的白名单里没有 `<svg>`，流程图在订阅里整个被删掉，阅读器（如 NetNewsWire）里看不到图；阅读器也不执行 CSS / JS，不能靠内嵌 SVG。正则对应 `rehype-mermaid.mjs` 的输出结构，主题改了结构要跟着改 | `pnpm build` 后 `bash scripts/verify-build.sh` 里「feed diagrams」一项通过、构建日志没有 `[feed]` 警告；在阅读器里打开《用医院类比理解Go的GMP调度》，流程图能显示 |
| `src/utils/feed-utils.ts` | 生成 feed 正文时，在 sanitize 之前用 `simplifyCodeBlocks()`（见第三节 `feed-code-blocks.mjs`）把 Expressive Code 代码块换成朴素的 `<pre><code class="language-xx">`；sanitize 放行 `code` 上的 `language-*` 类名；转换失败时构建日志里打警告 | Expressive Code 每行一个 `<div>`、行号也是单独的 `<div>`，class 被清洗掉后，阅读器里变成「行号一行、代码一行」，还夹着「展开收起」字样 | `verify-build.sh` 里「feed code blocks」一项通过、构建日志没有 `[feed]` 警告；在阅读器里打开《用医院类比理解Go的GMP调度》，代码块是正常的多行代码、没有行号 |
| `src/utils/feed-utils.ts` | 生成 feed 正文时，在 sanitize 之前用 `katexToImages()`（见第三节 `feed-math.mjs`）把每个 KaTeX 公式换成 MathJax 渲染的 SVG 图片（`alt` 是 TeX 源码），MathJax 渲染失败的退回只保留 `<math>`；sanitize 放行 `img` 的 `style`（只允许 `height`、`vertical-align` 两个 ex 单位的值，让行内公式和文字对齐），以及退回时用的 MathML 标签和属性；有退回或转换失败时构建日志里打警告。依赖里加了 `mathjax-full` | KaTeX 每个公式有 MathML 和显示用的 `<span>` 两份，清洗后 `<math>` 被删、`<span>` 没了样式，阅读器里公式文字、TeX 源码、显示文字拼在一起；只留 MathML 的话不少网页版阅读器也会删掉 | `verify-build.sh` 里「feed diagrams and formula images」「feed math」两项通过、构建日志没有 `[feed]` 警告；在阅读器里打开《CDN 是怎么收费的：从流量、95 峰值到日峰月均，厂商和客户两边看计费》，公式是图片、分数上下排 |
| `src/utils/feed-utils.ts` | 生成 feed 正文时去掉标题旁的「#」锚点（`removeHeadingAnchors()`），sanitize 时用 `transformTags`（`absoluteUrlTransforms()`）把 `a` 的 `href`、`img` 的 `src` / `srcset` 补成完整网址，页内跳转（`#标题`）指向网页上的对应位置；两个函数见第三节 `feed-links.mjs` | 正文里的图片、站内链接都是相对路径，有的阅读器不补全，图片裂、链接点不开；锚点在阅读器里只剩一个多余的「#」 | `verify-build.sh` 里「feed links」一项通过；订阅里随便点一张图、一个站内链接都能打开 |
| `astro.config.mjs` | `integrations` 最前面加了 `feedDiagrams()`（见第三节 `feed-diagrams.mjs`） | 构建结束时把 feed 用到的流程图 SVG 复制到输出目录的 `/diagrams/` | 构建日志里有 `copied N feed diagram(s)`，`dist/diagrams/` 下有文件 |

`src/content.config.ts` 曾经改过（用 `abbrlink` 当文章 ID），后来改用 Astro 自带的 `slug` 字段，已经恢复成主题原版。

## 二、配置文件（`src/config/`，本来就是给用户改的）

升级时如果主题也改了这些文件，一般是加了新的配置项：保留我们的值，把新配置项加进来。

| 文件 | 改了什么 |
|---|---|
| `siteConfig.ts` | 站点标题、副标题、网址、描述、关键词、favicon（丁字尺：`favicon.ico`、`favicon.svg`、`apple-touch-icon.png`）、导航栏 logo（改为 `image` 类型，用 `/favicon.svg`）和标题、建站日期；关掉友链、留言、动态、项目、相册、书签、打赏页面；关掉 OG 图片生成 |
| `navBarConfig.ts` | 导航只留：主页、文章（归档/分类/标签）、关于、GitHub |
| `profileConfig.ts` | 头像（`src/assets/images/avatar-shiba.webp`）、名字、简介、GitHub 链接；删掉邮箱 |
| `backgroundWallpaper.ts` | 横幅壁纸换成饥荒联机版加载界面（`src/assets/images/wallpaper/`），开轮播、淡入淡出、8 秒；关掉背景视频；横幅标题、副标题、按钮（GitHub / 欢迎页 / RSS）；图片位置 |
| `sidebarConfig.ts` | 关掉公告、动态两个侧边栏组件 |
| `musicConfig.ts` | 音乐播放器改用 Meting 接口播放网易云歌单 `2059184801`，导航栏和侧边栏都显示 |
| `coverImageConfig.ts` | `enableInPost` 改为 `false`：文章详情页不显示封面（封面取自正文里的图，开着会重复），列表、分享海报、预览图照样用 |
| `commentConfig.ts` | 评论系统改为 Giscus：仓库 `tracerZzz/tracerZzz.github.io`，Discussions 分类 Announcements，按网址（pathname）区分评论 |
| `FooterConfig.html` | 页脚加上 ICP 备案号 `京ICP备18058118号-1`，链接到 `https://beian.miit.gov.cn/` |

## 三、我们自己加的文件（主题里没有，升级不会冲突）

- `src/pages/welcome.astro`、`src/components/welcome/`、`src/scripts/welcome/`：欢迎页。它套在主题的 `MainGridLayout` 里，用一个全屏图层盖住下面的博客页面；swup 切换时由 `controller.ts` 挂载 / 卸载。为了不让底下的博客一闪而过，样式里用到了主题的 `#content-wrapper`（欢迎页存在时关掉它的入场动画和 `transform`）。主题升级后如果 swup 容器的 ID（`#swup-container`）、`#content-wrapper` 或 `MainGridLayout` 变了，要跟着检查
- `src/scripts/music-resume.ts`：整页跳转后恢复音乐播放，只调用主题播放器公开的 `window.__fireflyMusic` 接口；主题升级后如果这个接口变了，要跟着改
- `src/plugins/rehype-file-links.mjs`：文章里指向 `/files/` 的附件链接自动加 `download` 和 `data-no-swup`，并在后面补一个链到 GitHub 仓库同一文件的「在 GitHub 上查看」。能不能预览交给 GitHub 判断，插件里不存文件类型清单；个别附件不想要这个链接，把 Markdown 链接标题写成 `no-view`，如 `[数据.zip](/files/数据.zip "no-view")`。附件放在 `public/files/` 下，写文章时用普通 Markdown 链接即可
- `src/plugins/feed-diagrams.mjs`：RSS / Atom 里的流程图。`saveFeedDiagram()` 把 SVG 按内容哈希命名写进 `node_modules/.cache/feed-diagrams/`，`feedDiagrams()` 集成在构建开始时清空这个目录、构建结束时复制到输出目录的 `/diagrams/`。文件名随内容变，内容不变网址就不变
- `src/plugins/feed-code-blocks.mjs`：RSS / Atom 里的代码块。`simplifyCodeBlocks()` 找到每个 `<div class="expressive-code">` 代码块，按行取出 `<div class="code">` 里的文字，拼回朴素的 `<pre><code>`；有文件名标题的话放在代码块前面。依赖 Expressive Code 的输出结构，主题升级改了结构要跟着改
- `src/plugins/feed-math.mjs`：RSS / Atom 里的公式。`katexToImages()` 从每个 `.katex` / `.katex-display` 的 `<annotation>` 里取出 TeX 源码，用 MathJax（`mathjax-full`）渲染成白底黑字的 SVG，经 `feed-diagrams.mjs` 的 `saveFeedDiagram()` 存到 `/diagrams/`；渲染失败的交给 `katexToMathml()` 只保留 `<math>`。`MATHML_TAGS`、`MATHML_ATTRIBUTES` 是退回时 sanitize 要放行的标签和属性。依赖 KaTeX 的输出结构
- `src/plugins/feed-links.mjs`：RSS / Atom 里的地址。`removeHeadingAnchors()` 去掉 rehype-autolink-headings 生成的「#」锚点；`absoluteUrlTransforms()` 是给 sanitize-html 用的 `transformTags`，把地址补成以文章网址为基准的完整网址
- `public/2016/`、`public/2017/`、`public/2018/`：旧 Hexo 网址的跳转页
- `public/favicon.ico`、`public/favicon.svg`、`public/apple-touch-icon.png`（丁字尺图标）、`src/assets/images/avatar-shiba.webp`、`src/assets/images/wallpaper/`
- `esa.jsonc`：阿里云 ESA Pages 的构建配置
- `scripts/verify-build.sh`：构建后的自动检查
- `scripts/migrate-hexo.py`：当初从 Hexo 迁移用的一次性脚本
- `src/content/spec/about.md`：关于页（内容替换）
- `README.md`、`CUSTOMIZATIONS.md`（本文件）

## 四、删掉的主题文件

- `.github/` 下除了我们自己的 `workflows/build.yml` 以外的文件：主题仓库自己的 CI、Issue 模板、赞助配置、Dependabot
- `vercel.json`、`wrangler.jsonc`：Vercel / Cloudflare 的部署配置，用不上
- `AGENTS.md`、`CLAUDE.md`、`CONTRIBUTING.md`、`README.en.md`、`docs/`：主题仓库的说明文档
- 主题自带的示例文章、动态、项目

## 五、升级步骤

```bash
# 1. 拿到主题新版本
git clone --depth 1 https://github.com/CuteLeaf/Firefly.git /tmp/firefly-new

# 2. 开一个分支试升级，不影响线上
git checkout -b theme-upgrade

# 3. 看主题从基准版本到新版本改了哪些文件（在主题仓库里）
cd /tmp/firefly-new && git fetch --unshallow
git diff --stat cd920b035b475fe9a6cd3a88afb42cf9440bb8a9 HEAD
```

4. 对没出现在本清单"一""二"里的文件：直接用新版本覆盖。
5. 对清单里的文件：用新版本覆盖后，按表格把我们的改动重新加回去。
6. `package.json`、`pnpm-lock.yaml` 用新版本的，然后 `pnpm install`。
7. `pnpm build`，确认 `bash scripts/verify-build.sh` 通过；`pnpm dev` 按上面"升级后怎么检查"一列逐项看一遍。
8. 推送分支，GitHub Actions 通过后合并到 `master`，更新本文件开头的基准版本。
