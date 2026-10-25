---
title: 使用iterm2自定义命令快速部署hexo博客
published: 2018-01-14T20:19:07+08:00
description: 由于工作中使用命令终端的频率非常之高，自定义一些自己常用的命令来简化操作，将大大提高自己的效率，人生苦短，我爱偷懒。这里列举了一个例子来说明如何自定义命令来进行复杂的命令行操作。接下来的工作中，也会不断的来添加这些自定义命令来简化流程。
tags:
  - iterm2
draft: true
category: 工具
slug: iterm2-custom-commands
---

环境：iTerm+zsh

```Bash
echo "alias hexod='hexo clean && hexo g && hexo d'" >> ~/.bash_profile
source ~/.bash_profile
```

> 注意双引号中的单引号

在hexo博客目录下执行以下命令

```Shell
hexod
```

以此类推，我们可以在`~/.bash_profile`文件中添加自定义命令

#### 注意

需要注意的是，如果默认是用的zsh的活，每次打开iterm2都要手动的srouce ~/.bash_profile才能生效，比较麻烦

如果你的默认shell是`bash` ，那么把

```
. ~/.bash_profile
```

追加到 `~/.bashrc` 末尾, bash开启时会自动执行`.bashrc`这个文件

如果是其他的 比如 `zsh`， 那么追加到 `~/.zshrc` 末尾

其他类推。。。