---
title: Nginx 与 OpenResty：从编译调优到 CDN 边缘的 Lua 定制
published: 2018-01-15T16:37:11+08:00
updated: 2026-10-25T15:00:00+08:00
description: 我在电信、百度做 CDN 时和 Nginx 打交道最多。这篇从编译、常用命令、性能调优讲起，重点讲 OpenResty 的请求处理阶段，以及在 CDN 边缘用 Lua 实现防盗链、URI 改写和回源 AWS S3 V4 签名鉴权的思路。
tags:
  - nginx
  - openresty
  - lua
  - CDN
draft: false
category: Nginx
slug: nginx-usage
---

这篇原本是 2018 年的一份 Nginx 使用记录，只有编译步骤和几条命令。这次把后来在中国电信、百度做 CDN 时用 Nginx + Lua 的经验补了进来，重新整理成一篇。前两节是基础，后面三节是重点。

## 一、编译安装

需要第三方模块（比如 `nginx-rtmp-module`）时，只能从源码编译。以 CentOS 7 为例：

```bash
# 依赖：正则（rewrite、location 正则匹配）、zlib（gzip）、openssl（https）
yum install -y gcc pcre-devel zlib-devel openssl-devel

wget http://nginx.org/download/nginx-1.12.2.tar.gz
tar zxvf nginx-1.12.2.tar.gz && cd nginx-1.12.2

./configure --prefix=/usr/local/nginx \
  --with-http_ssl_module \
  --with-debug \
  --add-module=../nginx-rtmp-module   # 按需添加第三方模块

make && make install
```

现在更推荐直接用 [OpenResty](https://openresty.org/)：它是 Nginx 加上 LuaJIT 和一组常用 Lua 库的发行版，后面的 Lua 定制都基于它。Lua 第三方库可以用 OpenResty 自带的 `opm` 安装，或者用 LuaRocks 指定 OpenResty 的 LuaJIT 编译安装：

```bash
./configure --with-lua=/usr/local/openresty/luajit \
  --with-lua-include=/usr/local/openresty/luajit/include/luajit-2.1/
make && make install
```

## 二、常用命令与 gzip

```bash
nginx -t          # 检查配置语法，改完配置先跑这个
nginx -s reload   # 平滑重载：新 worker 接新请求，老 worker 处理完再退出
nginx -s quit     # 优雅退出
nginx -V          # 查看编译参数和已编译的模块
```

gzip 配置。当年的版本把 jpeg、png 也加进了 `gzip_types`，这是个常见错误：图片本身已经压缩过，再 gzip 只会白白消耗 CPU。

```nginx
gzip on;
gzip_min_length 1k;          # 太小的响应压缩不划算
gzip_comp_level 4;           # 1-9，超过 5 收益很小、CPU 开销明显
gzip_types text/plain text/css application/javascript application/json application/xml;
gzip_vary on;                # 加 Vary: Accept-Encoding，避免缓存把压缩版给不支持的客户端
```

## 三、性能调优：一次简单的压测

2018 年在一台 4 核 2G 的虚拟机上，用 webbench 对一个静态文件做过压测。Nginx 关键配置：

```nginx
worker_processes  auto;      # 等于 CPU 核数，当时手写的是 4

events {
    worker_connections  1024;  # 单个 worker 的最大连接数
}
```

| 并发客户端 | 持续时间 | 成功请求数 | 每秒请求数 |
| --- | --- | --- | --- |
| 500 | 10 s | 164,548 | 16,454 |
| 1,000 | 10 s | 198,593 | 19,859 |
| 2,000 | 10 s | 190,463 | 19,046 |
| 5,000 | 10 s | 182,662 | 18,266 |
| 10,000 | 10 s | 161,927 | 16,192 |

几个结论：

- 吞吐在 1000 并发左右到顶，约 2 万 QPS，再加并发反而下降。说明这台机器已经到了处理上限，继续加并发只会增加连接管理和调度的开销。
- `worker_processes × worker_connections` 是理论最大连接数，并发超过它会直接报错；同时要调高系统的文件句柄限制（`ulimit -n` 和 `worker_rlimit_nofile`）。
- 这只是静态小文件的结果。真实 CDN 节点上，磁盘 IO、TLS 握手、回源才是大头，不能用这个数字去估容量。

webbench 现在已经很少用了，同类压测更推荐 [wrk](https://github.com/wg/wrk)，它支持 Lua 脚本构造请求。

## 四、OpenResty 的请求处理阶段

Nginx 把一个请求的处理分成多个阶段，OpenResty 允许在每个阶段挂 Lua 代码。写定制逻辑之前，先想清楚它该放在哪个阶段：

| 阶段 | 指令 | 典型用途 |
| --- | --- | --- |
| rewrite | `rewrite_by_lua_block` | 改写 URI、参数 |
| access | `access_by_lua_block` | 鉴权、防盗链、限流，不通过就 `ngx.exit(403)` |
| content | `content_by_lua_block` | 直接生成响应（不走 proxy_pass 时） |
| header_filter | `header_filter_by_lua_block` | 改响应头，比如加 CORS、改缓存头 |
| body_filter | `body_filter_by_lua_block` | 改响应体，流式处理 |
| log | `log_by_lua_block` | 统计、打点，不影响响应时间 |

在 CDN 节点上，客户定制几乎都落在 rewrite 和 access 两个阶段：请求进来，先改写、再鉴权，通过之后才查缓存或者回源。

## 五、CDN 边缘的 Lua 定制实践

在百度云 CDN 时，我参与过 Nginx 层的客户定制开发。下面挑三类典型需求，用简化版代码说明原理（生产代码还要处理配置下发、异常和监控，这里省略）。

### 1. 防盗链：Referer 校验 + 带时效的签名 URL

最简单的防盗链是 Nginx 自带的 Referer 白名单，但 Referer 可以伪造。更可靠的是**签名 URL**：客户的业务服务器用密钥给 URL 签名并带上过期时间，CDN 节点用同一个密钥校验。

```nginx
location /video/ {
    access_by_lua_block {
        local args = ngx.req.get_uri_args()
        local t, sign = tonumber(args.t), args.sign
        if not t or not sign then
            return ngx.exit(ngx.HTTP_FORBIDDEN)
        end
        -- 过期检查
        if t < ngx.time() then
            return ngx.exit(ngx.HTTP_FORBIDDEN)
        end
        -- 签名 = md5(密钥 + 路径 + 过期时间)，密钥按域名配置下发
        local secret = ngx.var.auth_secret
        if ngx.md5(secret .. ngx.var.uri .. t) ~= sign then
            return ngx.exit(ngx.HTTP_FORBIDDEN)
        end
    }
    proxy_pass http://origin;
}
```

注意：签名参数要从缓存 key 里去掉，否则同一个文件每个签名都是一份缓存，命中率会很难看。

### 2. URI 改写

比如客户把旧路径迁移到新路径，或者要把带版本号的 URL 归一成同一份缓存：

```nginx
rewrite_by_lua_block {
    -- /static/v123/app.js -> /static/app.js
    local uri, n = ngx.re.sub(ngx.var.uri, [[^/static/v\d+/]], "/static/", "jo")
    if n > 0 then
        ngx.req.set_uri(uri)
    end
}
```

`ngx.re` 的 `"jo"` 参数表示开启 PCRE JIT 并缓存编译后的正则，热点路径上性能差别很明显。

### 3. 回源 AWS S3 的 V4 签名鉴权

当时有客户的源站是私有的 AWS S3 桶，CDN 回源时必须按 AWS Signature Version 4 签名，否则 S3 返回 403。这个功能做成了一个 Lua 插件，region、AccessKey、SecretKey、回源域名都按域名动态配置。

V4 签名的计算分四步：

1. **规范请求（Canonical Request）**：把方法、URI、查询参数、参与签名的请求头按固定格式拼起来；
2. **待签字符串（String to Sign）**：算法名 + 时间 + 凭证范围（日期/region/s3/aws4_request）+ 规范请求的 SHA256；
3. **派生签名密钥**：用 `"AWS4" + SecretKey` 对日期、region、服务名、`aws4_request` 逐层做 HMAC-SHA256；
4. **签名**：用派生密钥对待签字符串做 HMAC-SHA256，结果写进 `Authorization` 头。

简化后的 Lua 实现（HMAC 用的是 `lua-resty-hmac` 库，回源只用 GET，所以 payload 用 `UNSIGNED-PAYLOAD`）：

```lua
local resty_sha256 = require "resty.sha256"
local str  = require "resty.string"
local hmac = require "resty.hmac"

local function sha256_hex(s)
    local h = resty_sha256:new()
    h:update(s)
    return str.to_hex(h:final())
end

local function hmac_sha256(key, msg)
    return hmac:new(key, hmac.ALGOS.SHA256):final(msg)  -- 返回二进制
end

local ak, sk   = ngx.var.s3_ak, ngx.var.s3_sk
local region   = ngx.var.s3_region
local host     = ngx.var.s3_host       -- bucket.s3.<region>.amazonaws.com
local amz_date = os.date("!%Y%m%dT%H%M%SZ", ngx.time())
local date     = amz_date:sub(1, 8)
local payload  = "UNSIGNED-PAYLOAD"

-- 1. 规范请求（URI 需按 AWS 规则逐段编码，查询参数需排序，这里省略）
local signed_headers = "host;x-amz-content-sha256;x-amz-date"
local canonical = table.concat({
    "GET",
    ngx.var.uri,
    ngx.var.args or "",
    "host:" .. host .. "\nx-amz-content-sha256:" .. payload .. "\nx-amz-date:" .. amz_date .. "\n",
    signed_headers,
    payload,
}, "\n")

-- 2. 待签字符串
local scope = date .. "/" .. region .. "/s3/aws4_request"
local string_to_sign = "AWS4-HMAC-SHA256\n" .. amz_date .. "\n" .. scope .. "\n" .. sha256_hex(canonical)

-- 3. 派生签名密钥
local k = hmac_sha256("AWS4" .. sk, date)
k = hmac_sha256(k, region)
k = hmac_sha256(k, "s3")
k = hmac_sha256(k, "aws4_request")

-- 4. 签名并设置回源请求头
local signature = str.to_hex(hmac_sha256(k, string_to_sign))
ngx.req.set_header("x-amz-date", amz_date)
ngx.req.set_header("x-amz-content-sha256", payload)
ngx.req.set_header("Authorization", "AWS4-HMAC-SHA256 Credential=" .. ak .. "/" .. scope
    .. ", SignedHeaders=" .. signed_headers .. ", Signature=" .. signature)
```

配合的 Nginx 配置要注意两点：回源的 `Host` 必须和签名里的一致，所以要 `proxy_set_header Host $s3_host`；另外 S3 只接受和服务端时间相差 15 分钟以内的签名，节点时钟一旦漂移，就会出现间歇性 403，排查起来很隐蔽。

## 六、调试 Lua

线上排查主要靠 `ngx.log(ngx.ERR, ...)` 打日志，配合 `error_log` 的级别控制。本地开发想单步调试，可以用 [ZeroBrane Studio](https://studio.zerobrane.com/)，它支持远程调试 OpenResty 里的 Lua 代码；在没有图形界面的 Linux 服务器上，可以通过 `ssh -X` 把界面转发到本机。

## 参考

- [OpenResty 官方文档 lua-nginx-module](https://github.com/openresty/lua-nginx-module)
- [AWS Signature Version 4 签名流程](https://docs.aws.amazon.com/AmazonS3/latest/API/sig-v4-header-based-auth.html)
- [lua-resty-hmac](https://github.com/jkeys089/lua-resty-hmac)
