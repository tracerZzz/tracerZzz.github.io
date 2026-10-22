---
title: nginx使用
published: 2018-01-15T16:37:11+08:00
description: nginx作为目前主流的服务器，在众多领域都有着他的身影。这篇文章是自己在使用nginx过程中的一些记录。包括了nginx的自定义编译，常用的命令，以及gzip配置等。
tags:
  - nginx
draft: false
abbrlink: nginx-usage
---

### nginx手动编译（centos7）

1.查看最新稳定版本连接  http://nginx.org/en/download.html

2.wget 最新稳定版 wget http://nginx.org/download/nginx-1.12.2.tar.gz

3.解压文件 

```bash
tar zxvf nginx-1.12.2.tar.gz
```

5.依赖 pcre  pcre-devel

```bash
yum -y install pcre.x86_64 && yum -y install pcre-devel.x86_64
```

6.依赖 zlib 和zlib-devel

```bash
yum install -y zlib.x86_64 && yum install -y zlib-devel.x86_64
```

7.配置

—with-debug 启用debug

```bash
./configure --sbin-path=/usr/local/sbin/ --prefix=/usr/local/nginx --with-debug
```

增加nginx-rtmp-module

```
./configure --sbin-path=/usr/sbin/ --prefix=/usr/local/nginx  --add-module=../../nginx-rtmp-module  --with-debug
```



8.make & make install

```bash
make && make install
```



### nginx常用命令

1. nginx -t 测试配置文件
2. nginx -s reload 重启
3. nginx -s quit 退出
4. nginx -V 查看ngixn安装了哪些模块

### gzip配置

```Nginx
    gzip on;
    gzip_min_length 1k;
    gzip_buffers 4 16k;
    #gzip_http_version 1.0;
    gzip_comp_level 2;
    gzip_types text/plain application/x-javascript text/css application/xml application/javascript application/octet-stream text/javascript application/x-httpd-php image/jpeg image/gif image/png;
    gzip_vary off;
    gzip_disable "MSIE [1-6]\.";

```


### 常用术语

**UV（Unique visitor）**

是指通过互联网访问、浏览这个网页的自然人。访问您网站的一台电脑客户端为一个访客。00:00-24:00内相同的客户端只被计算一次。

一天内同个访客多次访问仅计算一个UV。

**IP（Internet Protocol）**

独立IP是指访问过某站点的IP总数，以用户的IP地址作为统计依据。00:00-24:00内相同IP地址之被计算一次。

**UV与IP区别**：

如：你和你的家人用各自的账号在同一台电脑上登录新浪微博，则IP数+1，UV数+2。由于使用的是同一台电脑，所以IP不变，但使用的不同账号，所以UV+2

**PV（Page View）**
即页面浏览量或点击量，用户每1次对网站中的每个网页访问均被记录1个PV。用户对同一页面的多次访问，访问量累计，用以衡量网站用户访问的网页数量。

**VV（Visit View）**
用以统计所有访客1天内访问网站的次数。当访客完成所有浏览并最终关掉该网站的所有页面时便完成了一次访问，同一访客1天内可能有多次访问行为，访问次数累计。

**PV与VV区别：**
如：你今天10点钟打开了百度，访问了它的三个页面；11点钟又打开了百度，访问了它的两个页面，则PV数+5，VV数+2.
PV是指页面的浏览次数，VV是指你访问网站的次数。