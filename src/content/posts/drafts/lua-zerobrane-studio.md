---
title: lua-zerobrane-studio
published: 2019-01-01T00:00:00+08:00
description: ''
tags: []
draft: true
abbrlink: lua-zerobrane-studio
---

### 安装

https://studio.zerobrane.com/doc-installation

```shell
wget https://download.zerobrane.com/ZeroBraneStudioEduPack-1.70-linux.sh

sh ZeroBraneStudioEduPack-1.70-linux.sh

zbstudio

```

报错



```shell
sudo  yum install -y gtk2-devel-2.24.31-1.el7.i686 gtk2 libgtk-x11-2.0.so.0 libSM-1.2.2-2.el7.x86_64 mesa-libGL xdg-utils install dejavu-lgc-sans-fonts.
```

![20180617152921377554345.png](./lua-zerobrane-studio.assets/20180617152921377554345.png)

到这一步，说明已经安装好了，需要配置图像界面

> 使用ssh x11 forwarding实现







```
yum install -y passwd openssl openssh-server
ssh-keygen -t rsa -f /etc/ssh/ssh_host_rsa_key
ssh-keygen -t rsa -f /etc/ssh/ssh_host_ecdsa_key
ssh-keygen -t rsa -f /etc/ssh/ssh_host_ed25519_key
/usr/sbin/sshd
ps -ef|grep sshd
kill -9 107

vim /root/run.sh


    #!/bin/bash
xhost +
export DISPLAY=127.0.0.1:0.0
   /usr/sbin/sshd
/usr/bin/openresty -g "daemon off;"

yum whatprovides "*/xhost"
yum install -y xorg-x11-server-utils-7.7-20.el7.x86_64
xhost +
export DISPLAY=127.0.0.1:0.0
yum -y install xorg-x11-xauth

yum install passwd
passwd root
yum install xclock
xclock
```

```
ssh root@localhost -p 10021 -X
```



### 中文乱码

```shell
yum groupinstall "fonts"
```

