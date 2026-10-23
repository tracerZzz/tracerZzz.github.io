---
title: 从 Hexo 迁移到 Astro：图片找回、旧链接、欢迎页重写与双站点部署
published: 2026-10-23T10:30:00+08:00
updated: 2026-10-23T19:10:00+08:00
description: 记录把 2016 年搭的 Hexo 博客迁移到 Astro 的全过程：从七牛找回图片、转换文章、保留旧链接、重写 SVG 动画欢迎页、搭建自动检查，部署到阿里云 ESA 和 GitHub Pages，以及从 Retypeset 换到 Firefly 主题，中间踩过的坑和背后的原理。
tags:
  - astro
  - hexo
  - 博客
  - 部署
draft: false
category: 博客
slug: hexo-to-astro-migration
---

这个博客 2016 年用 Hexo 搭起来，写到 2018 年就基本停了。这几年它悄悄坏掉了：图床域名过期，所有文章的图片都打不开；本地的 Hexo 环境早就没了，想改点东西都得先折腾半天。

这次干脆整体迁到 [Astro](https://astro.build/)，顺便把这些年欠下的问题一起解决。这篇文章记录整个过程，以及每一步背后的原理，方便以后自己回头查。

## 一、原来的状况

- **框架**：Hexo + NexT 主题，源文件在 `hexoWorkspace` 仓库，生成的静态网站推到 `tracerZzz.github.io` 仓库，由 GitHub Pages 托管。
- **写作**：Typora 写 Markdown，图片用 PicGo 上传到七牛云，文章里引用七牛的外链。
- **域名**：博客用 `tracerzzz.cn`（已备案），图片用的是另一个域名，**已经过期**。
- **首页**：一个用 SVG + GSAP 补间动画做的欢迎页，点击里面的按钮才进入文章列表。动画代码当年是用 webpack 手动打包压缩的。

问题很明显：**文章和图片分在两个地方，图床一挂，文章就废了一半**。

## 二、目标和选型

1. **图片跟着文章走**：图片和 Markdown 放在一起，存进同一个 git 仓库。不再依赖任何图床。
2. **旧链接不能断**：以前分享出去的文章地址要能继续打开。
3. **欢迎页保留**：但要改成"改了源码就能自动打包"的形式，不再手动 webpack。
4. **主站放国内，再留一个备用**：主站用阿里云 ESA（边缘安全加速）的 Pages，国内访问快；GitHub Pages 作为备用站点。

框架选 Astro。主题一开始用的是 [Retypeset](https://github.com/radishzzz/astro-theme-retypeset)：排版干净，以文字为主。上线后觉得太素，文章列表也不能显示图片，又换成了 [Firefly](https://github.com/CuteLeaf/Firefly)（基于 Fuwari 二次开发）：卡片式布局，有封面图、首页横幅、分类和侧边栏。换主题的过程见第十二节。

图片目录沿用 Typora 的习惯：每篇文章旁边一个同名的 `.assets` 文件夹，文章里用相对路径引用。

```
src/content/posts/git/
├── git常用命令.md
└── git常用命令.assets/
    └── 20180514152628079993927.png
```

这样做的好处是：Typora 粘贴图片时会自动放进这个文件夹；以后换 Obsidian 之类的编辑器，相对路径也照样能用；Astro 构建时会自动把这些图片压缩、转成 webp。

## 三、从七牛找回图片

图片的域名过期了，但七牛的存储空间还在，文件都在里面，只是没有可用的域名能下载。

### 思路：绕过域名，直接用 API 下载

七牛提供 **S3 兼容接口**，可以像操作 AWS S3 一样，用 AccessKey/SecretKey 签名请求，直接列出和下载空间里的文件，不需要绑定任何域名。

macOS 自带的 curl 8.x 内置了 AWS 签名功能：

```bash
curl --aws-sigv4 "aws:amz:cn-east-1:s3" \
     --user "$AK:$SK" \
     "https://s3.cn-east-1.qiniucs.com/<空间名>/<文件名>" -o 文件名
```

写了一个脚本：先列出空间里所有文件，再逐个下载。AK/SK 运行时手动输入，不写进脚本，也不保存。

### 踩坑 1：签名一直报 `SignatureDoesNotMatch`

所有区域都返回 403 签名错误。原因是**控制台上看到的"空间名称"，不一定是 S3 接口里用的 bucket 名**。先调用 ListBuckets 接口列出真实的 bucket 名，再用它去请求，就好了。

**原理**：AWS SigV4 签名会把请求方法、路径、主机名、时间、区域等信息一起做 HMAC 计算。路径里的 bucket 名写错，服务端算出来的签名就和你的对不上，它不会告诉你"bucket 不存在"，只会说签名不匹配。所以遇到签名错误，先怀疑参数，而不是密钥。

### 踩坑 2：`invalid args`

改完后又报 `invalid args`。打印出来一看，AK/SK 两个变量的长度都是 0：在一个终端里 `export` 的变量，换了窗口就没了。改成脚本里用 `read` 读取，就解决了。

### 踩坑 3：macOS 的 sed 不认 `\n`

解析 S3 返回的 XML 列表时，用 `sed` 把标签替换成换行，在 Linux 上没问题，在 macOS 上却不生效。macOS 自带的是 BSD sed，替换内容里不支持 `\n`、`\t` 这种写法。改用 perl 解析，两边行为一致。

### 踩坑 4：中文文件名下载失败

178 个文件里有 6 个下载失败，全是中文文件名。macOS 自带的 bash 还是 3.2 版本，用它写的 URL 编码函数会按字符处理，不会按 UTF-8 的字节处理，中文就编码错了。签名用的路径和实际请求的路径对不上，又是签名错误。同样换成 perl 做 URL 编码，问题解决。

最后 178 个文件全部下载成功，文章实际用到的几十张图片一张不少。

## 四、转换文章

写了一个一次性的 Python 脚本（`scripts/migrate-hexo.py`），把 Hexo 文章转成 Astro 的格式。

### 文章开头的元信息（front matter）

三套写法对比（Hexo 是原来的，Retypeset 是第一版，Firefly 是现在用的）：

| Hexo | Retypeset | Firefly（现在） | 说明 |
|---|---|---|---|
| `title` | `title` | `title` | 不变 |
| `date` | `published` | `published` | 统一加上 `+08:00` 时区 |
| 无 | `updated` | `updated` | 更新时间，可选 |
| `excerpt`（里面嵌着 HTML 图片标签） | `description` | `description` | 去掉 HTML，只留纯文字。不写的话主题会从正文截取 |
| `tags` | `tags` | `tags` | 不变 |
| `categories`（可以多个） | 没有 | `category`（只能一个） | Retypeset 没有分类；Firefly 有，按文章所在文件夹自动填上 |
| 无 | 没有 | `image` | 封面图，显示在文章列表和文章顶部 |
| 无 | `pin: 1` | `pinned: true` | 置顶 |
| `_draft` 目录 | `draft: true` | `draft: true` | 草稿不会发布 |
| `permalink` 规则（全局） | `abbrlink` | `slug` | 文章网址，比如 `git-commands` 对应 `/posts/git-commands/`。Retypeset 用的是自己的 `abbrlink` 字段；换到 Firefly 后改用 Astro 自带的 `slug`，见第十二节 |

现在一篇文章开头的完整写法：

```yaml
---
title: git常用命令
published: 2018-04-15T16:37:11+08:00
description: 在开发过程中 git 已经是必不可少的版本控制工具……
tags:
  - git
category: Git
image: ./git常用命令.assets/20180514152628079993927.png
draft: false
slug: git-commands
---
```

必填的只有 `title` 和 `published`，其他都可以省略。

有个小坑：Hexo 的 `excerpt` 里直接写了没加引号的 HTML，YAML 解析会报错。脚本遇到解析失败时，先去掉 `excerpt` 再重试。

### 正文里的图片

1. 正文里的 `<img src="...">` 统一转成 Markdown 的 `![](...)` 写法，Astro 才会处理这些图片（压缩、生成多种尺寸）。
2. 所有指向旧图床的地址，改成 `./文章名.assets/文件名`，同时把图片复制到对应文件夹。
3. 转换完后检查，确认没有残留的旧域名。

### 文件命名

最开始文件名用的是英文（和网址一致），后来改成了文章标题，比如 `git常用命令.md`。因为**网址由开头的 `slug` 决定，和文件名、文件夹都无关**（迁移时叫 `abbrlink`，换主题后改成了 Astro 自带的 `slug`），文件名用中文在编辑器里更好认，移动文件或改名也不会影响网址。文件夹按主题分，统一用英文。

文件名里要避开两类字符：
- **空格**：Markdown 图片链接里的路径不能有空格，有空格就得用 `<>` 包起来，很容易出错。
- **`+`**：在 URL 的查询参数里，`+` 会被当成空格解码。开发模式下图片地址正好是通过查询参数传递的。

## 五、旧链接怎么不失效

Hexo 的网址格式是 `/年/月/日/分类/标题/`，比如 `/2018/04/15/git/git常用命令/`。新博客是 `/posts/git-commands/`。

静态托管没有服务器可以配置重定向规则（至少不能每个平台都配），所以用了最通用的办法：**在旧地址生成一个只做跳转的页面**。

```html
<!doctype html>
<html lang="zh"><head><meta charset="utf-8">
<title>git常用命令</title>
<link rel="canonical" href="/posts/git-commands/">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="0; url=/posts/git-commands/">
</head><body><p>文章已搬到新地址：<a href="/posts/git-commands/">git常用命令</a></p></body></html>
```

这些页面放在 Astro 的 `public/` 目录里，构建时原样复制。

- `meta refresh` 让浏览器立即跳转。
- `canonical` 告诉搜索引擎，正式地址是新的那个。
- `noindex` 让搜索引擎不要收录这个跳转页。

这个方案和主题、部署平台都无关，换主题、换平台都不用改。

## 六、欢迎页：从手动打包到 Astro 自动打包

原来的欢迎页由几部分组成：一个 316KB 的 HTML，里面塞满了内联 SVG；动画用 GSAP 1.x 的 TimelineMax；还依赖 jQuery、jquery-ui 的滑块、drawsvg 描边插件、randomColor 随机颜色。当年用 webpack 手动打包，每次改都要重新打包一遍。

### 改写方式

- 新建一个 `src/pages/welcome.astro`，作为独立页面放在 `/welcome/`，不套博客主题的布局。
- 大幅 SVG 插画拆成组件，放在 `src/components/welcome/`。
- 动画逻辑写成 TypeScript，放在页面的 `<script>` 里。**Astro（底层是 Vite）会自动打包压缩**，以后改完源码直接 `pnpm build` 就行。

### 为什么没用 GSAP

当时我的开发环境装不了 npm 依赖，就算装上了，也会和项目锁定的依赖版本对不上。所以干脆自己写了一个两百多行的小补间库（`tween.ts`），刚好够用：

- **时间线采用"确定性渲染"**：给定任意时间点 t，从初始状态出发，按开始时间依次计算每个补间在 t 时刻的值。这样拖动进度条到任意位置都能正确显示，循环播放也只是 `t % 总时长`。
- **每个补间的起始值预先算好**：等于它开始那一刻，前面所有补间叠加出来的值，相当于 GSAP 在补间第一次渲染时才记录起始值的行为。
- **SVG 的旋转和缩放以元素中心为原点**：用 `getBBox()` 求出中心，拼成 `translate(x y) rotate(r ox oy) translate(ox oy) scale(s) translate(-ox -oy)`，等同于 GSAP 的 `transformOrigin: "50% 50%"`。
- **描边动画**：用 `stroke-dasharray` 从 `0 L` 过渡到 `L 0`（L 是路径总长）。
- **缓动函数**：照着 GSAP 的公式实现，比如 Power3.easeInOut 就是四次方的缓入缓出，Back.easeInOut 带回弹。
- jquery-ui 的滑块换成原生的 `<input type="range">`，背景圆点的颜色变化直接用 CSS transition。

### 用截图对比来保证还原度

为了确认效果和原来一样，用 Playwright 打开新旧两个页面，用它的虚拟时钟把动画快进到同样的时间点，然后截图对比。这个过程中发现了几个原版里"看起来是这样，实际不是"的细节：

- **花瓶插画其实没有描边动画**。原代码对它调用了描边函数，但参数里有个 `fill: undefined`，GSAP 处理时出错，那个补间实际没生效。花瓶的线条其实是填充出来的形状，看到的变色是填充色在变。
- **右侧中心图案的变色看不出来**。原代码改的是外层 `<g>` 的 fill，但里面每条 path 自己都设了 fill 属性，会覆盖从父元素继承来的颜色。
- **背景圆点一直是半透明的**。原代码同时写了 `opacity: 1` 和 `css: {...}`。在 GSAP 1.x 里，一旦提供了 `css` 对象，外层的属性就不再被当作 CSS 处理，所以 `opacity: 1` 根本没生效，圆点一直保持 CSS 里的 0.22。

这些"bug"都按原样还原了，因为最终要的是看起来一样。

## 七、本地环境的小插曲

- **不是管理员账号**：这台 Mac 没有管理员权限，Homebrew 找不到现成的安装包，只能从源码编译 Node，结果连 LLVM 一起编译，几个小时都编译不完。改用 nvm 安装 Node：nvm 下载官方编译好的版本，装在用户目录下，不需要管理员权限，几分钟就好。
- **私有仓库 clone 要登录**：这和 git config 没关系，git config 里的用户名和邮箱只用来给提交署名。在 GitHub 生成一个只授权这个仓库的细粒度访问令牌（Fine-grained token），clone 时当作密码输入，macOS 钥匙串会记住它。
- **`Command "dev" not found`**：在错误的目录里运行了 `pnpm dev`。那个目录里没有项目的 `package.json`，pnpm 当然找不到 `dev` 命令。

## 八、开发模式和构建模式不一样

本地运行 `pnpm dev` 时，发现图片有时显示不出来，页面样式也乱了。但运行 `pnpm build && pnpm preview` 就一切正常。

| | `pnpm dev` | `pnpm build` + `pnpm preview` |
|---|---|---|
| 页面 | 打开时才生成 | 一次性生成到 `dist/` |
| 图片 | 第一次请求时才转 webp，大图要等几秒 | 构建时全部转好 |
| 样式 | 边扫描边生成（Retypeset 用的 UnoCSS），偶尔会缺 | 一次性生成完整 |
| 草稿 | **显示** | 不显示 |
| 用途 | 写作时即时预览 | 确认上线后的样子 |

图片还带着 `loading="lazy"`，滚到附近才开始加载。开发模式下，懒加载再加上第一次现场转码，看起来就像图片打不开。遇到这种情况刷新一下就好，线上不会这样。

## 九、自动检查

光看构建成功还不够：图片少了一张、旧链接跳转到不存在的页面、草稿被误发布……这些都不会让构建失败。所以写了 `scripts/verify-build.sh`，每次构建后自动检查：

- 每篇已发布的文章都生成了页面；
- 每篇文章页面里的图片数量，不少于 Markdown 里引用的数量；
- 页面里不再出现过期的旧图床域名；
- 草稿没有被发布；
- 每个旧链接跳转页都在，并且跳转目标存在；
- 欢迎页存在，菜单链接和打包后的脚本都在。

检查脚本先用"故意弄坏"的情况测试过，确认它真的能发现问题。然后接入 GitHub Actions：每次推送都执行一遍构建和检查。

一个小细节：检查欢迎页有没有 `<script type="module">` 时，第一次检查失败了。原因是 HTML 压缩工具会**调整属性顺序、去掉属性的引号**，构建出来的实际是 `<script src=... type=module>`。所以检查规则要写得和属性顺序、引号都无关。

## 十、分支整理

- 原来的 `master` 是 Hexo 生成的旧网站，改名为 `hexo-site` 留作存档。
- 新的 Astro 项目从 `astro` 分支改名为 `master`，作为默认分支。

默认分支改了以后，GitHub 的 Dependabot 安全提醒（之前报的都是旧 Hexo 的依赖）也随之消失了，因为它只检查默认分支。

## 十一、部署

### GitHub Pages（备用站）

**私有仓库用 GitHub Pages 要付费**（GitHub Pro）。博客内容本来就是公开的，所以直接把仓库改成了公开。公开前确认过：仓库里没有密钥，草稿被别人看到也无所谓。

接着又碰到一个报错：GitHub 自带的 Jekyll 构建失败，报 `Invalid YAML front matter in .../NoteIcon.astro`。

**原因**：Pages 的来源还是"Deploy from a branch"，GitHub 会把分支内容当成 Jekyll 网站来构建，它把 `.astro` 文件开头的 `---` 当成了 YAML 元信息。**解决**：把来源改成"GitHub Actions"，由我们自己的工作流构建 Astro，再用 `actions/deploy-pages` 发布。

Custom domain 留空，用默认地址 `tracerzzz.github.io`。因为一个域名同一时间只能解析到一个地方，`tracerzzz.cn` 留给主站 ESA。

### 阿里云 ESA（主站）

#### 三方的关系

```
访客输入 tracerzzz.cn
  │
  ▼
① 域名注册商（万网）：登记"这个域名由谁来解析"
  │
  ▼
② DNS 解析：把域名翻译成服务器地址
  │
  ▼
③ ESA：边缘节点 + Pages 托管网站
```

- **ESA 站点**是 `tracerzzz.cn` 在 ESA 里的总管理处：DNS 解析、HTTPS 证书、缓存、安全防护、跳转规则都在这里。
- **ESA Pages 项目**是网站本身：从 GitHub 拉代码，构建，发布。
- 关系是：**Pages 产出网站，站点把网站挂到域名上**。

#### NS 接入

接入方式有两种：
- **CNAME 接入**：DNS 留在原来的服务商，每个子域名手动加一条 CNAME 指向 ESA。
- **NS 接入**：把域名的 DNS 服务器整体交给 ESA。

选了 NS 接入：在万网把 `tracerzzz.cn` 的 DNS 服务器改成 ESA 给的两个地址，以后所有解析都在 ESA 里管理。根域名也能直接用，Pages 绑定域名时会自动生成解析记录。

**改完 NS，本机 dig 查到的还是旧的**。分层排查：

```bash
# 直接问 .cn 注册局，不走任何缓存
dig NS tracerzzz.cn @a.dns.cn +norec
```

注册局返回的已经是 ESA 的 NS（`*.ns.atrustdns.com`），TTL 是 86400 秒。也就是说修改已经生效，只是各级 DNS 的缓存最长要 24 小时才会过期。ESA 验证时查的是权威结果，所以不用等缓存，可以直接验证通过。

#### Pages 构建失败两次

1. **`Unknown command: "build"`**：控制台里填了 `npm build`，npm 没有这个命令，应该是 `npm run build`。而且项目用的是 pnpm，安装和构建都应该用 pnpm。ESA 的构建环境里没有预装 pnpm，所以安装命令要写成 `npm install -g pnpm && pnpm install`：先用 npm 把 pnpm 装上，再用 pnpm 按锁文件安装依赖。
2. **`Both assets and function js file are not found`**：构建其实成功了，但没告诉 ESA 发布哪个目录。

为了不再依赖控制台设置，在仓库根目录加了 `esa.jsonc`：

```jsonc
{
  "installCommand": "npm install -g pnpm && pnpm install",
  "buildCommand": "pnpm build",
  "assets": {
    "directory": "./dist",
    "notFoundStrategy": "404Page"
  }
}
```

有了这个文件，ESA 会优先用它，控制台的设置就不起作用了。配置跟着代码走，修改也有记录可查。

#### 绑定域名：为什么 DNS 记录列表是空的

在 Pages 项目里绑定 `tracerzzz.cn` 后，站点的 DNS 记录列表里却显示 0 条。原来 Pages 绑定的域名不会显示成普通的 A 或 CNAME 记录，而是单独列在"边缘函数记录"里。

背后的原理：
1. NS 已经交给 ESA，所以任何人查询 `tracerzzz.cn`，最终都会问到 ESA 的 DNS。
2. ESA 的 DNS 发现这个域名绑定了 Pages，就**返回离访客最近的边缘节点 IP**。
3. 浏览器连到这个节点，请求里带着 `Host: tracerzzz.cn`。节点根据它找到对应的 Pages 项目，再去找当前部署版本里的文件。比如请求 `/posts/git-commands/`，就返回 `dist/posts/git-commands/index.html`。
4. 文件第一次被请求时从 ESA 的存储读取，之后缓存在节点上。

整个过程中没有一台属于我自己的服务器。

#### 根域名和 www

`tracerzzz.cn`（根域名，主机记录 `@`）和 `www.tracerzzz.cn`（子域名，主机记录 `www`）在 DNS 里是两个独立的域名，解析、证书都要分别配置。博客的正式地址是不带 www 的那个，`www` 绑到同一个 Pages 项目上，以后再加一条 301 跳转规则跳到根域名。

#### HTTPS

ESA 免费版自带 Let's Encrypt 免费证书，自动续期。申请到的是泛域名证书，证书里登记的域名（SAN）同时包含 `*.tracerzzz.cn` 和 `tracerzzz.cn`。这一点要确认：**泛域名 `*.tracerzzz.cn` 本身不包含根域名**，`*` 只匹配"某个前缀 + 点"，有些平台签发时不会自动带上根域名。

还开了两个选项：
- **强制 HTTPS**：http 请求用 301 跳转到 https。
- **OCSP Stapling**：浏览器要确认证书没被吊销，不开的话得自己去问证书颁发机构。开了以后，ESA 提前准备好"证书有效"的证明，随证书一起发给浏览器，首次连接更快。

HSTS 暂时没开：它会让浏览器在设定的时长内只认 HTTPS，一旦配置有误很难撤回，等稳定运行一段时间再说。

## 十二、换主题：从 Retypeset 到 Firefly

### 为什么能换得这么轻松

前面的结构从一开始就和主题无关：文章和图片在 `src/content/posts/`，旧链接跳转页在 `public/`，欢迎页是独立页面，ESA 配置和检查脚本也和主题没关系。真正要处理的只有两件事：**文章开头的字段名**，和**文章网址的生成规则**。

换主题时没有直接在 `master` 上改，而是开了一个 `theme-firefly` 分支：把 Firefly 的代码放进去，再把文章、图片、跳转页、欢迎页、ESA 配置、检查脚本搬回来。GitHub Actions 会构建这个分支、跑检查，但不发布；本地 `pnpm dev` 看满意了，再合并到 `master`。

### 保持网址不变：从 `abbrlink` 换成 `slug`

Firefly 用文件路径生成文章网址，比如 `git/git常用命令.md` 会变成 `/posts/git/git常用命令/`。直接这样用的话，所有网址都会变，旧链接跳转页也全部失效。

**第一版做法**：沿用 Retypeset 时代的 `abbrlink` 字段，在内容集合里自定义文章 ID：

```ts
loader: glob({
  pattern: "**/*.{md,mdx}",
  base: "./src/content/posts",
  // 有 abbrlink 就用 abbrlink 当 ID，没有才用文件路径
  generateId: ({ entry, data }) =>
    typeof data.abbrlink === "string" && data.abbrlink
      ? data.abbrlink
      : entry.replace(/\.(md|mdx)$/i, ""),
}),
```

主题里所有生成文章链接的地方用的都是这个 ID，所以网址都变回了 `/posts/git-commands/`。能用，但这是改了主题的代码，以后升级主题时，这几行可能会被覆盖，或者和新版本冲突。

**现在的做法**：后来发现根本不用改代码。Astro 的 `glob` 加载器本身就有这个规则：文章开头写了 `slug`，就用它当 ID；没写，才用文件路径。Firefly 自带的 `pnpm new-post` 生成的也是 `slug` 字段。于是把所有文章的 `abbrlink` 改名为 `slug`，再删掉上面那段自定义代码，`content.config.ts` 就和主题原版一模一样了。网址一个没变。

`slug` 只用小写字母、数字和连字符，不要带 `/`，带了网址里就会多出一层目录。

### 分类和封面

- **分类**：用脚本给每篇文章补上 `category`，值按所在文件夹来，比如 `git/` 对应"Git"，`database/` 对应"数据库"。
- **封面**：用正文里的第一张图。这里又踩了一次"代码里的示例被当成真图片"的坑：迁移这篇文章里有一句举例用的 `![](./文章名.assets/...)`，被脚本当成了封面，构建时找不到这个文件。改成跳过代码块里的内容就好了。

### 进出欢迎页时的残影

Firefly 用 swup 做页面过渡：切换页面时不整页刷新，而是只替换页面里几块固定的区域（横幅、正文、侧边栏），再配上淡入淡出。欢迎页是独立页面，没有这几块区域，所以进出欢迎页时只换掉了一部分，剩下的就成了残影。

解决办法是让 swup 跳过欢迎页：

```js
swup({
  // ...
  ignore: (url) =>
    new URL(url, window.location.href).pathname.startsWith("/welcome") ||
    window.location.pathname.startsWith("/welcome"),
}),
```

目标是欢迎页，或者当前就在欢迎页，都按普通方式整页跳转；博客内部各页面之间照样有过渡动画。

### 分页后横幅位置不一样

文章列表翻到第二页，横幅的壁纸取景和第一页不一样。原因是 Firefly 把横幅分成两种：首页的横幅更高、带大标题；其他页面的横幅会整体上移一截，留出更多空间给正文。主题只把 `/` 当首页，第二页的地址是 `/2/`，被当成了普通页面。

把分页地址（`/2/`、`/3/`……）也算作首页就好了。这个判断主题里有三处：生成页面时一处，浏览器里 swup 切换页面时两处。三处都要改，否则直接打开第二页正常，从第一页点过去又会不一样。

### 其他小事

- **横幅壁纸**换成了饥荒联机版的加载界面，开了轮播，淡入淡出切换。头像换回了原来 Hexo 博客用的柴犬。
- **关掉了用不上的功能**：友链、留言板、动态、相册、音乐播放器、公告、打赏、看板娘。在 `src/config/siteConfig.ts` 里都是一个开关。
- **删掉了主题仓库自带的 GitHub 配置**：Issue 模板、赞助按钮、Dependabot。Dependabot 是给主题作者自己的仓库自动升级依赖用的，留着它会在我的仓库里不停建分支。
- **`pnpm new-post` 也改了**：生成的 `slug` 只取文件名部分（不带文件夹），日期带上 `+08:00` 时区。
- **本地预览的小坑**：切到新主题的分支后，再运行一次 `pnpm dev`，如果旧主题的预览服务还开着，新的会自动换到 4322 端口。这时去 4321 端口看到的还是旧主题。

## 十三、写作工具配置

图片跟着文章走的前提是：**编辑器粘贴图片时，要自动存到 `文章名.assets/` 文件夹，并写成相对路径**。否则图片会落到别的地方，或者变成本机绝对路径，换台电脑就打不开了。

### Typora

偏好设置（`Cmd + ,`）→ **图像**：

- **插入图片时**：下拉框里直接选 Typora 自带的 **复制图片到 ./${filename}.assets 文件夹**。`${filename}` 是 Typora 的变量，代表当前文件名（不带 `.md`）。
- 勾选 **对本地位置的图片应用上述规则**：从电脑里拖进来的图片也会复制过去，原文件留在原地。
- 勾选 **对网络位置的图片应用上述规则**：粘贴网上的图片时，会下载到本地，不留外链。以后不会再出现图床失效的问题。
- 勾选 **优先使用相对路径**。
- 勾选 **为相对路径添加 `./`**：和现有文章的写法 `./xxx.assets/xxx.png` 保持一致。
- **插入时自动转义图片 URL**：不勾。勾了会把中文文件名转成 `%E4%BB%8E...` 这样的编码，不方便阅读，Astro 不需要它。
- **允许根据 YAML 设置自动上传图片**：不勾。
- **上传服务**：选"无"。不再用 PicGo 上传图床。

配置好后，粘贴一张截图，Typora 会生成 `![](./文章名.assets/image-20261023103000000.png)`，文件夹不存在会自动创建。

> 注意：先保存文件再粘贴图片。新建的文件还没有文件名，Typora 不知道该把图片放到哪里。

### Obsidian

**库（vault）只打开 `src/content/posts`**，不要打开整个项目，否则它会去索引 `node_modules` 里几万个文件。Obsidian 会在这里生成 `.obsidian/` 配置文件夹，已经写进 `.gitignore`，不会被提交。

设置 → **文件与链接**：

- **内部链接类型**：选"基于当前笔记的相对路径"。
- **使用 [[Wiki 链接]]**：关闭。Astro 不认识 `[[ ]]` 和 `![[图片]]`，必须是标准 Markdown 链接。
- **自动更新内部链接**：打开。在 Obsidian 里改文件名、移动文件时，引用它的链接会跟着改。

**图片位置**：Obsidian 自带的"附件默认存放路径"只能选一个固定名字的子文件夹（比如统一叫 `attachments`），做不到"每篇文章一个同名 `.assets`"。需要装社区插件 **Custom Attachment Location**：

- **附件位置**：`./${noteFileName}.assets`
- **附件文件名**：`${date:YYYYMMDDHHmmssSSS}`，用时间戳命名。Obsidian 默认的 `Pasted image 2026...png` 带空格，放在 Markdown 链接里容易出问题。
- 插件的变量写法可能随版本变化，以插件设置页里的说明为准。

**文章模板**：用 Obsidian 自带的"模板"核心插件，存一份开头的元信息，新建文章时插入。注意 `published` 要写成带时区的格式，比如 `2026-10-23T10:30:00+08:00`。Obsidian 属性面板里的日期默认不带时区，会被当成 UTC，显示的时间差 8 小时。

两个编辑器的约定一致，同一篇文章用 Typora 写还是用 Obsidian 写都可以，图片位置和链接写法都一样。

## 十四、现在的发布流程

```
本地写文章 → git push 到 master
                 │
                 ├──► GitHub Actions：构建 → 检查 → 发布到 tracerzzz.github.io
                 │
                 └──► ESA Pages：拉取 → 构建 → 发布到 tracerzzz.cn
```

日常写作就是：

```bash
pnpm new-post git/新文章标题   # 生成带元信息的新文件
pnpm dev                       # 边写边预览
git add -A && git commit -m "新文章" && git push
```

两三分钟后，两个站点都更新了。构建失败不会替换线上版本；ESA 的部署记录里也可以一键回滚到之前的版本。

## 十五、还没做的

- 正式切换到 Obsidian 管理所有 Markdown。
- `www` 跳转到根域名的规则。
- 草稿慢慢整理发布。
- 评论系统、访问统计。

## 回头看

这次迁移最大的收获，是把"文章依赖外部服务"变成了"所有东西都在一个仓库里"：文章、图片、欢迎页、构建配置、部署配置，全部跟着 git 走。图床过期、平台变动、换主题、换编辑器，都不会再让博客坏掉。后来真的换了一次主题，从开分支试用到正式上线只用了一个下午，所有网址一个没变，算是验证了这个结构。

另一个体会是：**大部分问题都出在"两个东西之间的约定"上**。比如空间名和 bucket 名不是一回事，BSD sed 和 GNU sed 行为不同，bash 3.2 不能按字节处理 UTF-8，Jekyll 会去解析 `.astro` 文件，泛域名证书不包含根域名。每个问题单独看都不难，难的是知道该往哪个方向怀疑。

