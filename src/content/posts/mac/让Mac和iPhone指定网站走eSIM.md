---
title: 让 Mac 和 iPhone 指定网站走 eSIM：Clash 与 sing-box 分流实录
published: 2026-10-27T19:40:00+08:00
description: 家里 Wi-Fi 访问一部分境外网站不稳定，iPhone 上的境外 eSIM 访问正常但流量很少。这篇记录怎么让 Mac（通过手机热点）和 iPhone 自己都只把指定网站分给 eSIM，其他流量照常走 Wi-Fi，以及一路上补过的漏洞和省流量的细节。附完整配置和自动识别热点网卡的脚本，换设备也能很快配好。
tags:
  - macOS
  - iOS
  - 网络
  - Clash
  - sing-box
category: 工具
draft: false
slug: mac-hotspot-split-routing
---

我的 iPhone 是双卡：主号是国内卡，日常用；另外有一张境外 eSIM，访问境外网站很顺畅，但流量很少。家里的 Wi-Fi 访问 Claude、GitHub、Google 这类境外网站不稳定，Steam 商店也时好时坏。

我想要的效果是，不管在 Mac 上还是在 iPhone 上：

- **指定的境外网站**走 eSIM
- **其他所有流量**（国内网站、游戏下载、系统更新）照常走家里 Wi-Fi
- eSIM 流量能省则省，不能有流量在我不知道的时候偷偷走 eSIM

最后 Mac 上用 Clash Verge Rev，iPhone 上用 sing-box 实现了。中间绕了不少弯路，也补了好几轮漏洞，这篇把过程和原理讲清楚。最后附上换设备时的快速操作清单。

## 一、先搞懂几个概念

### 网卡名和 IP 不是一回事

终端里运行 `ifconfig`，会看到 `en0`、`en6` 这样的名字，下面跟着一串 IP 地址。

- **网卡名**是系统给硬件起的编号。`en0` 一般就是这台 Mac 的 Wi-Fi 网卡，不管连哪个网络都叫 `en0`。
- **IP 地址**是当前连着的那个网络临时分给你的。连家里 Wi-Fi 是 `192.168.1.x`，连 iPhone 热点就是 `172.20.10.x`。

可以把网卡名理解成**门牌号**，IP 是**这次住进来的人**：门牌固定，住的人随网络变化。所以配置分流时要认准**网卡名**，不能认 IP。

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

另外，**iPhone 的个人热点只共享蜂窝数据，从不共享它连着的 Wi-Fi**。所以 iPhone 连着家里 Wi-Fi 时，数据线那头的 Mac 拿到的仍然是 eSIM 流量。热点共享出去的流量也不经过 iPhone 上的 sing-box，Mac 的分流由 Mac 自己的 Clash 负责，两边互不干扰。

整体是这样：

| 设备 | 国内网站 | 境外网站 | 谁负责分流 |
| --- | --- | --- | --- |
| iPhone（连着家里 Wi-Fi） | 家里 Wi-Fi | eSIM | sing-box |
| Mac | 家里 Wi-Fi | iPhone 热点 → eSIM | Clash Verge Rev |

前提只有一个：**在家时 iPhone 的数据卡要设成 eSIM**。出门没有 Wi-Fi 时，手动把数据卡切回主号就行，系统自带的切换几秒钟就好。

## 二、Mac 上的第一次尝试：静态路由

最直接的想法是改路由表：告诉系统「去这几个 IP 的流量，交给热点的网关」。

```bash
# 热点网关：iPhone 一般是 172.20.10.1
sudo route add -net 160.79.104.0/23 172.20.10.1
```

我写了个脚本，定时解析域名、给解析出来的 IP 加路由，后来还做成了一个带开关的 SwiftUI 小应用。对 Claude 这种域名少、IP 段固定的服务确实好用，但扩展到更多网站时问题就来了：

1. **只能按 IP 分，不能按域名分。** 路由表只认 IP，每个域名都要先解析成 IP 再加路由，子域名也得一个个写，`*.google.com` 这种通配写法用不了。
2. **DNS 解析结果不一定可用。** 有些境外域名在家里网络上解析，拿到的地址本身就连不上，把这种地址路由到热点也没用。
3. **CDN 的 IP 会共用和变化。** 同一个 CDN 节点可能同时服务很多网站，解析结果还经常变。

几十个网站还能凑合，常用的境外网站有几千个域名，这条路走不通。

## 三、Mac 的最终方案：Clash Verge Rev 的虚拟网卡

Clash Verge Rev 是一个开源的网络规则工具，内核叫 mihomo。很多人用它配合代理服务，但它也可以**完全不用代理**，只做一件事：按规则决定每条连接从哪块网卡出去。

```bash
brew install --cask clash-verge-rev
```

### 数据是怎么走的

打开它的「虚拟网卡模式」（TUN）后，系统里会多出一块虚拟网卡，所有流量都先进这块网卡，再由 mihomo 决定去向：

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

国内网站同理，只是最后匹配到 DIRECT，从 Wi-Fi 发出去。

这个设计解决了静态路由的三个问题：

- **按域名分流**：有了 fake-ip 映射，mihomo 知道每条连接是去哪个域名的，规则可以写 `DOMAIN-SUFFIX,google.com`，子域名自动覆盖。
- **解析结果可靠**：需要走热点的域名，全程不在家里网络上解析，而是经热点用海外 DNS 解析。
- **有现成的规则库**：社区维护了「境外网站列表」「GitHub」「Google」「国内 IP」等规则集，几千个域名开箱即用，自动更新。

还有一个容易想不通的点：mihomo 自己发出去的连接，为什么不会又被吸回虚拟网卡？因为它发起连接时，会把连接直接**绑定在指定的真实网卡上**，绕过了系统默认路由。

### 智能切换

配置里有一个「热点优先」组，定时经热点访问一次 Google 的测试地址：能访问就走热点；拔了线、关了热点，或者热点本身访问不了境外网站，就自动退回 Wi-Fi；恢复后自动切回热点。平时完全不用管，插上线就分流，拔掉就全走 Wi-Fi。

## 四、Mac 完整配置

保存为 `hotspot-split.yaml`。**整份配置只需要改一处：`interface-name` 后面的热点网卡名**，这一步可以交给第五节的脚本自动完成。

```yaml
# ============================================================
#  热点分流 · Clash Verge Rev 配置
#  - 境外网站列表、Claude、GitHub、Google、Steam 商店 → 走热点（iPhone 数据卡为 eSIM）
#  - 国内网站、Steam 下载、其他所有流量 → 走主网络
#  - 热点断开或热点访问不了境外网站时，自动回落到主网络；恢复后自动切回
#
#  使用前只需要改一处：下面 proxies 里的 interface-name（热点网卡名）
# ============================================================

mode: rule
log-level: info
ipv6: false
allow-lan: false
unified-delay: true
tcp-concurrent: true
profile:
  store-selected: true
  store-fake-ip: true

# ---------- 域名嗅探 ----------
# 浏览器自带的加密 DNS、写死 IP 的 App 绕过了下面 DNS 部分的 fake-ip，Clash 只看得到 IP；
# 开启嗅探后从 TLS / HTTP / QUIC 握手里读出域名，照样能按域名分流
sniffer:
  enable: true
  force-dns-mapping: true
  parse-pure-ip: true
  override-destination: false
  sniff:
    HTTP:
      ports: [80, 8080-8880]
    TLS:
      ports: [443, 8443]
    QUIC:
      ports: [443, 8443]

# ---------- 出口 ----------
proxies:
  - name: 热点
    type: direct
    interface-name: en7        # ← 改成你的热点网卡名（ifconfig 里拿到 172.20.10.x 的那个）

proxy-groups:
  # 智能切换：经热点探测境外网站，通就走热点，不通（拔线/关热点）就回落主网络
  # 每次探测都消耗热点流量，所以 5 分钟一次，并且只在有流量走这个组时才探测（lazy）
  - name: 热点优先
    type: fallback
    proxies: [热点, DIRECT]
    url: https://www.gstatic.com/generate_204
    expected-status: 204
    interval: 300
    timeout: 3000
    lazy: true

  # 菜单里可以手动切换：智能 / 强制热点 / 强制主网络
  - name: 热点出口
    type: select
    proxies: [热点优先, 热点, DIRECT]

# ---------- 规则集（自动更新，经热点下载）----------
rule-providers:
  overseas-list:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/gfw.mrs
    path: ./ruleset/overseas-list.mrs
    interval: 604800
    proxy: 热点出口
  github:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/github.mrs
    path: ./ruleset/github.mrs
    interval: 604800
    proxy: 热点出口
  google:
    type: http
    behavior: domain
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geosite/google.mrs
    path: ./ruleset/google.mrs
    interval: 604800
    proxy: 热点出口
  google-ip:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geoip/google.mrs
    path: ./ruleset/google-ip.mrs
    interval: 604800
    proxy: 热点出口
  telegram-ip:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geoip/telegram.mrs
    path: ./ruleset/telegram-ip.mrs
    interval: 604800
    proxy: 热点出口
  twitter-ip:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geoip/twitter.mrs
    path: ./ruleset/twitter-ip.mrs
    interval: 604800
    proxy: 热点出口
  facebook-ip:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geoip/facebook.mrs
    path: ./ruleset/facebook-ip.mrs
    interval: 604800
    proxy: 热点出口
  cn-ip:
    type: http
    behavior: ipcidr
    format: mrs
    url: https://github.com/MetaCubeX/meta-rules-dat/raw/meta/geo/geoip/cn.mrs
    path: ./ruleset/cn-ip.mrs
    interval: 604800
    proxy: 热点出口

# ---------- DNS ----------
# 国内域名用国内 DNS；走热点的境外域名经热点用海外 DNS 解析，保证拿到可用的地址
overseas-dns: &overseas
  - https://1.1.1.1/dns-query#热点出口
  - https://8.8.8.8/dns-query#热点出口

dns:
  enable: true
  ipv6: false
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  fake-ip-filter:
    - "*.lan"
    - "+.local"
    - "+.localhost"
    - "+.msftconnecttest.com"
    - "+.msftncsi.com"
    - "time.*.com"
    - "+.ntp.org"
    - "+.pool.ntp.org"
    - "+.stun.*.*"
    - "+.stun.*.*.*"
    - "localhost.ptlogin2.qq.com"
  default-nameserver:
    - 223.5.5.5
    - 119.29.29.29
  nameserver:
    - https://223.5.5.5/dns-query
    - https://doh.pub/dns-query
  nameserver-policy:
    "rule-set:overseas-list": *overseas
    "rule-set:github": *overseas
    "rule-set:google": *overseas
    "+.anthropic.com": *overseas
    "+.claude.ai": *overseas
    "+.claude.com": *overseas

# ---------- 分流规则（从上往下匹配）----------
rules:
  # 局域网 / 私有地址
  - IP-CIDR,10.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,172.16.0.0/12,DIRECT,no-resolve
  - IP-CIDR,192.168.0.0/16,DIRECT,no-resolve
  - IP-CIDR,127.0.0.0/8,DIRECT,no-resolve
  - IP-CIDR,169.254.0.0/16,DIRECT,no-resolve

  # Steam 下载 / 客户端更新 / 连接服务器 → 主网络（必须放在 Steam 商店规则前面）
  - DOMAIN,client-download.steampowered.com,DIRECT
  - DOMAIN-SUFFIX,steamcontent.com,DIRECT
  - DOMAIN-SUFFIX,steampipe.akamaized.net,DIRECT
  - DOMAIN-SUFFIX,steamserver.net,DIRECT
  - DOMAIN-SUFFIX,eccdnx.com,DIRECT
  - DOMAIN-SUFFIX,clngaa.com,DIRECT
  - DOMAIN-SUFFIX,pphimalayanrt.com,DIRECT
  - DOMAIN-SUFFIX,esportsworldlink.com,DIRECT
  - DOMAIN-SUFFIX,bscstorage.net,DIRECT
  - DOMAIN-SUFFIX,queniujq.cn,DIRECT
  - DOMAIN-SUFFIX,nsclouds.cn,DIRECT
  # 商店预告片视频流量大，默认走主网络；想走热点就删掉这一行
  - DOMAIN-REGEX,^video\..*\.steamstatic\.com$,DIRECT

  # Steam 商店 / 社区 / 登录 → 热点
  - DOMAIN-SUFFIX,steampowered.com,热点出口
  - DOMAIN-SUFFIX,steamcommunity.com,热点出口
  - DOMAIN-SUFFIX,steamstatic.com,热点出口
  - DOMAIN-SUFFIX,steamcdn-a.akamaihd.net,热点出口

  # Claude → 热点
  - DOMAIN-SUFFIX,claude.ai,热点出口
  - DOMAIN-SUFFIX,claude.com,热点出口
  - DOMAIN-SUFFIX,anthropic.com,热点出口
  - IP-CIDR,160.79.104.0/23,热点出口,no-resolve

  # GitHub / Google / 境外网站列表 → 热点
  - RULE-SET,github,热点出口
  - RULE-SET,google,热点出口
  - RULE-SET,overseas-list,热点出口

  # 只有 IP、没有域名的连接：按大型境外服务的 IP 段兜底
  - RULE-SET,google-ip,热点出口,no-resolve
  - RULE-SET,telegram-ip,热点出口,no-resolve
  - RULE-SET,twitter-ip,热点出口,no-resolve
  - RULE-SET,facebook-ip,热点出口,no-resolve

  # 发往境外 IP 的 QUIC（UDP 443）一律拒绝，迫使 App 改用 TCP，这样能识别出域名、按上面的规则分流
  - AND,((NETWORK,UDP),(DST-PORT,443),(NOT,((RULE-SET,cn-ip)))),REJECT

  # 自己想加的放这里，例如：
  # - DOMAIN-SUFFIX,example.com,热点出口

  # 国内 IP 和其余所有流量 → 主网络
  - RULE-SET,cn-ip,DIRECT
  - MATCH,DIRECT
```

### 配置解析

**出口（`proxies` 和 `proxy-groups`）**

- `热点`：类型是 `direct`（直连，不经过任何代理），但用 `interface-name` 绑定到热点网卡。这就是「从热点出去」的意思。
- `DIRECT`：内置出口，从系统默认网络（Wi-Fi）出去。
- `热点优先`：`fallback` 类型，按顺序检查 `热点` 能不能用，不能用就用 `DIRECT`。探测间隔是 5 分钟，并且开了 `lazy`，只在确实有流量走这个组时才探测，原因见第九节。
- `热点出口`：`select` 类型，可以在 Clash 界面里手动切成「强制热点」或「强制主网络」，平时选「热点优先」就行。规则里都指向它。

**域名嗅探（`sniffer`）**

fake-ip 只对经过 Clash 的 DNS 查询有效。浏览器自己用加密 DNS 解析、或者 App 里写死了 IP 时，连接到了 Clash 只剩一个 IP，域名规则全部失效。开启嗅探后，mihomo 会从 TLS、HTTP、QUIC 握手里读出域名，照样能按域名分流。

**规则集（`rule-providers`）**

都来自 [MetaCubeX/meta-rules-dat](https://github.com/MetaCubeX/meta-rules-dat) 项目的 `meta` 分支：

| 配置里的名字 | 上游文件 | 内容 |
| --- | --- | --- |
| `overseas-list` | [geo/geosite/gfw.mrs](https://github.com/MetaCubeX/meta-rules-dat/tree/meta/geo/geosite) | 常用境外网站域名（上游文件名沿用了项目里的原名） |
| `github` | [geo/geosite/github.mrs](https://github.com/MetaCubeX/meta-rules-dat/tree/meta/geo/geosite) | GitHub 全部域名 |
| `google` | [geo/geosite/google.mrs](https://github.com/MetaCubeX/meta-rules-dat/tree/meta/geo/geosite) | Google 全部域名 |
| `google-ip`、`telegram-ip`、`twitter-ip`、`facebook-ip` | [geo/geoip/](https://github.com/MetaCubeX/meta-rules-dat/tree/meta/geo/geoip) 下同名文件 | 这几家服务自己的 IP 段 |
| `cn-ip` | [geo/geoip/cn.mrs](https://github.com/MetaCubeX/meta-rules-dat/tree/meta/geo/geoip) | 国内 IP 段 |

`.mrs` 是 mihomo 专用的压缩二进制格式，加载快、体积小，但不能直接打开看。想查某个域名在不在列表里，可以在 Clash Verge Rev 的「规则」页面搜索，或者在「连接」页面看它命中了哪条规则。

规则集每 7 天更新一次（`interval: 604800`），下载也走「热点出口」，因为规则集托管在 GitHub 上。列表变化很慢，没必要天天下载、浪费热点流量。

**DNS**

- `enhanced-mode: fake-ip`：开启前面讲的假 IP 模式。
- `nameserver`：默认用阿里和腾讯的 DNS，国内网站解析快、结果准。
- `nameserver-policy`：需要走热点的域名，改用 Cloudflare 和 Google 的 DNS，地址后面的 `#热点出口` 表示 DNS 查询本身也从热点发出，这样拿到的是境外网络视角下的真实地址。
- `fake-ip-filter`：这些域名不用假 IP，比如局域网设备、时间同步、部分游戏联机用的 STUN 服务，它们直接拿真实 IP 才能正常工作。

**分流规则（`rules`）**

规则**从上往下匹配，命中第一条就停**，所以顺序很重要：

1. 局域网地址直连，不然路由器后台、打印机都访问不了。
2. **Steam 下载相关的域名放在 Steam 商店前面。** 商店和下载都有 `steampowered.com`、`steamstatic.com` 下的域名，先把下载、客户端更新、国内下载节点挑出来走 Wi-Fi，剩下的商店页面才走热点。
3. Claude、GitHub、Google 和境外网站列表走热点。
4. **只有 IP 的连接按 IP 段兜底。** Google、Telegram、Twitter（X）、Facebook 这几家有时会绕过域名、直接用 IP 连接，按它们自己的网段走热点。
5. **发往境外 IP 的 QUIC 一律拒绝。** 原因见第九节。
6. 国内 IP 和其他所有流量走 Wi-Fi。最后的 `MATCH` 是兜底规则，前面都没命中的就走这里。

## 五、自动识别热点网卡的脚本

热点网卡叫什么名字，每台电脑、每部手机可能都不一样。我写了个脚本自动找出来，并写进配置文件，保存为 `set-hotspot.sh`：

```bash
#!/bin/bash
# 自动识别热点网卡，并写入热点分流配置（hotspot-split.yaml 以及已导入 Clash Verge Rev 的副本）
# 用法：bash set-hotspot.sh [配置文件路径]
#       不带参数时，自动处理 ~/Downloads/hotspot-split.yaml 和 Clash Verge Rev 里已导入的配置

set -u
MARK="热点分流 · Clash Verge Rev"

# ---------- 1. 找主网络网卡 ----------
# 按「系统设置 → 网络 → 设定服务顺序」的顺序，取第一个已拿到 IP 的网卡
MAIN_IF=""
while IFS= read -r dev; do
  if [ -n "$(ipconfig getifaddr "$dev" 2>/dev/null)" ]; then
    MAIN_IF=$dev; break
  fi
done < <(networksetup -listnetworkserviceorder 2>/dev/null | sed -nE 's/.*Device: ([a-z]+[0-9]+)\).*/\1/p')

# ---------- 2. 收集候选网卡 ----------
PORTS=$(networksetup -listallhardwareports 2>/dev/null)
port_of() {
  echo "$PORTS" | awk -v d="$1" '/^Hardware Port:/{p=substr($0,16)} /^Device:/{if($2==d){print p; exit}}'
}

CANDS=()
for IFC in $(ifconfig -l); do
  case "$IFC" in lo*|utun*|bridge*|awdl*|llw*|anpi*|gif*|stf*|ap[0-9]*) continue ;; esac
  IP=$(ipconfig getifaddr "$IFC" 2>/dev/null) || continue
  [ -z "$IP" ] && continue
  case "$IP" in 169.254.*) continue ;; esac   # 自分配地址，没连上任何网络（如 Touch Bar 内部网卡）
  GW=$(ipconfig getoption "$IFC" router 2>/dev/null)
  [ -z "$GW" ] && continue                     # 没有网关的网卡不能当出口
  PORT=$(port_of "$IFC")
  SCORE=0; WHY=""
  case "$IP" in
    172.20.10.*)  SCORE=$((SCORE + 10)); WHY="iPhone 热点网段" ;;
    192.168.43.*) SCORE=$((SCORE + 8));  WHY="安卓热点网段" ;;
  esac
  case "$PORT" in
    *iPhone*|*iPad*) SCORE=$((SCORE + 10)); WHY="${WHY:+${WHY}，}iPhone USB 共享" ;;
  esac
  if [ "$IFC" != "$MAIN_IF" ] && [ -n "$GW" ]; then
    SCORE=$((SCORE + 2)); WHY="${WHY:+${WHY}，}不是主网络"
  fi
  CANDS+=("$SCORE|$IFC|$IP|${GW:-无网关}|${PORT:-未知端口}|$WHY")
done

if [ ${#CANDS[@]} -eq 0 ]; then
  echo "❌ 没有找到任何已联网的网卡。"
  exit 1
fi

HAS_OTHER=0
for c in "${CANDS[@]}"; do
  n=$(echo "$c" | cut -d'|' -f2)
  [ "$n" != "$MAIN_IF" ] && HAS_OTHER=1
done
if [ "$HAS_OTHER" = 0 ]; then
  echo "❌ 现在只有主网络 ${MAIN_IF:-} 在线，没找到热点网卡。"
  echo "   请先用数据线连上 iPhone，在「设置 → 个人热点」里打开「允许其他人加入」，"
  echo "   等几秒钟再重新运行本脚本。"
  exit 1
fi

echo "检测到的网卡（主网络：${MAIN_IF:-未知}）："
i=1
for c in "${CANDS[@]}"; do
  IFS='|' read -r s n ip gw p w <<< "$c"
  printf "  %d) %-6s %-16s 网关 %-15s %s\n" "$i" "$n" "$ip" "$gw" "$p"
  i=$((i + 1))
done
echo

# ---------- 3. 自动判断 ----------
SORTED=$(printf '%s\n' "${CANDS[@]}" | sort -t'|' -k1,1nr)
TOP=$(echo "$SORTED" | head -1)
SECOND=$(echo "$SORTED" | sed -n 2p)
TOP_SCORE=${TOP%%|*}
SECOND_SCORE=${SECOND%%|*}; SECOND_SCORE=${SECOND_SCORE:-0}

PICK=""
if [ "$TOP_SCORE" -ge 2 ] && [ "$TOP_SCORE" -gt "$SECOND_SCORE" ]; then
  PICK=$(echo "$TOP" | cut -d'|' -f2)
  WHY=$(echo "$TOP" | cut -d'|' -f6)
  if [ "$PICK" = "$MAIN_IF" ]; then
    if [ ${#CANDS[@]} -gt 1 ]; then
      echo "⚠️  热点网卡 $PICK 现在是系统默认网络，所有流量都在走热点。"
      echo "   打开「系统设置 → 网络」，点列表下方「⋯」→「设定服务顺序」，"
      echo "   把 Wi-Fi 拖到 iPhone USB 上面，点「好」，然后重新运行本脚本。"
    else
      echo "⚠️  看起来 Mac 只连着热点（$PICK 就是唯一的网络）。"
      echo "   分流需要热点和另一个网络同时连着，比如 iPhone 用数据线、Wi-Fi 连家里路由器。"
    fi
    exit 1
  fi
  echo "✅ 判断热点网卡是：${PICK}（依据：${WHY}）"
else
  echo "无法自动判断，请输入序号选择热点网卡："
  read -r -p "> " N
  if ! [[ "$N" =~ ^[0-9]+$ ]] || [ "$N" -lt 1 ] || [ "$N" -gt ${#CANDS[@]} ]; then
    echo "❌ 序号无效"; exit 1
  fi
  PICK=$(echo "${CANDS[$((N - 1))]}" | cut -d'|' -f2)
  echo "✅ 已选择：$PICK"
fi

# ---------- 4. 写入配置 ----------
FILES=()
if [ $# -ge 1 ]; then
  FILES+=("$1")
else
  [ -f "$HOME/Downloads/hotspot-split.yaml" ] && FILES+=("$HOME/Downloads/hotspot-split.yaml")
  while IFS= read -r f; do
    [ -n "$f" ] && FILES+=("$f")
  done < <(find "$HOME/Library/Application Support" -maxdepth 3 -path '*clash-verge*/profiles/*.yaml' -print 2>/dev/null \
           | while IFS= read -r p; do grep -l "$MARK" "$p" 2>/dev/null; done)
fi

if [ ${#FILES[@]} -eq 0 ]; then
  echo "⚠️  没找到 hotspot-split.yaml。把它放到「下载」文件夹，或运行：bash set-hotspot.sh /路径/hotspot-split.yaml"
  exit 1
fi

echo
for f in "${FILES[@]}"; do
  if ! grep -q 'interface-name:' "$f"; then
    echo "  跳过（没有 interface-name 字段）：$f"; continue
  fi
  cp "$f" "$f.bak"
  sed -i '' -E "s/(interface-name:[[:space:]]*)[A-Za-z0-9]+/\1$PICK/" "$f"
  echo "  已更新：$f"
done

# ---------- 5. 顺便测一下热点能不能访问境外网站（仅参考）----------
DEF_IF=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')
echo
if [[ "$DEF_IF" == utun* ]]; then
  echo "ℹ️  TUN 正在运行，跳过热点访问测试。"
else
  CODE=$(curl --interface "$PICK" -s -o /dev/null -m 6 -w '%{http_code}' https://www.gstatic.com/generate_204 2>/dev/null)
  if [ "$CODE" = "204" ]; then
    echo "🌏 热点可以访问 Google，境外网站走热点没问题。"
  else
    echo "⚠️  热点访问 Google 失败。检查热点是否正常；分流时这类网站会自动回落到主网络。"
  fi
fi

echo
echo "完成。到 Clash Verge Rev 的「订阅」里重新点选一次这个配置（或右键刷新），让新网卡名生效。"
```

运行：

```bash
bash ~/Downloads/set-hotspot.sh
```

### 脚本解析

脚本分五步：

1. **找主网络。** 读取「设定服务顺序」里的顺序（`networksetup -listnetworkserviceorder`），排在最前面、并且已经拿到 IP 的网卡就是主网络。
2. **收集候选网卡，并给每块打分。** 先排除虚拟网卡（`utun`、`bridge` 等）、没拿到 IP 的、`169.254` 开头的、没有网关的网卡，剩下的按特征打分：
   - IP 是 `172.20.10.x`（iPhone 热点网段）：+10 分
   - IP 是 `192.168.43.x`（常见的安卓热点网段）：+8 分
   - 硬件端口名带 iPhone：+10 分
   - 不是主网络、而且有网关：+2 分
3. **选分最高的那个。** 如果最高分和第二名分不出高下，就列出来让你手动选序号。如果选中的正好是主网络，说明服务顺序反了，或者 Wi-Fi 连的就是热点，脚本会提示怎么改。
4. **写进配置。** 找到「下载」文件夹里的 `hotspot-split.yaml`，以及 Clash Verge Rev 已经导入的那份配置（靠文件开头的「热点分流 · Clash Verge Rev」标记识别），把 `interface-name` 改成识别出的网卡名，改之前各自备份为 `.bak`。
5. **测一下热点能不能访问境外网站。** 用 `curl --interface` 强制从热点网卡访问 Google 的测试地址，结果只作参考。

几个写法上的细节：

- **为什么要跳过 `169.254` 开头的地址？** 网卡没从任何网络拿到地址时，系统会给它自己分配一个 `169.254.x.x`，这种网卡没法上网。我这台带 Touch Bar 的 MacBook Pro 内部有一块连接 Touch Bar 的网卡就是这种地址，第一版脚本就被它骗了。
- **为什么变量写成 `${WHY}`，而不是 `$WHY`？** macOS 自带的 bash 是 2007 年的 3.2 版，变量后面紧跟中文时，它会把中文字节也当成变量名的一部分，报 `unbound variable`。加上花括号就没这个问题。
- **为什么用 `sed -i ''`？** macOS 的 sed 是 BSD 版本，原地修改文件时 `-i` 后面必须跟一个备份后缀，传空字符串表示不备份，这和 Linux 上的写法不一样。

## 六、Clash Verge Rev 设置

1. **导入配置**：左侧「订阅」→ 右上角「新建」→ 类型选「Local」→ 选择 `hotspot-split.yaml` → 保存。然后**单击这张卡片**，变成高亮才表示正在使用。
2. **打开虚拟网卡模式**：「设置」里「虚拟网卡模式」右边如果有黄色警告图标，说明后台服务还没装。点一下警告图标，按提示输入开机密码安装服务，再打开开关。新版把「服务模式」合并进了这里，设置里找不到单独的「服务模式」很正常。
3. **关掉「系统代理」**：虚拟网卡已经接管了全部流量，不需要它。
4. **关掉「IPv6」**：这个开关会覆盖配置文件里的设置，开着的话部分网站可能走 IPv6 绕过分流。
5. **确认「DNS 覆写」是关闭的**：开着会盖掉配置里的 DNS 设置，Google 这类网站又会解析到连不上的地址。
6. **打开「开机自启」**。

## 七、iPhone：sing-box

### 思路

前面说过，iPhone 做不到按网站换卡，但在家时它同时有家里 Wi-Fi 和蜂窝数据两个出口。[sing-box](https://sing-box.sagernet.org/) 从 1.11 版开始，可以给直连出口[指定网络类型](https://sing-box.sagernet.org/configuration/shared/dial/)（`network_type` 可选 `wifi` 或 `cellular`），官方说明这项功能支持苹果平台的图形客户端。于是配置两个出口：

| 出口 | 走哪里 | 用于 |
| --- | --- | --- |
| `default` | 系统默认网络：在家是 Wi-Fi，出门是蜂窝 | 国内网站、其他所有流量 |
| `esim` | 蜂窝数据，也就是当前的数据卡 | 我的列表、境外网站列表、GitHub、Google |

在家时数据卡是 eSIM，`esim` 出口就是 eSIM 流量。出门后我把数据卡切回主号，这时两个出口都只剩蜂窝，sing-box 开着关着效果一样，不用特意去关。

分流规则和 Mac 上那套是同一个思路，用的也是同一个项目的规则集，只是换成了 sing-box 用的 `.srs` 格式。

### 装哪个 App

sing-box 的 iOS 客户端在国区 App Store 搜不到，需要外区 Apple ID，App 本身免费。要装的是[官方文档里链接的那个](https://sing-box.sagernet.org/clients/apple/)（App Store 上叫 sing-box MT）。

在 App Store 搜「sing-box」时排在前面的「sing-box VT」**不是官方的**：开发商是另一家公司，页面上自称「又一个发行版」，内核还停在 1.11。下面的配置用的是 1.12 以后的 DNS 写法，在它上面会直接报错。

### 设置步骤

1. **传配置文件**：在 Mac 上把配置文件用 AirDrop 发到 iPhone，选「存储到文件」。
2. **导入**：打开 sing-box →「配置」→ 新建 → 类型选「本地」→ 导入刚才的文件。回到「仪表」页面选中这个配置，打开开关。第一次会请求添加 VPN 配置，点允许。
3. **允许 sing-box 使用蜂窝数据**：「设置 → 蜂窝网络」，往下翻到 sing-box，打开开关。不打开的话，`esim` 出口走不了蜂窝。
4. **在家时数据卡设成 eSIM**：「设置 → 蜂窝网络 → 蜂窝数据」选 eSIM，并关掉同一页底部的「允许切换蜂窝数据」。
5. **关掉「无线局域网助理」**：「设置 → 蜂窝网络」拉到最底部。它会在 Wi-Fi 信号差时自动改用蜂窝，在家时蜂窝就是 eSIM。
6. **给 eSIM 打开「低数据模式」**：「设置 → 蜂窝网络 →」点 eSIM 线路。系统会暂停照片同步、自动更新这类后台任务，只影响蜂窝，连着 Wi-Fi 时照常进行。

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

## 八、iPhone 完整配置

保存为 `sing-box-esim.json`：

```json
{
  "log": {
    "level": "warn"
  },
  "dns": {
    "servers": [
      {
        "type": "https",
        "tag": "dns-esim",
        "server": "1.1.1.1",
        "detour": "esim"
      },
      {
        "type": "https",
        "tag": "dns-cn",
        "server": "223.5.5.5"
      }
    ],
    "rules": [
      {
        "query_type": [
          "AAAA"
        ],
        "rule_set": [
          "my-esim",
          "overseas-list",
          "github",
          "google"
        ],
        "action": "predefined"
      },
      {
        "rule_set": [
          "my-esim",
          "overseas-list",
          "github",
          "google"
        ],
        "action": "route",
        "server": "dns-esim"
      }
    ],
    "final": "dns-cn"
  },
  "http_clients": [
    {
      "tag": "esim-http",
      "detour": "esim"
    }
  ],
  "inbounds": [
    {
      "type": "tun",
      "tag": "tun-in",
      "address": [
        "172.19.0.1/30",
        "fdfe:dcba:9876::1/126"
      ],
      "auto_route": true,
      "strict_route": true
    }
  ],
  "outbounds": [
    {
      "type": "direct",
      "tag": "default"
    },
    {
      "type": "direct",
      "tag": "esim",
      "network_strategy": "default",
      "network_type": [
        "cellular"
      ]
    }
  ],
  "route": {
    "auto_detect_interface": true,
    "default_domain_resolver": "dns-cn",
    "default_http_client": "esim-http",
    "rule_set": [
      {
        "type": "inline",
        "tag": "my-esim",
        "rules": [
          {
            "domain_suffix": [
              "claude.ai",
              "claude.com",
              "anthropic.com"
            ]
          }
        ]
      },
      {
        "type": "inline",
        "tag": "my-esim-ip",
        "rules": [
          {
            "ip_cidr": [
              "160.79.104.0/23"
            ]
          }
        ]
      },
      {
        "type": "remote",
        "tag": "overseas-list",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/gfw.srs",
        "update_interval": "7d"
      },
      {
        "type": "remote",
        "tag": "github",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/github.srs",
        "update_interval": "7d"
      },
      {
        "type": "remote",
        "tag": "google",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google.srs",
        "update_interval": "7d"
      },
      {
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
        "type": "remote",
        "tag": "cn-ip",
        "format": "binary",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/cn.srs",
        "update_interval": "7d"
      }
    ],
    "rules": [
      {
        "action": "sniff"
      },
      {
        "protocol": "dns",
        "action": "hijack-dns"
      },
      {
        "ip_is_private": true,
        "action": "route",
        "outbound": "default"
      },
      {
        "rule_set": [
          "my-esim",
          "overseas-list",
          "github",
          "google"
        ],
        "action": "route",
        "outbound": "esim"
      },
      {
        "rule_set": [
          "my-esim-ip",
          "google-ip",
          "telegram-ip",
          "twitter-ip",
          "facebook-ip"
        ],
        "action": "route",
        "outbound": "esim"
      },
      {
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
    "final": "default"
  },
  "experimental": {
    "cache_file": {
      "enabled": true
    }
  }
}
```

### 配置解析

**自己的列表：`my-esim` 和 `my-esim-ip`**

`route.rule_set` 里排在最前面的两个，是直接写在配置里的规则集（`inline`）：

- `my-esim`：自己想走 eSIM 的域名，写在 `domain_suffix` 里，一个域名会同时匹配它的所有子域名
- `my-esim-ip`：自己想走 eSIM 的 IP 段，写在 `ip_cidr` 里

DNS 规则和分流规则都引用这两个名字，所以**以后加网站只改这里一处**，具体见第十二节。

**出口（`outbounds`）**

- `default`：普通直连，跟随系统默认网络。
- `esim`：直连，但用 `network_type: cellular` 限定只走蜂窝。

**DNS（`dns`）**

- `dns-cn`：阿里的加密 DNS，走默认网络，解析国内网站。
- `dns-esim`：Cloudflare 的加密 DNS，经 `esim` 出口发出，解析要走 eSIM 的域名。
- 第一条规则让要走 eSIM 的域名**只返回 IPv4 地址**（拦掉 `AAAA` 查询）。原因见第九节。

**规则集和下载**

规则集和 Mac 上用的是同一个项目，地址在 `sing` 分支下。`http_clients` 定义了一个经 `esim` 出口下载的客户端，`route.default_http_client` 让所有规则集都用它下载，每 7 天更新一次（`update_interval: 7d`）。

**分流规则（`route.rules`）**

1. `sniff`：从握手里读出域名。iPhone 上没有用 fake-ip，域名全靠嗅探和 DNS 劫持得到。
2. `hijack-dns`：接管所有 DNS 查询，交给上面的 DNS 规则处理。
3. 局域网地址走默认网络。
4. 我的列表、境外网站列表、GitHub、Google 走 `esim`。
5. 我的 IP 段和那四家服务的 IP 段走 `esim`。
6. 发往境外 IP 的 QUIC 一律拒绝。
7. 其他所有流量走 `default`（`final`）。

## 九、一路补过的漏洞

这套配置不是一次写成的。下面这些坑，有的是实际用的时候在「连接」页面里发现的，有的是专门回头检查「会不会悄悄打不开」和「会不会悄悄用掉 eSIM 流量」时找到的。

### Mac 连接上的坑

**Wi-Fi 连的就是热点。** 一开始 Mac 的 Wi-Fi 也连着 iPhone 热点，所有流量都在走热点，脚本也一直报错。记得在「系统设置 → Wi-Fi」里把 iPhone 热点的「自动加入」关掉，不然 Mac 会自己连回去。

**iPhone USB 显示「已连接」，却拿不到 IP。** 用 `ifconfig en6` 一看，状态是 `inactive`。原因是「系统设置 → 网络 → iPhone USB → 详细信息」里的**「需要时启用」**开着（英文版叫 Disable unless needed）：只要还有 Wi-Fi 可用，系统就把 iPhone USB 停掉，左边的状态点是黄色的。关掉之后状态点变绿，马上拿到了 `172.20.10.x`。这是整个过程里最隐蔽的一个坑。

### 规则上的漏洞

**Steam 的静态资源走了热点。** 在「连接」页面看到 `shared.fastly.steamstatic.com` 走热点，用了十几 MB。这是 Steam 商店和客户端游戏库封面图的 CDN，按规则就该走热点。想省流量的话，可以把 `steamstatic.com` 那条改成 `DIRECT`，代价是商店图片可能加载慢一些。

**新的国内下载节点。** Steam 下载游戏时，「连接」页面里出现了 `files.steam.nsclouds.cn:80`，这是 Steam 在国内的一个下载节点，我最初整理的下载域名列表里没有它。它当时走的是 DIRECT，没有出问题，因为后面还有「国内 IP 走主网络」和最后的 `MATCH,DIRECT` 两道兜底。后来还是把 `nsclouds.cn` 显式加进了 Steam 下载那组规则：一是**意图写清楚**，以后看配置一眼就知道它是下载节点；二是**少一次解析**，域名规则在匹配时就能命中，不用先解析成 IP 再比对；三是**防止以后改坏**，如果哪天把兜底的 `MATCH` 改成走热点，下载流量也不会被误带过去。

**QUIC 连接识别不出域名。** iPhone 的连接页面里有一条 `UDP 64.233.170.101:443` 走了 Wi-Fi，下载量为 0，30 秒后超时。这是 Google 的 IP，用的是 QUIC（HTTP/3）。这种新协议的域名有时读不出来，连接只剩一个 IP，所有域名规则都失效，落到了默认出口。App 发现 QUIC 连不上，一般会退回普通的 TCP，所以最终能用，只是会慢几秒。

与其追着整理 IP 段，不如**从根上把这类连接变成能识别域名的连接**：发往境外 IP 的 QUIC 一律拒绝。App 会立刻改用 TCP，这是所有浏览器和主流 App 都有的标准行为，几乎没有延迟；TCP 连接能读出域名，自然就按列表分流了。国内 IP 的 QUIC 不受影响。另外再按 Google、Telegram、Twitter、Facebook 这几家自己的 IP 段兜底，覆盖那些直接用 IP 连接的情况。

**Mac 上没开域名嗅探。** Mac 靠 fake-ip 拿域名，但浏览器开了「安全 DNS」（自己用加密 DNS 解析）或者 App 写死 IP 时，连接绕过了 fake-ip，到了 Clash 只剩 IP。iPhone 上的 sing-box 一开始就开了嗅探，Mac 上漏了，后来补上了 `sniffer`。

Chrome 的「安全 DNS」默认是「自动」模式，只有系统 DNS 正好是 Google、Cloudflare 这类知名服务商时才会升级成加密 DNS；系统 DNS 是家里路由器时不会触发。所以只要没手动选过某个服务商，保持默认就行。可以在 Chrome 地址栏输入 `chrome://settings/security` 检查。据我了解这个设置不会随账号同步，每台电脑要单独看。

**eSIM 可能不支持 IPv6。** 境外 eSIM 漫游时很多只给 IPv4。如果某个境外网站解析出 IPv6 地址、App 又优先用 IPv6，走 eSIM 就会连不上。所以 iPhone 配置里让走 eSIM 的域名只返回 IPv4 地址。Mac 这边配置里直接关了 IPv6，如果家里 Wi-Fi 有 IPv6，还可以把 Mac Wi-Fi 的 IPv6 设成「仅本地链接」（「系统设置 → 网络 → Wi-Fi → 详细信息 → TCP/IP」），防止少数 App 走 IPv6 绕过 Clash。

### 偷跑 eSIM 流量的漏洞

**iPhone 上，国内网站可能被 eSIM 抢先连上。** 一开始 iPhone 的 Wi-Fi 出口设的是「Wi-Fi 优先，失败换蜂窝」（`network_strategy: fallback`），想着出门时开着 sing-box 也不会断网。后来回头细看官方文档才发现，这个模式的行为是：Wi-Fi 上的连接只要 **300 毫秒内没建立好**，就会**同时**用蜂窝再发起一个连接，谁先连上用谁。国内稍慢一点的服务器，都可能被 eSIM 抢先连上，完全察觉不到。

改成普通直连、跟随系统默认网络之后就没这个问题了：在家走 Wi-Fi，出门走蜂窝，不会同时发起两个连接。

**Mac 上，热点探测太频繁。** 「热点优先」组每次探测都要经热点建立一次加密连接。我一度把间隔设成 30 秒，一天两千多次，一个月可能要几百 MB 热点流量。现在是 5 分钟一次，并且只在有流量走热点时才探测。

**规则集天天下载。** 两边的规则列表加起来有几 MB，原来每天更新，一个月也有几十 MB 走 eSIM。这些列表变化很慢，现在都改成每 7 天更新一次。

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
| Chrome 自动更新 | 从 Google 服务器下载 | 留意一下就行，一次一两百 MB |

npm 用的是国内镜像（`registry.npmmirror.com`），不受影响。

## 十一、怎么确认分流生效了

**Mac：对比开关前后。** 关掉虚拟网卡模式时，google.com 访问不了或很慢（走 Wi-Fi）；打开后访问正常（走热点）。如果关掉时 Google 也访问正常，说明系统默认就在走热点，回去检查服务顺序。

**Mac：看「连接」页面。** 打开几个网站，看「链路」一列：

| 网站 | 链路应该显示 |
| --- | --- |
| google.com、github.com、claude.ai | 热点出口 / 热点优先 / 热点 |
| baidu.com、bilibili.com | DIRECT |
| Steam 下载游戏 | DIRECT |

**iPhone：看 sing-box 的「连接」页面。** 在家连着 Wi-Fi 时，境外网站的连接右下角显示 `esim`，国内网站显示 `default`。

**留意这种连接：** 只显示 IP、走的是 Wi-Fi（Mac 上是 DIRECT，iPhone 上是 `default`）、下载量是 0、很快就关闭了。这基本就是一个本该走 eSIM 却没被规则认出来的连接。

**看 eSIM 用了多少流量。** 最准的是 iPhone 上的「设置 → 蜂窝网络」：eSIM 线路的总用量里，Mac 用掉的部分单独记在「个人热点」那一项。可以每月初点一次最底下的「重置统计数据」。Mac 上也能看这次插线以来的热点用量：

```bash
netstat -ib -I en6 | awk 'NR==2{printf "下载 %.1f MB，上传 %.1f MB\n", $7/1048576, $10/1048576}'
```

把 `en6` 换成你的热点网卡名。

## 十二、以后追加规则

### Mac：用「编辑规则」，不改配置文件

在 Clash Verge Rev 的「订阅」页面右键配置卡片，选「编辑规则」：规则类型选 `DOMAIN-SUFFIX`，内容填域名，策略选「热点出口」（想强制走 Wi-Fi 就选 `DIRECT`），点「添加前置规则」后保存。

这样加的规则单独保存，不会改动 `hotspot-split.yaml` 本身，以后重新导入配置、或重新跑脚本改网卡名，加的规则都不会丢。要注意前置规则排在最前面、最先匹配，别把 Steam 下载用的域名加成走热点，否则会盖过「下载走 Wi-Fi」的规则。

常用写法：

| 写法 | 含义 |
| --- | --- |
| `DOMAIN-SUFFIX,example.com,热点出口` | example.com 及所有子域名，最常用 |
| `DOMAIN,api.example.com,热点出口` | 只匹配这一个域名 |
| `DOMAIN-KEYWORD,example,热点出口` | 域名里含有这个词就匹配 |
| `PROCESS-NAME,Telegram,热点出口` | 按应用分流，这个程序的所有流量都走热点 |
| `IP-CIDR,1.2.3.0/24,热点出口,no-resolve` | 按 IP 段匹配 |

更多规则类型见 [mihomo 文档：路由规则](https://wiki.metacubex.one/config/rules/)。

### iPhone：在 sing-box 里直接改 `my-esim`

1. 打开 sing-box →「仪表」页面，在配置那一栏点**铅笔图标**，进入编辑。
2. 找到 `"tag": "my-esim"`，在它下面的 `domain_suffix` 列表里加域名。比如加 `example.com`：

   ```json
   "domain_suffix": [
     "claude.ai",
     "claude.com",
     "anthropic.com",
     "example.com"
   ]
   ```

   注意每个域名都要加英文双引号，域名之间用英文逗号隔开，**最后一个后面不能有逗号**。
3. 如果要加的是 IP 段，就改下面 `"tag": "my-esim-ip"` 里的 `ip_cidr`，写法一样，比如 `"1.2.3.0/24"`。
4. 保存后，在「仪表」页面把开关关掉再打开，让配置生效。

改错了 sing-box 会在启动时报错，不会悄悄失效。这时对照上面检查一下引号和逗号。

### 不知道该加哪个域名时

打开那个网站或应用，再到 Clash Verge Rev 或 sing-box 的「连接」页面，看它实际访问了哪些域名、走的是哪条链路，把走错的那个加进去即可。

## 十三、这套配置能多久不用动

| 什么情况要改 | 频率 | 怎么处理 |
| --- | --- | --- |
| 境外网站列表更新 | 每周 | 自动，不用管 |
| 遇到列表里没有的网站 | 一两个月一次 | 按第十二节加，不用动配置主体 |
| 换了手机，Mac 上的热点网卡名变了 | 很少 | 重跑一次 `set-hotspot.sh` |
| 软件大版本升级改了配置格式 | 一年一两次 | 出现弃用警告时再改 |

最后一种最可能让配置失效，尤其是 sing-box，它几乎每个大版本都会淘汰一些旧写法。所以我关掉了 App Store 的自动更新（「设置 → App Store → 自动下载」），升级时机自己掌握。按现在的写法，至少要到 sing-box 1.16 才会有必须改的地方。

## 十四、新设备快速配置清单

### Mac

1. **装 Clash Verge Rev**：`brew install --cask clash-verge-rev`
2. **准备两个文件**：把第四节的配置保存为 `~/Downloads/hotspot-split.yaml`，第五节的脚本保存为 `~/Downloads/set-hotspot.sh`。
3. **连好网络**：
   - Wi-Fi 连家里路由器
   - iPhone 数据卡设成 eSIM，用数据线连电脑，打开「个人热点 → 允许其他人加入」，第一次连接时在手机上点「信任」
   - 「系统设置 → 网络 → iPhone USB → 详细信息」，关掉「需要时启用」
   - 「设定服务顺序」里 Wi-Fi 排在 iPhone USB 上面
   - 「系统设置 → Wi-Fi」里，关掉 iPhone 热点的「自动加入」
4. **识别网卡**：`bash ~/Downloads/set-hotspot.sh`，看到「✅ 判断热点网卡是：enX」即可。
5. **导入并启用**：按第六节导入配置，装服务，打开虚拟网卡模式，关掉系统代理、IPv6 和 DNS 覆写，打开开机自启。
6. **验证**：按第十一节对比开关前后。

以后换了手机，或者发现「热点优先」一直显示 DIRECT，就重新跑一次第 4 步，再到「订阅」里重新点一下配置卡片。

### iPhone

1. **装 sing-box**：用外区 Apple ID 安装官方文档链接的 sing-box MT。
2. **导入配置**：把第八节的配置保存为 `sing-box-esim.json`，AirDrop 到手机，在 sing-box 里新建本地配置并导入，打开开关。
3. **系统设置**：允许 sing-box 使用蜂窝数据；在家时数据卡设成 eSIM，关掉「允许切换蜂窝数据」；关掉「无线局域网助理」；给 eSIM 打开「低数据模式」。
4. **自动化**：按第七节建「连上家里 Wi-Fi 时切到 eSIM 并连接 sing-box」的快捷指令自动化。
5. **验证**：连着家里 Wi-Fi，分别打开 google.com 和 baidu.com，在 sing-box 的「连接」页面看到 `esim` 和 `default`。

> 参考：[Clash Verge Rev（Homebrew）](https://formulae.brew.sh/cask/clash-verge-rev)、[mihomo 文档](https://wiki.metacubex.one/)、[sing-box 文档](https://sing-box.sagernet.org/)、[sing-box 苹果客户端](https://sing-box.sagernet.org/clients/apple/)、[meta-rules-dat 规则集](https://github.com/MetaCubeX/meta-rules-dat)、[苹果：配合 eSIM 使用双卡](https://support.apple.com/109317)。
