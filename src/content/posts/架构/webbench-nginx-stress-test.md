---
title: 压力测试工具webbench安装与使用
published: 2018-06-16T12:37:11+08:00
description: Webbench能测试处在相同硬件上，不同服务的性能以及不同硬件上同一个服务的运行状况。webbench的标准测试可以向我们展示服务器的两项内容：每秒钟相应请求数和每秒钟传输数据量。webbench不但能具有便准静态页面的测试能力，还能对动态页面（ASP,PHP,JAVA,CGI）进 行测试的能力。还有就是他支持对含有SSL的安全网站例如电子商务网站进行静态或动态的性能测试。 **Webbench最多可以模拟3万个并发连接去测试网站的负载能力
tags:
  - webbench
  - nginx
draft: false
abbrlink: webbench-nginx-stress-test
---

Webbench能测试处在相同硬件上，不同服务的性能以及不同硬件上同一个服务的运行状况。webbench的标准测试可以向我们展示服务器的两项内容：**每秒钟相应请求数和每秒钟传输数据量。**webbench不但能具有便准静态页面的测试能力，还能对动态页面（ASP,PHP,JAVA,CGI）进 行测试的能力。还有就是他支持对含有SSL的安全网站例如电子商务网站进行静态或动态的性能测试。 **Webbench最多可以模拟3万个并发连接去测试网站的负载能力。

![20180616152907932443010.png](./webbench-nginx-stress-test.assets/20180616152907932443010.png)

### 安装

```shell
wget http://www.ha97.com/code/webbench-1.5.tar.gz
tar zxvf webbench-1.5.tar.gz
cd webbench-1.5
make && make install
```

#### 报错

```
cc -Wall -ggdb -W -O   -c -o webbench.o webbench.c
webbench.c: 在函数‘alarm_handler’中:
webbench.c:77:31: 警告：未使用的参数‘signal’ [-Wunused-parameter]
 static void alarm_handler(int signal)
                               ^
cc -Wall -ggdb -W -O  -o webbench webbench.o
ctags *.c
/bin/sh: ctags: 未找到命令
make: [tags] 错误 127 (忽略)
install -s webbench /usr/local/bin
install -m 644 webbench.1 /usr/local/man/man1
install: 无法创建普通文件"/usr/local/man/man1": 没有那个文件或目录
make: *** [install] 错误 1
```

这是因为缺少ctags,需要安装依赖，centos7环境下直接yum安装；

```shell
yum install ctags
```

再次执行make && make install,依旧报错

```
ctags *.c
install -s webbench /usr/local/bin
install -m 644 webbench.1 /usr/local/man/man1
install: 无法创建普通文件"/usr/local/man/man1": 没有那个文件或目录
make: *** [install] 错误 1
```

这是因为没有指定的目录导致的，通过mkdir创建指定的目录即可，再次make && make install

得到安装成功结果

```
install -s webbench /usr/local/bin
install -m 644 webbench.1 /usr/local/man/man1
install -d /usr/local/share/doc/webbench
install -m 644 debian/copyright /usr/local/share/doc/webbench
install -m 644 debian/changelog /usr/local/share/doc/webbench
```

### 使用

命令提示

```
webbench
webbench [option]... URL
  -f|--force               Don't wait for reply from server.
  -r|--reload              Send reload request - Pragma: no-cache.
  -t|--time <sec>          Run benchmark for <sec> seconds. Default 30.
  -p|--proxy <server:port> Use proxy server for request.
  -c|--clients <n>         Run <n> HTTP clients at once. Default one.
  -9|--http09              Use HTTP/0.9 style requests.
  -1|--http10              Use HTTP/1.0 protocol.
  -2|--http11              Use HTTP/1.1 protocol.
  --get                    Use GET request method.
  --head                   Use HEAD request method.
  --options                Use OPTIONS request method.
  --trace                  Use TRACE request method.
  -?|-h|--help             This information.
  -V|--version             Display program version.
```

#### 示例

```
webbench -c 500 -t 10 localhost/test
```

每次500个客户端，访问10s



nginx配置根据机器的硬件配置

![2018061615291219132577.png](./webbench-nginx-stress-test.assets/2018061615291219132577.png)

```nginx
worker_processes  1;

events {

        worker_connections  1024;

}

```

结果如下：

![20180616152912093499834.png](./webbench-nginx-stress-test.assets/20180616152912093499834.png)

十秒内完成了接近六万的请求，每秒差不多六千并发；可以多试几次

将客户端数量进行调整，测试得到如下结果

| 客户端个数 | 请求时间(s) | requests(susceed) | 平均每秒请求个数（requests/sec） |
| ---------- | ----------- | ----------------- | -------------------------------- |
| 500        | 10          | 58310             | 5831                             |
| 1000       | 10          | 60899             | 6090                             |
| 2000       | 10          | 84720             | 8472                             |
| 5000       | 10          | 85271             | 8527                             |

![20180616152912194712214.png](./webbench-nginx-stress-test.assets/20180616152912194712214.png)

当客户端个数调整到10000的时候，已经可以看到，已经访问不到资源

### 调整机器配置和nginx配置

将cpu调整到4核，内存调到2048

nginx配置调整如下

```nginx
worker_processes  4;

events {

        worker_connections  1024;

}
```

| 客户端个数 | 请求时间(s) | requests(susceed) | 平均每秒请求个数（requests/sec） |
| ---------- | ----------- | ----------------- | -------------------------------- |
| 500        | 10          | 164548            | 16454                            |
| 1000       | 10          | 198593            | 19859                            |
| 2000       | 10          | 190463            | 19046                            |
| 5000       | 10          | 182662            | 182662                           |
| 10000      | 10          | 161927            | 16192                            |

可以看见，最大的并发为19859，可见传言nginx每秒两万并发并非空穴来风，和论坛里大家的一万八也不相上下，当然这里的请求都是最简单的静态资源请求，没有特别复杂的业务。