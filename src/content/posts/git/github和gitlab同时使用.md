---
title: github 和 gitlab 同时使用
published: 2017-07-12T00:00:00+08:00
description: 在github账号已经配置为全局的情况下，如何再进行gitlab的账号配置，在本机同时兼顾gitlab和github项目
tags:
  - git
draft: false
category: Git
slug: gitlab-and-github
---

### github 和 gitlab 同时使用

>背景：原先电脑上已经存在github配置，公司内部需要使用gitlab进行项目管理，so，需要在同一台机器上配置github和gitlab的账号密码信息

#### 第一步 生成秘钥

github设置如下（之前已经设置过了）

    ssh-keygen -t rsa -C "注册的github邮箱"

提示要输入名称, 不管, 一路回车, 也不要设置密码

接下来配置为gitlab生成秘钥

    ssh-keygen -t rsa -C "注册的gitlab邮箱"


这次名称输入id_rsa_gitlab, 路径保存在~/.ssh/下面

在~/.ssh/目录下共有如下文件

    id_rsa.pub        id_rsa_gitlab.pub
    id_rsa            id_rsa_gitlab


#### 第二步 配置秘钥
分别读取id_rsa和id_rsa_gitlab

    cat id_rsa.pub
    cat id_rsa_gitlab.pub

将公钥分别配置到github和gitlab的个人设置里面

#### 第三步 配置config

在 ~/.ssh/目录下创建config文件

    cd ~/.ssh/
    vim config

输入以下配置
```config
# gitlab
Host gitlab

    HostName gitlab.ctzcdn.com
    IdentityFile ~/.ssh/id_rsa_gitlab

# githubhttp://zhzhzh@106.39.160.94/front/webpackDevKit.git
Host github
    HostName github.com
    IdentityFile ~/.ssh/id_rsa
```


#### 第四部 使用

由于之前使用gitHub时，将github的用户名，邮箱设置为了全局
所以在gitlab项目中，需要另外设置用户名为gitlab的用户名和邮箱：

    git init 
    git config --local user.name "gitlab用户名"
    git config --local user.emai "gitlab申请邮箱"


这样在gitlab项目目录下的就可以将项目远程配置给gitlab服务器了

    git remote add origin http://zhzhzh@106.39.160.94/front/webpackDevKit.git


#### 异常处理

另外注意：在使用ssh连接的时候，报了一个错误：

    git push origin master
    ssh_exchange_identification: read: Connection reset by peer
    fatal: Could not read from remote repository.
    Please make sure you have the correct access rights
    and the repository exists.


目前还没搞清楚原因在哪里，解决办法为将连接地址改为http协议，而不是ssh协议。