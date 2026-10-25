---
title: 一台电脑同时使用 GitHub 和公司 GitLab
published: 2017-07-12T00:00:00+08:00
updated: 2026-10-25T16:30:00+08:00
description: 个人项目用 GitHub、公司项目用 GitLab 时，如何在同一台电脑上配置两套 SSH 密钥和两套提交身份，并且按目录自动切换，不用每个仓库手动设置。
tags:
  - git
  - ssh
draft: false
category: Git
slug: gitlab-and-github
---

个人项目在 GitHub，公司项目在 GitLab，两边的账号、邮箱都不一样。要解决两个问题：

1. **认证**：两边用不同的 SSH 密钥；
2. **身份**：提交记录里的用户名和邮箱，个人项目用个人的，公司项目用公司的。

## 一、生成两套 SSH 密钥

现在推荐用 ed25519 算法，比 RSA 更短更安全：

```shell
ssh-keygen -t ed25519 -C "个人邮箱" -f ~/.ssh/id_ed25519_github
ssh-keygen -t ed25519 -C "公司邮箱" -f ~/.ssh/id_ed25519_gitlab
```

然后把两个 `.pub` 公钥分别添加到 GitHub 和 GitLab 的个人设置里。

## 二、用 ~/.ssh/config 按域名选择密钥

```
# 个人 GitHub
Host github.com
    HostName github.com
    User git
    IdentityFile ~/.ssh/id_ed25519_github
    IdentitiesOnly yes

# 公司 GitLab
Host gitlab.example.com
    HostName gitlab.example.com
    User git
    IdentityFile ~/.ssh/id_ed25519_gitlab
    IdentitiesOnly yes
```

`IdentitiesOnly yes` 很重要：没有它，SSH 会先把 ssh-agent 里所有的密钥挨个试一遍，可能用错密钥，或者尝试次数过多被服务器断开。

配好后验证：

```shell
ssh -T git@github.com
ssh -T git@gitlab.example.com
```

## 三、按目录自动切换提交身份

当年的做法是在每个公司仓库里手动执行 `git config --local user.name/user.email`，很容易忘。Git 2.13 之后可以用 `includeIf`，按仓库所在目录自动加载不同的配置。

`~/.gitconfig`：

```ini
[user]
    name = 个人用户名
    email = 个人邮箱

# work 目录下的仓库，自动使用公司身份
[includeIf "gitdir:~/work/"]
    path = ~/.gitconfig-work
```

`~/.gitconfig-work`：

```ini
[user]
    name = 公司用户名
    email = 公司邮箱
```

公司的项目都放在 `~/work/` 下面，提交时就会自动用公司身份。在仓库里执行 `git config user.email` 可以确认当前生效的是哪个。

## 四、遇到过的问题

当时推送到公司 GitLab 时出现过这个报错：

```
ssh_exchange_identification: read: Connection reset by peer
fatal: Could not read from remote repository.
```

它的意思是 SSH 连接在握手阶段就被服务端断开了，还没轮到验证密钥，所以和密钥配置无关。常见原因是服务端限制了允许 SSH 的来源 IP（比如只放行公司内网或 VPN），或者短时间内连接次数过多被拦截。当时的临时办法是改用 HTTPS 地址推送；根本的解决办法是找管理员确认 SSH 访问策略。
