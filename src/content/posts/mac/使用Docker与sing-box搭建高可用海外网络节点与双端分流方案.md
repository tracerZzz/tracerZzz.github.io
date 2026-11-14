---
title: 使用 Docker 与 sing-box 搭建高可用海外网络节点与双端分流方案
published: 2026-11-15T02:45:00+08:00
description: 承接上一篇 Mac 与 iPhone 共用 sing-box 走境外 eSIM 的分流方案，记录从选购日本东京 VPS、Debian 12 安全加固、用 Docker 部署 sing-box v1.14.4（VLESS + XTLS-Reality），到在双端配置中引入 selector 策略组实现自建节点与备用 eSIM 一键切换的完整过程与排坑复盘。
tags:
  - sing-box
  - Docker
  - 网络
  - macOS
  - iOS
category: 工具
draft: false
slug: self-hosted-sing-box-vless-reality-docker-guide
---

在上一篇[《让 Mac 和 iPhone 指定网站走 eSIM：sing-box 分流实录》](/posts/mac-hotspot-split-routing/)里，我用一张按量计费的境外 eSIM 配合 `sing-box`，实现了 Mac（通过 iPhone 有线热点）和 iPhone 共用一份 iCloud 配置、只把指定境外网站分流给 eSIM。

这套方案跑通之后，IP 纯净度确实很高，但日常开发重度依赖 Claude、ChatGPT、Gemini 和 GitHub，电脑端长期高频使用时暴露出两个不便：一是按量计费的漫游流量成本偏高，二是 Mac 上网必须一直插着手机开热点。

因此这次的目标是在保留原有架构优点的基础上，把出口升级为「自建主力 + eSIM 备用」的双出口方案：

1. **自建主力节点**：选购一台线路稳定、原生 IP 干净的日本东京 VPS，用 Docker 容器化部署 `sing-box v1.14.4`，与宿主机环境隔离，换机器时整目录拷走就能恢复。
2. **双出口一键切换**：保留原有的境外 eSIM 作为热备出口，在 Mac 和 iPhone 共用的 `esim-split.json` 中引入 `selector`（策略组），默认走自建 VPS，遇到线路波动时可在客户端界面一键切回 eSIM，国内网站和其他流量照常直连走家里 Wi-Fi。
3. **规则自动跟随更新**：继续使用社区维护的 `.srs` 二进制规则集，每 7 天经当前选中的境外出口自动更新，部署完成后长期不用手动维护。

## 一、核心概念简析

动手配置之前，先理清这次升级新增的几个关键机制：

- **VLESS + XTLS-Reality**：目前主流的轻量级传输协议组合。Reality 的核心优势在于**不需要自己购买域名和申请 TLS 证书**，它会在 TLS 握手阶段直接复用真实大型网站（如 `www.apple.com`）的证书特征，未通过身份校验的连接会被无缝转发给目标网站；同时配合 `xtls-rprx-vision` 流控处理内层 TLS 握手包特征，省去了域名续费与证书维护的麻烦，兼顾连接稳定性与高吞吐性能。
- **JSONC 与二进制规则集（`rule_set`）**：`sing-box 1.14+` 原生支持在 JSON 配置文件中直接写 `//` 单行注释，配置说明可以直接留在文件里；配合预编译的 `.srs` 二进制规则集，内存占用极低，在 1GB 内存的入门级 VPS 和手机端上都游刃有余。
- **`selector` 策略组与长连接打断**：在客户端配置中加入 `selector` 类型的出口后，图形界面会自动生成节点切换面板。开启 `interrupt_exist_connections: true` 后，切换出口时会立即断开旧出口上残留的长连接，新请求立刻走新出口，不会因为复用旧连接而卡住。

## 二、VPS 选购与基础安全加固

这次选用的实例是日本东京 IIJ 线路（1 Core / 1024 MB 内存 / 15GB SSD / Debian 12 系统）。在部署容器前，先做一轮基础的系统安全加固与网络调优。

### 1. 配置 SSH 密钥登录并修改默认端口

公网上的默认 `22` 端口每分钟都会收到大量自动化扫描和口令爆破。先在本地 Mac 生成 `ed25519` 密钥对（如果 `~/.ssh/id_ed25519.pub` 已经存在，直接跳过第一行），趁 `22` 端口还没改，先把公钥传到 VPS 上：

```bash
ssh-keygen -t ed25519 -C "mac-vps"
ssh-copy-id root@<你的VPS_IP>
```

登录 VPS 后，编辑 `/etc/ssh/sshd_config`，把端口改成自定义高位端口（如 `52222`），并禁用密码登录：

```text
Port 52222
PermitRootLogin prohibit-password
PasswordAuthentication no
PubkeyAuthentication yes
```

先校验配置语法，无误后再重启 SSH 服务：

```bash
sshd -t && systemctl restart ssh
```

接着在本地 Mac 的 `~/.ssh/config` 中加上机器别名，以后只需输入 `ssh jp-vps` 就能直接免密登录：

```text
Host jp-vps
    HostName <你的VPS_IP>
    Port 52222
    User root
    IdentityFile ~/.ssh/id_ed25519
```

> **注意**：重启 SSH 后**先不要关掉当前的终端窗口**。新开一个终端窗口测试 `ssh jp-vps` 能正常连上，再进行下一步，防止配置写错把自己锁在门外。另外，改完端口后部分服务商后台网页（如 VMISS 面板）上的 `Port: 22` 卡片仍会显示初始静态信息，属于正常现象，在 VPS 终端运行 `ss -tlpn | grep sshd` 看到监听在 `52222` 即可。

### 2. 配置 UFW 防火墙与开启 BBR 拥塞控制

防火墙只放行刚才改好的 SSH 端口（`52222`）与 `sing-box` 服务端口（`443`），拒绝其余所有入站连接；同时开启 Linux 内核自带的 BBR 拥塞控制算法，改善跨境长延时链路的吞吐表现：

```bash
apt update && apt install -y ufw curl

ufw default deny incoming
ufw default allow outgoing
ufw allow 52222/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

cat << 'EOF' >> /etc/sysctl.conf
net.core.default_qdisc=fq
net.ipv4.tcp_congestion_control=bbr
EOF
sysctl -p
```

执行完可以用 `ufw status` 和 `sysctl net.ipv4.tcp_congestion_control` 确认防火墙规则与 BBR 都已生效。

### 3. 确认 NTP 时钟同步、统一时区与安装 Docker

TLS 与 Reality 握手会校验 **UTC 时间戳**，如果服务器系统时钟偏差过大，握手会直接失败；而修改系统时区则是为了让系统日志和容器日志显示北京时间（`Asia/Shanghai`），方便日后对照排查。这里把 NTP 自动同步和东八区时区一起设好，然后安装官方 Docker 环境：

```bash
timedatectl set-ntp true
timedatectl set-timezone Asia/Shanghai
timedatectl status
curl -fsSL https://get.docker.com | sh
```

确认 `timedatectl status` 输出中 `System clock synchronized: yes` 且时区为 `Asia/Shanghai` 即可。

## 三、服务端 Docker 部署（sing-box v1.14.4）

### 1. 生成 UUID 与 Reality 密钥对

直接用官方镜像启动一次性容器来生成 `UUID` 和 Reality 公私钥对，不需要在宿主机上单独安装 `sing-box` 二进制文件：

```bash
mkdir -p /root/sing-box && cd /root/sing-box

# 生成客户端身份 UUID
docker run --rm ghcr.io/sagernet/sing-box:v1.14.4 generate uuid

# 生成 Reality 密钥对（PrivateKey 填服务端，PublicKey 填客户端）
docker run --rm ghcr.io/sagernet/sing-box:v1.14.4 generate reality-keypair
```

### 2. 编写 `docker-compose.yml`

为了防止容器长年运行后日志把 15GB 硬盘塞满，在 `logging` 里加上日志轮转限制（单文件上限 20MB，最多保留 3 份，总占用不超过 60MB），同时传入 `TZ` 环境变量并挂载 `/etc/localtime`，让容器内的日志时间与宿主机保持一致：

```yaml
services:
  sing-box:
    image: ghcr.io/sagernet/sing-box:v1.14.4
    container_name: sing-box
    restart: unless-stopped
    network_mode: host
    environment:
      - TZ=Asia/Shanghai
    volumes:
      - ./config.json:/etc/sing-box/config.json:ro
      - /etc/localtime:/etc/localtime:ro
    command: -D /var/lib/sing-box -C /etc/sing-box/ run
    logging:
      driver: "json-file"
      options:
        max-size: "20m"
        max-file: "3"
```

### 3. 服务端完整配置（`/root/sing-box/config.json`）

实测这台东京 IIJ 的原生 IP 可以直接顺畅访问 Claude、ChatGPT、Gemini 和 GitHub，不需要在服务端再套一层中转隧道，直接原生出口直出，延迟最低、链路也最简单：

```jsonc
{
  // 日志配置：稳定运行后设为 warn，仅记录警告和错误，减少磁盘写入
  "log": {
    "level": "warn",
    "timestamp": true
  },

  // DNS 配置：调用 VPS 机房自带的本地 DNS（零外部依赖），优先解析 IPv4 避免部分站点 IPv6 绕路
  "dns": {
    "servers": [
      {
        "type": "local",
        "tag": "local-dns"
      }
    ],
    "strategy": "prefer_ipv4"
  },

  // 入站：接收来自客户端的加密连接
  "inbounds": [
    {
      "type": "vless",
      "tag": "vless-in",
      "listen": "::",             // 同时监听 IPv4 和 IPv6
      "listen_port": 443,         // 复用标准 HTTPS 端口，避免非标端口被运营商限速或拦截
      "users": [
        {
          "uuid": "填入生成的UUID",
          "flow": "xtls-rprx-vision" // 开启 Vision 流控，处理内层 TLS 握手特征并提升吞吐
        }
      ],
      "tls": {
        "enabled": true,
        "server_name": "www.apple.com", // TLS 握手所使用的目标域名（SNI）
        "reality": {
          "enabled": true,
          "handshake": {
            // 复用真实大型网站的 TLS 握手特征，无需自行买域名和申请证书
            "server": "www.apple.com",
            "server_port": 443
          },
          "private_key": "填入生成的Reality_PrivateKey",
          "short_id": [
            "0123456789abcdef"    // 握手校验短 ID（0~16 位十六进制），需与客户端保持一致
          ]
        }
      }
    }
  ],

  // 出站：定义流量离开 VPS 后的去向
  "outbounds": [
    {
      "type": "direct",
      "tag": "direct-out"         // 东京 IIJ 原生直连出口
    },
    {
      "type": "block",
      "tag": "block-out"          // 黑洞拦截出口（丢弃违规或探测流量）
    }
  ],

  // 路由规则：从上往下依次匹配，命中第一条即生效
  "route": {
    "rules": [
      {
        "action": "sniff"         // 协议嗅探：从流量中识别真实域名与协议类型
      },
      {
        "protocol": "bittorrent",
        "outbound": "block-out"   // 拦截 BT/PT 流量，防止因版权投诉触发机房风控
      },
      {
        "ip_is_private": true,
        "outbound": "block-out"   // 拦截私有网段请求，防止误扫机房内网
      }
    ],
    "default_domain_resolver": "local-dns", // v1.14+ 规范必填：指定默认域名解析器
    "final": "direct-out"         // 兜底规则：其余正常请求直接从东京原生 IP 发出
  }
}
```

### 4. 静态语法校验与启动

启动容器前，先用内置的 `check` 子命令做一次静态语法校验，确认没有报错（退出码为 `0`）后再后台拉起服务。以后如果改了 `docker-compose.yml` 或配置，直接运行 `docker compose up -d` 或 `docker compose restart` 即可：

```bash
docker run --rm -v /root/sing-box/config.json:/etc/sing-box/config.json:ro ghcr.io/sagernet/sing-box:v1.14.4 check -c /etc/sing-box/config.json
docker compose up -d
```

## 四、Mac 与 iPhone 共用的客户端配置

客户端的设置方式和[上一篇](/posts/mac-hotspot-split-routing/)完全一样：把配置文件保存在「iCloud 云盘 → sing-box」目录下，Mac（SFM 客户端）和 iPhone（sing-box MT 客户端）都选 `iCloud` 类型读取同一个 `esim-split.json`。

### 相比上一版改了什么

1. **新增 `jp-vps` 出口与 `proxy-select` 策略组**：把原来的单一 `esim` 出口升级为 `proxy-select` 选择器，包含 `jp-vps`（默认主力）和 `esim`（备用，iPhone 上走蜂窝数据卡、Mac 上走 iPhone USB 有线热点）两个出口，在客户端界面可以一键切换。
2. **DNS 与规则集下载全链路跟随策略组**：境外加密 DNS（`dns-proxy`）和规则集下载客户端（`proxy-http`）的 `detour` 都指向 `proxy-select`。这样不管当前选的是自建 VPS 还是 eSIM，DNS 解析和每周一次的规则集自动更新都会自动跟着当前出口走，平时在 Mac 上不插手机开热点也能独立工作。
3. **DNS 统一拦截 `AAAA` 与 `HTTPS` 查询**：境外 eSIM 漫游只有 IPv4，而现代浏览器除了查 `AAAA` 记录，还会查 `HTTPS`（Type 65）记录从中读取 `ipv6hint` 或 HTTP/3 参数。第一条 DNS 规则把这两种查询统一用 `predefined` 返回空结果，强制所有连接走稳定的 IPv4。
4. **冷启动规则集域名兜底**：在分流规则里，`github.com` 和 `githubusercontent.com` 写在远程规则集前面直接走 `proxy-select`。这样新设备第一次启动、本地还没有任何 `.srs` 规则集缓存时，去 GitHub 下载规则集的请求本身也能顺利走境外出口，不会陷入「下载规则集需要先加载规则集」的死锁。

### 完整客户端配置（`esim-split.json`）

```jsonc
// ============================================================
//  esim-split.json：Mac 和 iPhone 共用的 sing-box 分流配置
//  放在「iCloud 云盘 → sing-box」里，两台设备都选 iCloud 类型的配置读取它
//
//  效果：
//    Claude、ChatGPT、GitHub、Google、常用境外网站 → 走 proxy-select（默认自建日本 VPS，可界面一键切 eSIM）
//    国内网站和其他所有流量 → 走默认网络（家里 Wi-Fi / 本地蜂窝）
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
        // 境外 DNS（Cloudflare 的加密 DNS），经当前选中的境外出口（jp-vps 或 esim）发出
        // 这样拿到的是境外网络视角下真实可用的地址，且切节点时自动跟随
        "type": "https",
        "tag": "dns-proxy",
        "detour": "proxy-select",
        "server": "1.1.1.1"
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
        // 所有域名都只用 IPv4（拦截 AAAA 和可能带 ipv6hint 的 HTTPS 记录）：
        //   境外 eSIM 漫游只有 IPv4，拿到 IPv6 地址会连不上
        //   统一用 IPv4 可以保证所有流量稳定经过分流规则
        "query_type": [
          "AAAA",
          "HTTPS"
        ],
        "action": "predefined"
      },
      {
        // 指定境外网站用境外 DNS 解析，拿到境外网络视角下可用的地址
        "rule_set": [
          "anthropic",
          "openai",
          "overseas-list",
          "github",
          "google"
        ],
        "server": "dns-proxy"
      }
    ],
    // 其他所有域名都用国内 DNS
    "final": "dns-cn"
  },

  // ---------- 下载规则集用的 HTTP 客户端 ----------
  // 规则集托管在 GitHub 上，经当前选中的境外出口（jp-vps 或 esim）下载，保证 7 天自动更新不失败
  "http_clients": [
    {
      "tag": "proxy-http",
      "version": 2,
      "detour": "proxy-select"
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
      // 1. 普通直连，跟随系统默认网络（在家就是 Wi-Fi）
      "type": "direct",
      "tag": "default"
    },
    {
      // 2. 策略组选择器：在客户端界面可一键切换 jp-vps 或 esim
      "type": "selector",
      "tag": "proxy-select",
      "outbounds": [
        "jp-vps",
        "esim"
      ],
      "default": "jp-vps",
      // 切换出口时立即断开旧出口的残留长连接，实现无感秒切
      "interrupt_exist_connections": true
    },
    {
      // 3. 主力出口：自建日本东京 IIJ VPS（VLESS + XTLS-Reality）
      // 注意：已启用 Vision 流控，切勿再添加 multiplex 字段，否则会触发空闲 EOF 断流
      "type": "vless",
      "tag": "jp-vps",
      "server": "<你的VPS_IP>",
      "server_port": 443,
      "uuid": "填入生成的UUID",
      "flow": "xtls-rprx-vision",
      "tls": {
        "enabled": true,
        "server_name": "www.apple.com",
        "utls": {
          "enabled": true,
          "fingerprint": "chrome"
        },
        "reality": {
          "enabled": true,
          "public_key": "填入生成的Reality_PublicKey",
          "short_id": "0123456789abcdef"
        }
      }
    },
    {
      // 4. 备用出口：直连，但只走「蜂窝」或「有线」网络（eSIM 漫游流量）
      //   iPhone：走蜂窝数据（数据卡设为 eSIM）
      //   Mac：走有线网卡（iPhone 用数据线开的热点在 Mac 上识别为有线网卡）
      //   default 策略：只用这两类网络，它们不可用时不会偷偷改走 Wi-Fi
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
        // 3. 局域网地址走默认网络（Wi-Fi），不然路由器后台、打印机都访问不了
        "ip_is_private": true,
        "outbound": "default"
      },
      {
        // 4. 冷启动兜底：首次启动本地还没有规则集缓存时，让 GitHub 域名直接走境外出口完成规则集下载
        "domain_suffix": [
          "githubusercontent.com",
          "github.com"
        ],
        "outbound": "proxy-select"
      },
      {
        // 5. Claude、ChatGPT、境外网站、GitHub、Google 走策略组（默认 jp-vps）
        //    Steam 不用单独写：商店和社区在境外网站列表里，下载域名不在列表里，会自动走 Wi-Fi
        "rule_set": [
          "anthropic",
          "openai",
          "overseas-list",
          "github",
          "google"
        ],
        "outbound": "proxy-select"
      },
      {
        // 6. 只有 IP 的连接：按这几家服务的 IP 段兜底，也走策略组
        "rule_set": [
          "google-ip",
          "telegram-ip",
          "twitter-ip",
          "facebook-ip"
        ],
        "outbound": "proxy-select"
      },
      {
        // 7. 发往境外 IP 的 QUIC（HTTP/3，UDP 443）一律拒绝
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

    // ---------- 规则集：全部来自社区，每 7 天自动更新 ----------
    // 来源：https://github.com/MetaCubeX/meta-rules-dat 的 sing 分支
    // 源头列表：https://github.com/v2fly/domain-list-community 的 data 目录
    // geosite = 按域名分组，geoip = 按 IP 段分组
    "rule_set": [
      {
        // Claude / Anthropic 的全部域名，包括 Artifact 用的 claudeusercontent.com
        "type": "remote",
        "tag": "anthropic",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/anthropic.srs",
        "update_interval": "168h0m0s"
      },
      {
        // ChatGPT / OpenAI 的全部域名，包括静态资源域名
        "type": "remote",
        "tag": "openai",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/openai.srs",
        "update_interval": "168h0m0s"
      },
      {
        // 常用境外网站列表（上游文件名沿用项目原名）
        // Steam 商店和社区、Telegram、X、YouTube、Grok 等都在里面
        "type": "remote",
        "tag": "overseas-list",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/gfw.srs",
        "update_interval": "168h0m0s"
      },
      {
        // GitHub 全部域名
        "type": "remote",
        "tag": "github",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/github.srs",
        "update_interval": "168h0m0s"
      },
      {
        // Google 全部域名，包括 Gemini
        "type": "remote",
        "tag": "google",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/google.srs",
        "update_interval": "168h0m0s"
      },
      {
        // 下面四个是这几家服务自己的 IP 段，用来兜底「只有 IP、没有域名」的连接
        "type": "remote",
        "tag": "google-ip",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/google.srs",
        "update_interval": "168h0m0s"
      },
      {
        "type": "remote",
        "tag": "telegram-ip",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/telegram.srs",
        "update_interval": "168h0m0s"
      },
      {
        "type": "remote",
        "tag": "twitter-ip",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/twitter.srs",
        "update_interval": "168h0m0s"
      },
      {
        "type": "remote",
        "tag": "facebook-ip",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/facebook.srs",
        "update_interval": "168h0m0s"
      },
      {
        // 国内 IP 段，用在最后一条 QUIC 规则里
        "type": "remote",
        "tag": "cn-ip",
        "url": "https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geoip/cn.srs",
        "update_interval": "168h0m0s"
      }
    ],

    // 8. 其他所有流量走默认网络（Wi-Fi / 本地蜂窝）
    "final": "default",
    // 自动找到真实网卡，sing-box 自己发出的连接直接绑定到真实网卡，不会又绕回虚拟网卡
    "auto_detect_interface": true,
    // sing-box 自己需要解析域名时（比如以后把 jp-vps 地址换成域名），默认用国内 DNS
    "default_domain_resolver": "dns-cn",
    // 下载规则集时跟随当前选中的境外出口（jp-vps 或 esim）
    "default_http_client": "proxy-http"
  },

  // ---------- 其他 ----------
  "experimental": {
    // 把规则集和策略组选择状态缓存到本地，重启后不用重新下载
    "cache_file": {
      "enabled": true
    }
  }
}
```

## 五、踩坑复盘与经验总结

搭建和联调过程中遇到了几个很有代表性的问题，记录下来供日后排查参考：

1. **`sing-box v1.14` 废弃字段报错（`legacy domain strategy options is deprecated`）**
   - **原因**：从 `v1.12` 到 `v1.14`，旧版写在 `outbounds` 里的 `domain_strategy` 已被彻底移除，强行使用会导致进程启动即 `FATAL` 退出。
   - **解决**：将解析策略统一放到顶层 `dns` 模块的 `"strategy": "prefer_ipv4"`，并在 `route` 中显式声明 `"default_domain_resolver": "local-dns"`。
2. **Vision 流控与 Mux 多路复用的冲突（`mux connection closed: read frame header: EOF`）**
   - **原因**：`xtls-rprx-vision` 本身已经针对高并发流控做了处理，如果在客户端 `vless` 出站里额外开启 `multiplex`（多路复用），不仅不会提升性能，反而会在连接空闲约 30 秒后触发底层连接重置，并在日志里持续刷出 `EOF` 报错。
   - **解决**：客户端 `vless` 出站中保持默认关闭 `multiplex`，只保留 `"flow": "xtls-rprx-vision"`。
3. **多余的外部隧道反而拖累原生 IP**
   - **原因**：起初担心机房 IP 通不过部分 AI 服务的地区检测，在服务端额外挂了一层外部隧道，结果因为握手延迟叠加和出口波动，频繁触发 30 秒请求超时，而且部分直出流量与隧道出口混用反而导致地区判定不一致。实测发现这台东京 IIJ 原生 IP 本身就能直接顺畅访问 Gemini、Claude 等全部服务，去掉中间层并清理浏览器对应站点的 Cookie 缓存后，延迟大幅下降，超时断流也彻底消失。
4. **客户端 `detour` 解耦与标签名闭环检查**
   - **原因**：最初改客户端配置时，`dns-proxy` 和 `http_clients` 的 `detour` 还硬编码指在 `esim` 上，结果 Mac 没插手机开热点时境外域名完全无法解析；另外修改 DNS 服务器标签名时，如果 `dns.servers[].tag` 与 `dns.rules[].server` 名字不一致也会报错。
   - **解决**：把两处 `detour` 统一改指向 `proxy-select` 策略组，让 DNS 查询和规则集下载完全跟随当前选中的出口，并逐一核对了所有 `tag` 的引用闭环。

## 六、换机与迁移快速操作清单

常规 VPS 套餐不支持跨机房直接克隆系统镜像，不过得益于 Docker 部署，服务端所有状态都收敛在 `/root/sing-box` 目录下。日后换新 VPS 或换新电脑，按下面的步骤几分钟就能恢复：

### 1. 更换 VPS

1. **在本地 Mac 备份旧 VPS 配置**：
   ```bash
   scp -r jp-vps:/root/sing-box ~/Desktop/sing-box-backup
   ```
2. **初始化新 VPS 环境**（先用 root 登录新机器，开启 NTP 与东八区时区、安装 Docker、开启 BBR 并配置防火墙）：
   ```bash
   timedatectl set-ntp true && timedatectl set-timezone Asia/Shanghai
   apt update && apt install -y curl ufw
   curl -fsSL https://get.docker.com | sh
   cat << 'EOF' >> /etc/sysctl.conf
   net.core.default_qdisc=fq
   net.ipv4.tcp_congestion_control=bbr
   EOF
   sysctl -p
   ufw default deny incoming && ufw default allow outgoing
   ufw allow 443/tcp && ufw allow 443/udp
   ```
   接着按第二节配置 SSH 公钥、把端口改为 `52222` 并放行 `ufw allow 52222/tcp && ufw --force enable`。
3. **推送备份配置并拉起容器**：
   ```bash
   scp -P 52222 -r ~/Desktop/sing-box-backup root@<新VPS_IP>:/root/sing-box
   ssh -p 52222 root@<新VPS_IP> "cd /root/sing-box && docker compose up -d"
   ```
4. **更新客户端地址**：把 iCloud 里 `esim-split.json` 中 `jp-vps` 的 `"server"` 改成新 VPS 的 IP（原有的 `uuid` 和 `public_key` 都直接沿用，无需重新生成）。如果给 VPS 绑了自己的域名并托管在 Cloudflare，只需在 Cloudflare 里把 A 记录指向新 IP 即可免改客户端配置——**注意 Cloudflare 的 A 记录必须设为「仅 DNS（灰色云朵）」，不能开启橙色云朵 CDN 代理**，否则无法转发 Reality 握手流量。

### 2. 更换新 Mac（恢复 SSH 免密登录）

- **推荐做法（一机一钥）**：在新 Mac 上运行 `ssh-keygen -t ed25519` 生成新密钥对，用旧 Mac 登录 VPS 后执行 `echo "<新公钥内容>" >> ~/.ssh/authorized_keys` 追加授权，再把 `~/.ssh/config` 里的 `jp-vps` 别名拷到新 Mac 即可。
- **应急兜底**：如果旧电脑不在身边、也没备份过私钥，可以登录 VPS 服务商后台打开网页版 `Console`（VNC 控制台）。因为 `/etc/ssh/sshd_config` 里的 `PasswordAuthentication no` 只限制通过网络发起的 SSH 会话，不影响机房 VNC 本地终端（`tty1`）登录，在 VNC 里用 root 密码登录后把新公钥写进 `~/.ssh/authorized_keys` 即可恢复。

> 参考：[sing-box 官方文档：Migration Guide (v1.11–v1.14)](https://sing-box.sagernet.org/migration/)、[sing-box TLS / Reality 配置文档](https://sing-box.sagernet.org/configuration/shared/tls/#reality)、[MetaCubeX/meta-rules-dat 预编译规则集仓库](https://github.com/MetaCubeX/meta-rules-dat)、[《让 Mac 和 iPhone 指定网站走 eSIM：sing-box 分流实录》](/posts/mac-hotspot-split-routing/)。
