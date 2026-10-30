---
title: git常用命令
published: 2018-04-15T16:37:11+08:00
description: 在开发过程中git已经是必不可少的版本控制以及团队合作工具，在使用git的过程中，熟知git常用命令是每位开发者的基本技能，这里就记录了使用git过程中经常用到的一些命令，其中包含了代码回滚，分支合并，git配置管理，远程源管理等；
tags:
  - git
draft: true
category: Git
slug: git-commands
---

![20180514152628079993927.png](./git常用命令.assets/20180514152628079993927.png)

#### 放弃修改

git checkout filename 放弃某个文件修改

git checkout . && git clean -df  放弃当前目录所有文件的修改

#### 查看提交记录

git log 

#### 回滚

git reset --hard a2d36837308dcb2f53687abbc43b88096ee39d91 返回到某个节点，不保留修改。

当本地使用reset进行代码回滚的时候，在往远程push的时候需要使用-f  参数

#### 当前状态

git  status

#### 推送到远程

git push -f origin master

#### 合并分支

git merge upstream/master

#### git 配置

—local 为当前项目的配置

—global为全局的配置

git config —local user.name "tracerzzz"

git config —local user.email "173439618@qq.com"






