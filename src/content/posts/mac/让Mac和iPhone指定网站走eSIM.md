---
title: 让 Mac 和 iPhone 指定网站走 eSIM：sing-box 分流实录
published: 2026-10-27T19:40:00+08:00
updated: 2026-10-31T21:30:00+08:00
description: 家里 Wi-Fi 访问一部分境外网站不稳定，iPhone 上的境外 eSIM 访问正常但流量很少。这篇记录怎么让 Mac（通过手机热点）和 iPhone 自己都只把指定网站分给 eSIM，其他流量照常走 Wi-Fi。最后两台设备共用一份 sing-box 配置，用 iCloud 同步，规则全部来自社区规则集，基本不用手动维护。附完整配置、一路补过的漏洞和换设备时的快速清单。
tags:
  - macOS
  - iOS
  - 网络
  - sing-box
  - Clash
category: 工具
draft: false
slug: mac-hotspot-split-routing
---

> **2026-10-31 更新**：Mac 也从 Clash Verge Rev 换成了 sing-box，和 iPhone 共用同一份配置，放在 iCloud 云盘里同步；手写的域名规则全部换成了社区规则集；记录了换过来之后国内网站全部打不开的排查过程。Clash 方案保留在第三节作为过程记录，完整配置以第五节为准。

我的 iPhone 是双卡：主号是国内卡，日常用；另外有一张境外 eSIM，访问境外网站很顺畅，但流量很少。家里的 Wi-Fi 访问 Claude、GitHub、Google 这类境外网站不稳定，Steam 商店也时好时坏。

我想要的效果是，不管在 Mac 上还是在 iPhone 上：

- **指定的境外网站**走 eSIM
- **其他所有流量**（国内网站、游戏下载、系统更新）照常走家里 Wi-Fi
- eSIM 流量能省则省，不能有流量在我不知道的时候偷偷走 eSIM

最后两台设备都用 sing-box 实现了，而且用的是**同一份配置文件**。中间先后试过静态路由和 Clash Verge Rev，也补了好几轮漏洞，这篇把过程和原理讲清楚，最后附上换设备时的快速操作清单。

## 一、先搞懂几个概念

### 网卡名和 IP 不是一回事

终端里运行 `ifconfig`，会看到 `en0`、`en6` 这样的名字，下面跟着一串 IP 地址。

- **网卡名**是系统给硬件起的编号。`en0` 一般就是这台 Mac 的 Wi-Fi 网卡，不管连哪个网络都叫 `en0`。
- **IP 地址**是当前连着的那个网络临时分给你的。连家里 Wi-Fi 是 `192.168.1.x`，连 iPhone 热点就是 `172.20.10.x`。

可以把网卡名理解成**门牌号**，IP 是**这次住进来的人**：门牌固定，住的人随网络变化。所以配置分流时不能认 IP。

### Mac 要让两个网络同时在线

Mac 只有一块 Wi-Fi 网卡，同一时间只能连一个 Wi-Fi。如果 Wi-Fi 连的是手机热点，那所有流量都在走热点，没有东西可以「分」。

正确的连法是：

- **Mac 的 Wi-Fi** 连家里路由器，做主网络
- **iPhone 用数据线**连 Mac，打开个人热点，Mac 上会多出一块叫「iPhone USB」的网卡

两块网卡各连各的，这才叫同时在线。两个网络都在线时，系统默认把流量交给**服务顺序排在前面**的那个。在「系统设置 → 网络」里点列表下方的「⋯」→「设定服务顺序」，要保证 **Wi-Fi 排在 iPhone USB 上面**。

### iPhone 双卡同一时间只有一张卡能上网

iPhone 的双卡是「双卡双待」：两张卡都能待机接电话，但**同一时间只有一张卡连着数据网络**，就是「设置 → 蜂窝网络 → 蜂窝数据」里选中的那张。另一张卡的数据通道根本没有建立。

这带来两个结论：

- **个人热点走的是当前的数据卡。** 要让 Mac 通过热点用上 eSIM，数据卡就得是 eSIM。
- **iPhone 做不到「按网站自动换卡」。** 切换数据卡要好几秒，而且会断开所有连接，App 也没有权限切换。iPhone 上能做的分流是 **Wi-Fi 和蜂窝之间**的分流：在家时 iPhone 同时有家里 Wi-Fi 和蜂窝数据（eSIM）两个出口，按网站选其中一个。

另外，**iPhone 的个人热点只共享蜂窝数据，从不共享它连着的 Wi-Fi**。热点共享出去的流量也不经过 iPhone 上的 sing-box，Mac 的分流由 Mac 自己的 sing-box 负责，两边互不干扰。

整体是这样：

| 设备 | 国内网站 | 境外网站 | 谁负责分流 |
| --- | --- | --- | --- |
| iPhone（连着家里 Wi-Fi） | 家里 Wi-Fi | 蜂窝 → eSIM | iPhone 上的 sing-box |
| Mac | 家里 Wi-Fi | iPhone USB 热点 → eSIM | Mac 上的 sing-box |

前提只有一个：**在家时 iPhone 的数据卡要设成 eSIM**。出门没有 Wi-Fi 时，把数据卡切回主号就行。

## 二、Mac 上的第一次尝试：静态路由

最直接的想法是改路由表：告诉系统「去这几个 IP 的流量，交给热点的网关」。

```bash
sudo route add -net 160.79.104.0/23 172.20.10.1
```

`172.20.10.1` 是 iPhone 热点的网关。我写了个脚本，定时解析域名、给解析出来的 IP 加路由，后来还做成了一个带开关的 SwiftUI 小应用。对 Claude 这种域名少、IP 段固定的服务确实好用，但扩展到更多网站时问题就来了：

1. **只能按 IP 分，不能按域名分。** 路由表只认 IP，每个域名都要先解析成 IP 再加路由，子域名也得一个个写，`*.google.com` 这种通配写法用不了。
2. **DNS 解析结果不一定可用。** 有些境外域名在家里网络上解析，拿到的地址本身就连不上，把这种地址路由到热点也没用。
3. **CDN 的 IP 会共用和变化。** 同一个 CDN 节点可能同时服务很多网站，解析结果还经常变。

几十个网站还能凑合，常用的境外网站有几千个域名，这条路走不通。

## 三、Mac 的第二个方案：Clash Verge Rev

Clash Verge Rev 是一个开源的网络规则工具，内核叫 mihomo。很多人用它配合代理服务，但它也可以**完全不用代理**，只做一件事：按规则决定每条连接从哪块网卡出去。这一节记录它的原理，现在的 sing-box 方案也是同样的思路。

### 数据是怎么走的

打开「虚拟网卡模式」（TUN）后，系统里会多出一块虚拟网卡，所有流量都先进这块网卡，再由规则决定去向：

```text
应用（浏览器、Steam、Claude）
        │  所有 DNS 查询和连接
        ▼
虚拟网卡 utun（mihomo 接管）
        │  按域名 / IP 匹配规则
        ▼
   ┌────┴─────────────┐
   ▼                  ▼
Wi-Fi（DIRECT）     iPhone USB（热点 → eSIM）
国内网站、下载        Claude、GitHub、Google、Steam 商店
```

以打开 google.com 为例：

1. **浏览器问「google.com 的 IP 是多少」。** 这个 DNS 查询被虚拟网卡截住，mihomo 不去真查，而是立刻回一个假地址（比如 `198.18.0.5`），同时记下「`198.18.0.5` 就是 google.com」。这叫 **fake-ip 模式**。
2. **浏览器去连 `198.18.0.5`。** 这个连接也进了虚拟网卡。
3. **mihomo 查回域名，匹配规则。** 根据假 IP 查回 `google.com`，命中「Google 走热点」的规则。
4. **mihomo 从热点网卡发起真正的连接。** 它先经热点用海外 DNS 查到真实地址，再连过去，然后在两头之间搬运数据。

这个设计解决了静态路由的三个问题：能**按域名分流**，子域名自动覆盖；需要走热点的域名**经热点用海外 DNS 解析**，结果可靠；还有社区维护的**现成规则集**，几千个域名开箱即用。mihomo 自己发出去的连接不会又被吸回虚拟网卡，因为它发起连接时会直接**绑定在指定的真实网卡上**。

### 用了几天后的问题

Clash 方案能用，但有几处不顺手：

- **要写死热点网卡名。** 配置里的出口要写 `interface-name: en6` 这样的网卡名，每台电脑、每部手机可能都不一样，我为此还写了一个自动识别网卡、改配置的脚本。
- **和 iPhone 是两套配置。** iPhone 上只能用 sing-box，两边的配置格式完全不同，加一个网站要改两个地方。
- **后台多一个常驻服务。** 虚拟网卡模式要装一个系统服务，加上界面程序，对这台 2016 年的老 MacBook Pro 来说不算轻。

后来发现 sing-box 在 Mac 上也能用同一份配置，而且不用写网卡名，就整体换了过去。

## 四、最终方案：一份 sing-box 配置，两台设备共用

### 两个出口

[sing-box](https://sing-box.sagernet.org/) 从 1.11 版开始，可以给直连出口[指定网络类型](https://sing-box.sagernet.org/configuration/shared/dial/)（`network_type`，可选 `wifi`、`cellular`、`ethernet`、`other`），这项功能支持苹果平台的图形客户端。配置里只有两个出口：

| 出口 | 写法 | 走哪里 | 用于 |
| --- | --- | --- | --- |
| `default` | 普通直连 | 系统默认网络，在家就是 Wi-Fi | 国内网站和其他所有流量 |
| `esim` | `network_type: ["cellular", "ethernet"]` | 蜂窝或有线网卡 | 境外网站列表、Claude、ChatGPT、GitHub、Google |

### 为什么一份配置能在两台设备上用

关键就在 `esim` 出口的 `["cellular", "ethernet"]`：

- **在 iPhone 上**，有蜂窝网络，`esim` 走蜂窝，也就是 eSIM。iPhone 没有有线网卡，`ethernet` 用不到。
- **在 Mac 上**，没有蜂窝网络，`esim` 就走有线网卡。iPhone 用数据线开热点时，macOS 把它当成一块有线网卡，于是 `esim` 正好走 iPhone 热点。家里网络走 Wi-Fi，和它分开。

我在 Mac 上实际验证过：日志里能看到 `outbound/direct[esim]: dial en6`，`en6` 就是 iPhone USB 热点。这样配置里**不用写网卡名**，换手机、换电脑都不用改，Clash 时代那个识别网卡的脚本也就用不上了。

这个写法有两个前提：Mac 平时不能同时插网线上网，否则 sing-box 分不清哪块有线网卡是热点；以及第一节说的，服务顺序里 Wi-Fi 要排在 iPhone USB 前面。如果哪台 Mac 把 iPhone 热点识别成了别的类型，把 `ethernet` 换成 `other` 试试。

### 为什么不用 Clash 的「智能回落」

Clash 配置里有一个「热点优先」组：热点断了就自动回落到 Wi-Fi。sing-box 这份配置里没有。原因是这些境外网站在家里网络上本来就访问不稳定，回落过去也打不开，而为了探测热点通不通，还要定时消耗热点流量。所以干脆不做：热点断了，这些网站就打不开，插上线就恢复。

### 用 iCloud 同步

sing-box 的苹果客户端新建配置时可以选「iCloud」类型，读取 iCloud 云盘里 sing-box 文件夹中的 JSON 文件。我把配置放在那里，Mac 和 iPhone 读的是同一个文件，改一次两边都生效，具体见第八节。

## 五、完整配置

保存为 `esim-split.json`，放进「iCloud 云盘 → sing-box」文件夹。sing-box 从 1.14 起支持在配置文件里写 `//` 注释，所以说明直接写在了文件里，复制整份就能用：

```jsonc
// ============================================================
//  esim-split.json：Mac 和 iPhone 共用的 sing-box 分流配置
//  放在「iCloud 云盘 → sing-box」里，两台设备都选 iCloud 类型的配置读取它
//
//  效果：
//    - Claude、ChatGPT、GitHub、Google、常用境外网站 → 走 eSIM
//        iPhone 上是蜂窝数据（数据卡设为 eSIM）
//        Mac 上是 iPhone 用数据线开的热点
//    - 国内网站和其他所有流量 → 走家里 Wi-Fi
//
//  改完这个文件后，要在 sing-box 里把开关关掉再打开才会生效
//  需要 sing-box 1.14 及以上（支持 // 注释和 http_clients 写法）
// ============================================================
{
  // ---------- 日志 ----------
  // warn：只记录警告和错误。排查问题时可以临时改成 info，看每条连接的去向
  "log": {
    "level": "warn"
  },

  // ---------- DNS：域名解析 ----------
  "dns": {
    "servers": [
      {
        // 境外 DNS（Cloudflare 的加密 DNS），查询本身也经 esim 出口发出
        // 这样拿到的是境外网络视角下真实可用的地址
        "type": "https",
        "tag": "dns-esim",
        "server": "1.1.1.1",
        "detour": "esim"
      },
      {
        // 国内 DNS（阿里的加密 DNS），走默认网络，解析国内网站又快又准
        "type": "https",
        "tag": "dns-cn",
        "server": "223.5.5.5"
      }
    ],
    "rules": [
      {
        // 要走 eSIM 的域名只返回 IPv4 地址：境外 eSIM 漫游时只有 IPv4，
        // 拿到 IPv6 地址会连不上（Claude 桌面版的长连接就会因此断开）
        // 国内网站不受影响，照常可以用 IPv6
        "query_type": [
          "AAAA"
        ],
        "rule_set": [
          "anthropic",
          "openai",
          "overseas-list",
          "github",
          "google"
        ],
        "action": "predefined"
      },
      {
        // 要走 eSIM 的域名，用境外 DNS 解析
        "rule_set": [
          "anthropic",
          "openai",
          "overseas-list",
          "github",
          "google"
        ],
        "action": "route",
        "server": "dns-esim"
      }
    ],
    // 其他所有域名都用国内 DNS
    "final": "dns-cn"
  },

  // ---------- 下载规则集用的 HTTP 客户端 ----------
  // 规则集托管在 GitHub 上，家里网络访问不稳定，所以经 esim 出口下载
  "http_clients": [
    {
      "tag": "esim-http",
      "detour": "esim"
    }
  ],

  // ---------- 入口：虚拟网卡 ----------
  // 系统所有流量都先进这块虚拟网卡，再由下面的规则决定从哪个出口出去
  "inbounds": [
    {
      "type": "tun",
      "tag": "tun-in",
      // 虚拟网卡自己的地址，用的是不会和真实网络冲突的保留网段
      "address": [
        "172.19.0.1/30",
        "fdfe:dcba:9876::1/126"
      ],
      // 自动把系统默认路由指向虚拟网卡
      "auto_route": true,
      // 严格路由：防止流量绕过虚拟网卡直接出去
      "strict_route": true
    }
  ],

  // ---------- 出口 ----------
  "outbounds": [
    {
      // 普通直连，跟随系统默认网络：在家就是 Wi-Fi
      "type": "direct",
      "tag": "default"
    },
    {
      // 直连，但只走「蜂窝」或「有线」网络
      //   iPhone：有蜂窝，走蜂窝数据（eSIM）；iPhone 没有有线网卡，ethernet 用不到
      //   Mac：没有蜂窝，走有线网卡；iPhone 用数据线开的热点在 Mac 上就是一块有线网卡
      // 所以同一份配置在两台设备上都正确，也不用写网卡名
      // default 策略：只用这两类网络，它们不可用时不会偷偷改走 Wi-Fi
      // 前提：Mac 不能同时插网线上网；如果某台 Mac 把热点识别成别的类型，把 ethernet 换成 other
      "type": "direct",
      "tag": "esim",
      "network_strategy": "default",
      "network_type": [
        "cellular",
        "ethernet"
      ]
    }
  ],

  // ---------- 分流 ----------
  "route": {
    // 自动找到真实网卡，sing-box 自己发出的连接直接绑定到真实网卡，不会又绕回虚拟网卡
    "auto_detect_interface": true,
    // sing-box 自己需要解析域名时（比如连接出口），默认用国内 DNS
    "default_domain_resolver": "dns-cn",
    // 下载规则集时默认用上面的 esim-http
    "default_http_client": "esim-http",

    // ---------- 规则集：全部来自社区，每 7 天自动更新 ----------
    // 来源：https://github.com/MetaCubeX/meta-rules-dat 的 sing 分支
    // 源头列表：https://github.com/v2fly/domain-list-community 的 data 目录
    // geosite = 按域名分组，geoip = 按 IP 段分组
    "rule_set": [
      {
        // Claude / Anthropic 的全部域名，包括 Artifact 用的 claudeusercontent.com
        "type": "remote",
        "tag": "anthropic",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/anthropic.srs",
        "update_interval": "7d"
      },
      {
        // ChatGPT / OpenAI 的全部域名，包括静态资源域名
        "type": "remote",
        "tag": "openai",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/openai.srs",
        "update_interval": "7d"
      },
      {
        // 常用境外网站列表（上游文件名沿用项目原名）
        // Steam 商店和社区、Telegram、X、YouTube、Grok 等都在里面
        "type": "remote",
        "tag": "overseas-list",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/gfw.srs",
        "update_interval": "7d"
      },
      {
        // GitHub 全部域名
        "type": "remote",
        "tag": "github",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/github.srs",
        "update_interval": "7d"
      },
      {
        // Google 全部域名，包括 Gemini
        "type": "remote",
        "tag": "google",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google.srs",
        "update_interval": "7d"
      },
      {
        // 下面四个是这几家服务自己的 IP 段，用来兜底「只有 IP、没有域名」的连接
        "type": "remote",
        "tag": "google-ip",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/google.srs",
        "update_interval": "7d"
      },
      {
        "type": "remote",
        "tag": "telegram-ip",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/telegram.srs",
        "update_interval": "7d"
      },
      {
        "type": "remote",
        "tag": "twitter-ip",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/twitter.srs",
        "update_interval": "7d"
      },
      {
        "type": "remote",
        "tag": "facebook-ip",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/facebook.srs",
        "update_interval": "7d"
      },
      {
        // 国内 IP 段，用在最后一条 QUIC 规则里
        "type": "remote",
        "tag": "cn-ip",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/cn.srs",
        "update_interval": "7d"
      }
    ],

    // ---------- 分流规则：从上往下匹配，命中第一条就停 ----------
    "rules": [
      {
        // 1. 嗅探：从 TLS、HTTP、QUIC 握手里读出域名
        //    App 写死 IP、或浏览器自己用加密 DNS 时，靠它照样能按域名分流
        "action": "sniff"
      },
      {
        // 2. 接管所有 DNS 查询，交给上面的 DNS 规则处理
        "protocol": "dns",
        "action": "hijack-dns"
      },
      {
        // 3. 局域网地址走 Wi-Fi，不然路由器后台、打印机都访问不了
        "ip_is_private": true,
        "action": "route",
        "outbound": "default"
      },
      {
        // 4. Claude、ChatGPT、境外网站、GitHub、Google 走 eSIM
        //    Steam 不用单独写：商店和社区在境外网站列表里，下载域名不在任何列表里，会走 Wi-Fi
        "rule_set": [
          "anthropic",
          "openai",
          "overseas-list",
          "github",
          "google"
        ],
        "action": "route",
        "outbound": "esim"
      },
      {
        // 5. 只有 IP 的连接：按这几家服务的 IP 段兜底，也走 eSIM
        "rule_set": [
          "google-ip",
          "telegram-ip",
          "twitter-ip",
          "facebook-ip"
        ],
        "action": "route",
        "outbound": "esim"
      },
      {
        // 6. 发往境外 IP 的 QUIC（HTTP/3，UDP 443）一律拒绝
        //    QUIC 有时读不出域名，会漏到 Wi-Fi；拒绝后 App 会立刻改用 TCP，
        //    TCP 能读出域名，就能按上面的规则分流。国内 IP 的 QUIC 不受影响
        "type": "logical",
        "mode": "and",
        "rules": [
          {
            "network": "udp",
            "port": 443
          },
          {
            "rule_set": "cn-ip",
            "invert": true
          }
        ],
        "action": "reject"
      }
    ],
    // 7. 其他所有流量走 Wi-Fi
    "final": "default"
  },

  // ---------- 其他 ----------
  "experimental": {
    // 把规则集等缓存到本地，重启后不用重新下载
    "cache_file": {
      "enabled": true
    }
  }
}
```

### 配置解析

**出口（`outbounds`）**

- `default`：普通直连，跟随系统默认网络。
- `esim`：直连，用 `network_type` 限定只走蜂窝或有线网卡，原理见第四节。`network_strategy: default` 表示只用这两类网络，不会在它们不可用时偷偷改走 Wi-Fi。

**DNS（`dns`）**

- `dns-cn`：阿里的加密 DNS，走默认网络，解析国内网站。
- `dns-esim`：Cloudflare 的加密 DNS，经 `esim` 出口发出，专门解析要走 eSIM 的域名，保证拿到境外网络视角下可用的地址。
- 第一条规则让**要走 eSIM 的域名只返回 IPv4 地址**（拦掉 `AAAA` 查询）。境外 eSIM 漫游时只有 IPv4，拿到 IPv6 地址就连不上；国内网站不受影响，照常可以用 IPv6。为什么这条很重要，见第九节。

**规则集（`route.rule_set`）**

全部来自 [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) 项目的 `sing` 分支，配置里**没有一条手写的域名**：

| 配置里的名字 | 上游文件 | 内容 |
| --- | --- | --- |
| `anthropic` | `geo/geosite/anthropic.srs` | Claude / Anthropic 的全部域名，包括 Artifact 用的 `claudeusercontent.com` |
| `openai` | `geo/geosite/openai.srs` | ChatGPT / OpenAI 的全部域名，包括静态资源域名 |
| `overseas-list` | `geo/geosite/gfw.srs` | 常用境外网站域名（上游文件名沿用了项目里的原名），Steam 商店和社区、Telegram、X、YouTube、Grok 等都在里面 |
| `github` | `geo/geosite/github.srs` | GitHub 全部域名 |
| `google` | `geo/geosite/google.srs` | Google 全部域名，包括 Gemini |
| `google-ip`、`telegram-ip`、`twitter-ip`、`facebook-ip` | `geo/geoip/` 下同名文件 | 这几家服务自己的 IP 段 |
| `cn-ip` | `geo/geoip/cn.srs` | 国内 IP 段 |

`http_clients` 定义了一个经 `esim` 出口下载的客户端，`route.default_http_client` 让所有规则集都用它下载，因为规则集托管在 GitHub 上。每 7 天更新一次（`update_interval: 7d`），列表变化很慢，没必要天天下载、浪费 eSIM 流量。

**分流规则（`route.rules`）**

规则**从上往下匹配，命中第一条就停**：

1. `sniff`：从 TLS、HTTP、QUIC 握手里读出域名。浏览器自己用加密 DNS 解析、或者 App 写死了 IP 时，靠它照样能按域名分流。
2. `hijack-dns`：接管所有 DNS 查询，交给上面的 DNS 规则处理。
3. 局域网地址走默认网络，不然路由器后台、打印机都访问不了。
4. Claude、ChatGPT、境外网站列表、GitHub、Google 走 `esim`。**Steam 不用单独写**：商店和社区的域名已经在境外网站列表里，下载用的 `steamcontent.com` 和国内下载节点不在任何列表里，会落到最后走 Wi-Fi。
5. **只有 IP 的连接按 IP 段兜底。** Google、Telegram、Twitter（X）、Facebook 这几家有时会绕过域名、直接用 IP 连接，按它们自己的网段走 `esim`。
6. **发往境外 IP 的 QUIC 一律拒绝。** 原因见第九节。
7. 其他所有流量走 `default`（`final`）。

## 六、Mac 上的设置

### 安装

sing-box 的 Mac 版在 App Store 里叫 sing-box，[官方文档](https://sing-box.sagernet.org/clients/apple/)说需要中国大陆以外的 Apple 账户。我用外区账号也提示「所在国家尚不提供此 App」，最后用 Homebrew 装了官方的独立版（SFM），功能一样，也能读 iCloud 配置：

```bash
brew install --cask sfm
```

注意是 `--cask sfm`。`brew install sing-box` 装的是命令行版，不支持 `network_type`，也读不了 iCloud 配置。

第一次启动时按提示允许安装网络扩展。如果系统提示「系统扩展已被阻止」，去「系统设置 → 隐私与安全性」点「允许」，之后再允许添加 VPN 配置。

### 网络设置

1. **Wi-Fi 连家里路由器**，并在「系统设置 → Wi-Fi」里关掉 iPhone 热点的「自动加入」，防止 Mac 自己连到热点上。
2. **iPhone 数据卡设成 eSIM**，用数据线连 Mac，打开「个人热点 → 允许其他人加入」，第一次连接时在手机上点「信任」。
3. **关掉 iPhone USB 的「需要时启用」**：「系统设置 → 网络 → iPhone USB → 详细信息」。
4. **服务顺序**：Wi-Fi 排在 iPhone USB 上面。
5. **Wi-Fi 的 IPv6 设成「自动」**：「系统设置 → 网络 → Wi-Fi → 详细信息 → TCP/IP」，「配置 IPv6」选「自动」。如果之前为了别的代理工具改成过「仅本地链接」，国内网站会全部打不开，原因见第九节。

### 导入配置

在 sing-box 里新建配置，类型选「iCloud」，选中 `esim-split.json`，回到首页启动。

如果之前装过 Clash Verge Rev 之类的工具，先关掉它的虚拟网卡和系统代理并退出，两个软件同时接管流量会互相干扰。

## 七、iPhone 上的设置

### 装哪个 App

sing-box 的 iOS 客户端在国区 App Store 搜不到，需要外区 Apple ID，App 本身免费。要装的是[官方文档里链接的那个](https://sing-box.sagernet.org/clients/apple/)（App Store 上叫 sing-box MT）。

在 App Store 搜「sing-box」时排在前面的「sing-box VT」**不是官方的**：开发商是另一家公司，页面上自称「又一个发行版」，内核还停在 1.11。这份配置用的是 1.12 以后的 DNS 写法，在它上面会直接报错。

### 设置步骤

1. **导入配置**：打开 sing-box →「配置」→ 新建 → 类型选「iCloud」→ 选 `esim-split.json`。回到「仪表」页面选中这个配置，打开开关。第一次会请求添加 VPN 配置，点允许。
2. **允许 sing-box 使用蜂窝数据**：「设置 → 蜂窝网络」，往下翻到 sing-box，打开开关。不打开的话，`esim` 出口走不了蜂窝。
3. **在家时数据卡设成 eSIM**：「设置 → 蜂窝网络 → 蜂窝数据」选 eSIM，并关掉同一页底部的「允许切换蜂窝数据」。
4. **关掉「无线局域网助理」**：「设置 → 蜂窝网络」拉到最底部。它会在 Wi-Fi 信号差时自动改用蜂窝，在家时蜂窝就是 eSIM。
5. **给 eSIM 打开「低数据模式」**：「设置 → 蜂窝网络 →」点 eSIM 线路。系统会暂停照片同步、自动更新这类后台任务，只影响蜂窝，连着 Wi-Fi 时照常进行。

出门后把数据卡切回主号，这时两个出口都只剩蜂窝，sing-box 开着关着效果一样。

### 连上 Wi-Fi 自动切卡、自动开 sing-box

用「快捷指令」的自动化就能做到，连上 Wi-Fi 时自动把数据卡切到 eSIM，并打开 sing-box：

1. 「快捷指令」→「自动化」→「+」→「无线局域网」，网络选家里的 Wi-Fi，勾选「加入」，选「立即运行」。
2. 添加操作「**设定默认号码**」，显示为「将默认 数据 号码设为 …」：把「数据」保持不变，号码选 eSIM。注意不要选成「语音」，那是打电话用的默认号码。
3. 添加操作「**设定 VPN**」，显示为「连接 SFI」（SFI 是 sing-box 的 iOS 客户端在系统里的名字）。

要在离开时自动关掉，再建一个自动化：同样选家里的 Wi-Fi，勾选「离开」，操作选「设定 VPN」→「断开连接」。想顺便切回主号，再加一个「设定默认号码」，号码选主号。

几个细节：

- **网络最好选家里的 Wi-Fi，而不是「任何网络」。** 选「任何网络」的话，在外面连公司、咖啡店的 Wi-Fi 也会切到 eSIM。
- **别同时打开 sing-box 自己的「按需启动」。** 它的作用一般是「断了自动重连」，会和「离开时断开」打架。
- 网上很多文章说 iOS 14.5 起快捷指令就能切换数据卡，我核对后发现那次加的是「设定语音与数据」，只能切换 4G/5G 模式，不能换卡。实际能换卡的是「设定默认号码」这个操作，以你手机里实际能搜到的为准。

## 八、用 iCloud 同步配置

两台设备读的都是「iCloud 云盘 → sing-box」里的 `esim-split.json`。在 Mac 上用任意编辑器改完保存即可，但有两点要注意：

1. **sing-box 不会自动重新加载。** 它只在启动时读一次配置，改完后要在 App 里把开关关掉再打开。
2. **iPhone 要先收到新文件。** iCloud 同步有时要等几秒到几分钟。想快一点，就在 iPhone 的「文件」App 里打开「iCloud 云盘 → sing-box」，点一下这个文件，它会立刻下载最新版，然后再重启 sing-box。

改错了也不怕：配置有语法错误时，sing-box 启动会直接报错，不会带着错误配置悄悄运行。

另外，刚重启或者刚加了新规则集时，sing-box 要先经 eSIM 下载规则集，这几十秒里对应的网站可能打不开，等一会儿就好。

## 九、一路补过的漏洞

这套配置不是一次写成的。下面这些坑，有的是实际用的时候在日志和「连接」页面里发现的，有的是专门回头检查「会不会悄悄打不开」和「会不会悄悄用掉 eSIM 流量」时找到的。

### Mac 连接上的坑

**Wi-Fi 连的就是热点。** 一开始 Mac 的 Wi-Fi 也连着 iPhone 热点，所有流量都在走热点，没有东西可分。记得在「系统设置 → Wi-Fi」里把 iPhone 热点的「自动加入」关掉，不然 Mac 会自己连回去。

**iPhone USB 显示「已连接」，却拿不到 IP。** 用 `ifconfig en6` 一看，状态是 `inactive`。原因是「系统设置 → 网络 → iPhone USB → 详细信息」里的**「需要时启用」**开着（英文版叫 Disable unless needed）：只要还有 Wi-Fi 可用，系统就把 iPhone USB 停掉，左边的状态点是黄色的。关掉之后状态点变绿，马上拿到了 `172.20.10.x`。这是整个过程里最隐蔽的一个坑。

**iPhone 开热点后自己断开了 Wi-Fi。** iPhone 打开个人热点后，通常会断开它自己连着的 Wi-Fi，因为热点要占用 Wi-Fi 芯片。这时 iPhone 上所有 App 都改走蜂窝数据，而数据卡正是 eSIM，微信、视频这些国内流量也会消耗 eSIM。所以 Mac 用热点时手机尽量少用，用完就关热点，iPhone 会自动连回 Wi-Fi。

### 规则上的漏洞

**Claude 的 Artifact 有时打不开。** 最初 Claude 的规则是手写的 `claude.ai`、`claude.com`、`anthropic.com` 三个域名，而 Artifact（Claude 生成的网页）运行在独立的域名 `claudeusercontent.com` 下。查了社区项目 [v2fly/domain-list-community](https://github.com/v2fly/domain-list-community) 的 `data/anthropic`，里面已经收录了 Anthropic 的十几个域名，于是改用这个社区列表，以后 Claude 启用新域名也会自动跟进。ChatGPT 同理，境外网站列表里只有主域名，没有 `oaistatic.com` 这类静态资源域名，加了社区的 `openai` 列表。

**Steam 的规则写了一大串，其实一条都不需要。** Clash 时期我写了十几条 Steam 规则：先把下载、客户端更新、国内下载节点挑出来走 Wi-Fi，再让商店走热点。之所以这么麻烦，是因为用了 `steampowered.com` 这种宽泛的写法，会把 `client-download.steampowered.com` 这类下载域名也带去走热点。后来对照了境外网站列表，它已经精确收录了商店和社区的子域名（`store.steampowered.com`、`steamcommunity.com`、`steamstatic.com` 等），下载域名一个都不在里面。什么都不写，结果就是「商店走 eSIM、下载走 Wi-Fi」，和游戏加速器的「商店加速」是一个效果。唯一的代价是商店里的预告片视频也会走 eSIM。

**QUIC 连接识别不出域名。** iPhone 的连接页面里有一条 `UDP 64.233.170.101:443` 走了 Wi-Fi，下载量为 0，30 秒后超时。这是 Google 的 IP，用的是 QUIC（HTTP/3）。这种新协议的域名有时读不出来，连接只剩一个 IP，所有域名规则都失效，落到了默认出口。App 发现 QUIC 连不上，一般会退回普通的 TCP，所以最终能用，只是会慢几秒。

与其追着整理 IP 段，不如**从根上把这类连接变成能识别域名的连接**：发往境外 IP 的 QUIC 一律拒绝。App 会立刻改用 TCP，这是所有浏览器和主流 App 都有的标准行为，几乎没有延迟；TCP 连接能读出域名，自然就按列表分流了。国内 IP 的 QUIC 不受影响。另外再按 Google、Telegram、Twitter、Facebook 这几家自己的 IP 段兜底，覆盖那些直接用 IP 连接的情况。

**换成 sing-box 后，Mac 上国内网站全部打不开。** Google 这类境外网站正常，国内网站在浏览器里一个都打不开，可 `nslookup baidu.com` 能解析，`curl https://www.baidu.com` 也返回 200。看 sing-box 日志，满屏都是这样的报错：

```text
connection: open connection to [240e:83:205:381:0:ff:b00f:96a2]:443
using outbound/direct[default]: dial en0 (8): dial tcp [...]: connect: no route to host
```

`240e:` 开头的是国内运营商的 IPv6 地址。国内大网站基本都有 IPv6 地址，浏览器优先用 IPv6 去连，而 Mac 的 Wi-Fi（`en0`）上根本没有 IPv6 线路，连不上，浏览器也没有退回 IPv4；`curl` 失败后会马上换 IPv4，所以它能成功。

我一度以为是家里宽带没有 IPv6，在配置里把 IPv6 全部禁掉（DNS 只返回 IPv4 地址、拒绝所有 IPv6 连接），国内网站确实恢复了。但同一个 Wi-Fi 下 iPhone 走 IPv6 完全正常，说明宽带是有 IPv6 的。最后查到原因在 Mac 自己：用 Clash 时，为了防止少数 App 走 IPv6 绕过 Clash，我把 Mac Wi-Fi 的 IPv6 设成了「仅本地链接」，换成 sing-box 后忘了改回来。

```bash
networksetup -getinfo Wi-Fi | grep -i ipv6
networksetup -setv6automatic Wi-Fi
```

第一条显示 `IPv6: Link-Local Only` 就是这个问题，第二条把它改回「自动」（也可以在「系统设置 → 网络 → Wi-Fi → 详细信息 → TCP/IP」里把「配置 IPv6」改成「自动」）。改回之后国内网站立刻恢复，配置里那两处全局的 IPv6 限制也就去掉了。sing-box 的虚拟网卡本身会接管 IPv6 流量，不存在 Clash 时期担心的「走 IPv6 绕过分流」。

**去掉 IPv6 限制后，Claude 桌面版和电脑断开了连接。** 全局限制去掉之后，国内网站正常了，在 Claude 网页上聊天也正常，但 Claude 桌面版连接这台电脑的功能（让 Claude 读写电脑上的文件）一直显示断开，重启桌面版也没用。

原因还是 IPv6，只不过这次出在 eSIM 那一侧：限制全部去掉后，Claude 的域名在 DNS 里也会返回 IPv6 地址，而这些连接走 `esim` 出口，eSIM 漫游只有 IPv4，IPv6 连不通。网页聊天遇到 IPv6 连不上会自己退回 IPv4，所以看不出问题；桌面版那条长连接就没那么「聪明」，卡在 IPv6 上一直连不起来。

修法是把 IPv6 限制收窄到真正需要的地方：**只对要走 eSIM 的域名不返回 IPv6 地址**，也就是配置里 DNS 规则的第一条。改完重启 sing-box 和桌面版，连接马上恢复。这其实就是 iPhone 最早那版配置的写法，中间为了解决国内网站的问题把它扩大成了全局限制，再全部去掉时又把这条必要的也一起删了。

总结一下 IPv6 的处理原则：**哪条线路没有 IPv6，就只对走那条线路的域名拦掉 IPv6**。家里 Wi-Fi 有 IPv6，国内网站就放开；eSIM 没有，走 eSIM 的域名就只给 IPv4。


Chrome 的「安全 DNS」也会绕过系统 DNS。它默认是「自动」模式，只有系统 DNS 正好是 Google、Cloudflare 这类知名服务商时才会升级成加密 DNS；系统 DNS 是家里路由器时不会触发。所以只要没手动选过某个服务商，保持默认就行，可以在 Chrome 地址栏输入 `chrome://settings/security` 检查。就算触发了，分流规则里的 `sniff` 也能从握手里读出域名。

**查不出是哪个 App 发的连接。** 日志里还有几个只有 IP、走 Wi-Fi、5 秒超时的连接，想知道是哪个 App 发的。sing-box 有个 `find_process` 选项能记录进程名，但 Mac 上的独立版运行在系统沙盒里，日志只给出 `failed to search process: Couldn’t communicate with a helper application`，查不了。这种情况可以用系统自带的 `lsof` 查，比如：

```bash
sudo lsof -nP -i @173.255.213.90
```

### 偷跑 eSIM 流量的漏洞

**iPhone 上，国内网站可能被 eSIM 抢先连上。** 一开始 iPhone 的 Wi-Fi 出口设的是「Wi-Fi 优先，失败换蜂窝」（`network_strategy: fallback`），想着出门时开着 sing-box 也不会断网。后来回头细看官方文档才发现，这个模式的行为是：Wi-Fi 上的连接只要 **300 毫秒内没建立好**，就会**同时**用蜂窝再发起一个连接，谁先连上用谁。国内稍慢一点的服务器，都可能被 eSIM 抢先连上，完全察觉不到。

改成普通直连、跟随系统默认网络之后就没这个问题了：在家走 Wi-Fi，出门走蜂窝，不会同时发起两个连接。

**Mac 上，热点探测太频繁。** 这是 Clash 时期的问题：「热点优先」组每次探测都要经热点建立一次加密连接，我一度把间隔设成 30 秒，一天两千多次，一个月可能要几百 MB 热点流量。sing-box 方案没有探测，也就没有这个问题。

**规则集天天下载。** 规则列表加起来有几 MB，原来每天更新，一个月也有几十 MB 走 eSIM。这些列表变化很慢，现在都改成每 7 天更新一次。

**iPhone 的「无线局域网助理」和后台任务。** 前者在 Wi-Fi 信号差时会自动改用蜂窝，后者（照片同步、自动更新）在没有 Wi-Fi 时会用蜂窝。前者关掉，后者靠 eSIM 的「低数据模式」压住，见第七节。

### sing-box 的弃用警告

第一次导入时弹出「弃用警告」：远程规则集的 `download_detour` 写法在 1.14 已被弃用，1.16 会移除。这不是报错，配置照常能运行。既然装的已经是 1.14 以上，就改成了新写法：定义一个经 `esim` 出口下载的 HTTP 客户端（`http_clients`），在 `route.default_http_client` 里设为默认。

## 十、省流量：这些服务也会走 eSIM

按规则走 eSIM 的网站里，有几类特别费流量，要心里有数：

| 服务 | 为什么费流量 | 建议 |
| --- | --- | --- |
| YouTube | 在 Google 列表里，视频全走 eSIM | 少看，或调低画质 |
| Homebrew 安装软件 | 很多安装包和源码从 GitHub 下载 | 配国内镜像；Intel + Sonoma 的 Mac 没有编译好的安装包，要从各软件官网下载源码编译，镜像只能加速一部分 |
| Docker 拉镜像 | Docker Hub 在境外网站列表里 | 配置国内镜像源 |
| Hugging Face 下载模型 | 在境外网站列表里 | 模型文件动辄几个 GB，尽量别在 eSIM 上下载 |
| Chrome 自动更新 | 从 Google 服务器下载 | 留意一下就行，一次一两百 MB |

npm 用的是国内镜像（`registry.npmmirror.com`），不受影响。

## 十一、怎么确认分流生效了

**看 sing-box 的「连接」页面。** Mac 和 iPhone 上都有。打开几个网站：

| 网站 | 出口应该显示 |
| --- | --- |
| google.com、github.com、claude.ai、chatgpt.com | `esim` |
| baidu.com、bilibili.com | `default` |
| Steam 下载游戏 | `default` |

**看日志。** Mac 上走 eSIM 的连接会显示 `outbound/direct[esim]: dial en6` 这样的记录，`en6` 是 iPhone 热点网卡，说明 `ethernet` 那一招生效了。

**留意这种连接：** 只显示 IP、走的是 `default`、5 秒左右超时。这基本就是一个本该走 eSIM 却没被规则认出来的连接，可以用第九节的 `lsof` 查是哪个 App。

**看 eSIM 用了多少流量。** 最准的是 iPhone 上的「设置 → 蜂窝网络」：eSIM 线路的总用量里，Mac 用掉的部分单独记在「个人热点」那一项。可以每月初点一次最底下的「重置统计数据」。Mac 上也能看这次插线以来的热点用量：

```bash
netstat -ib -I en6 | awk 'NR==2{printf "下载 %.1f MB，上传 %.1f MB\n", $7/1048576, $10/1048576}'
```

把 `en6` 换成你的热点网卡名。

## 十二、规则从哪来，以后怎么加

### 社区规则的来源

现在的规则全部来自两个开源项目：

- [v2fly/domain-list-community](https://github.com/v2fly/domain-list-community)：**源头**。社区手工维护的「服务 → 域名」清单，`data` 目录里一个文件就是一个列表，纯文本，网页上就能看，比如 `data/anthropic`、`data/openai`、`data/xai`。
- [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat)：每天自动从上面编译成规则集。`sing` 分支给 sing-box（`.srs`），`meta` 分支给 Clash（`.mrs`）；`meta` 分支里还有同名的 `.list` 文本版，想看内容可以直接打开。

列表分两种：`geosite` 按**域名**分组，是主力；`geoip` 按 **IP 段**分组，只用来兜底没有域名的连接。

### 加一个服务

遇到打不开的网站，先在 v2fly 的 `data` 目录里找有没有现成的列表。有的话，在 `route.rule_set` 里加一个规则集，订阅地址把文件名换成列表名：

```text
https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/列表名.srs
```

再把它的 `tag` 加进 DNS 规则和分流规则里那两个 `["anthropic", "openai", ...]` 列表。

几个我看过、但**没有加**的列表：

| 列表 | 为什么没加 |
| --- | --- |
| `category-ai-!cn` | 境外 AI 服务合集，但里面有 Hugging Face、Ollama 这类下载大模型的网站，全走 eSIM 很费流量 |
| `geolocation-!cn` | 「所有境外网站」，大量本来能直连的流量也会走 eSIM |
| `xai`、`telegram`、`twitter` 等 | 主要域名已经在境外网站列表里，加了只是重复 |

如果是社区列表漏了某个域名，可以去 v2fly 提 Issue 或 PR，合并后所有人都能用上。

### 临时加一个域名

社区列表还没收录时，可以在配置里临时加两处：

1. `dns.rules` 里 `"server": "dns-esim"` 那条前面，加一条让它用境外 DNS 解析：

   ```json
   { "domain_suffix": ["example.com"], "action": "route", "server": "dns-esim" },
   ```

2. `route.rules` 里第一条 `"outbound": "esim"` 前面，加一条让它走 eSIM：

   ```json
   { "domain_suffix": ["example.com"], "action": "route", "outbound": "esim" },
   ```

改的是 iCloud 里的那个文件，两台设备都会生效，记得重启 sing-box。

### 不知道该加哪个域名时

打开那个网站或应用，再到 sing-box 的「连接」页面，看它实际访问了哪些域名、走的是哪个出口，把走错的那个加进去即可。

## 十三、这套配置能多久不用动

| 什么情况要改 | 频率 | 怎么处理 |
| --- | --- | --- |
| 规则集更新 | 每周 | 自动，不用管 |
| 遇到列表里没有的网站 | 很少 | 先查社区列表，没有再按第十二节临时加 |
| 换了手机或电脑 | 很少 | 不用改配置，网卡名不写在配置里 |
| 软件大版本升级改了配置格式 | 一年一两次 | 出现弃用警告时再改 |

最后一种最可能让配置失效，sing-box 几乎每个大版本都会淘汰一些旧写法。所以我关掉了 App Store 的自动更新（「设置 → App Store → 自动下载」），Mac 上的 Homebrew 版也不会自动更新，升级时机自己掌握。按现在的写法，至少要到 sing-box 1.16 才会有必须改的地方。

## 十四、新设备快速配置清单

### Mac

1. **装 sing-box**：`brew install --cask sfm`，第一次启动时允许网络扩展和 VPN 配置。
2. **连好网络**：
   - Wi-Fi 连家里路由器，关掉 iPhone 热点的「自动加入」
   - iPhone 数据卡设成 eSIM，用数据线连电脑，打开「个人热点 → 允许其他人加入」，第一次连接时在手机上点「信任」
   - 「系统设置 → 网络 → iPhone USB → 详细信息」，关掉「需要时启用」
   - 「设定服务顺序」里 Wi-Fi 排在 iPhone USB 上面
   - Wi-Fi 的「配置 IPv6」是「自动」，不是「仅本地链接」
3. **导入配置**：把第五节的配置保存为「iCloud 云盘 → sing-box」里的 `esim-split.json`，在 sing-box 里新建 iCloud 配置并启动。
4. **验证**：打开 google.com 和 baidu.com，在「连接」页面看到 `esim` 和 `default`。

### iPhone

1. **装 sing-box**：用外区 Apple ID 安装官方文档链接的 sing-box MT。
2. **导入配置**：新建 iCloud 配置，选同一个 `esim-split.json`，打开开关。
3. **系统设置**：允许 sing-box 使用蜂窝数据；在家时数据卡设成 eSIM，关掉「允许切换蜂窝数据」；关掉「无线局域网助理」；给 eSIM 打开「低数据模式」。
4. **自动化**：按第七节建「连上家里 Wi-Fi 时切到 eSIM 并连接 sing-box」的快捷指令自动化。
5. **验证**：连着家里 Wi-Fi，分别打开 google.com 和 baidu.com，在「连接」页面看到 `esim` 和 `default`。

> 参考：[sing-box 文档](https://sing-box.sagernet.org/)、[sing-box 拨号字段（network_type）](https://sing-box.sagernet.org/configuration/shared/dial/)、[sing-box 苹果客户端](https://sing-box.sagernet.org/zh/clients/apple/)、[Homebrew：sfm](https://formulae.brew.sh/cask/sfm)、[v2fly/domain-list-community](https://github.com/v2fly/domain-list-community)、[MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat)、[mihomo 文档](https://wiki.metacubex.one/)、[苹果：配合 eSIM 使用双卡](https://support.apple.com/109317)。
