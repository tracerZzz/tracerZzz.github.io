---
title: rabbitmq
published: 2019-01-01T00:00:00+08:00
description: ''
tags: []
draft: true
slug: rabbitmq
---

### rabbitmq

#### mac安装

```shell
brew install rabbitmq
./sbin/rabbitmq-server
./sbin/rabbitmq-server -detached 后台启动
```

启动rabbitmq web服务：

```shell
rabbitmq-plugins enable rabbitmq_management
```
增加一个用户

```shell
sudo rabbitmqctl add_user admin admin
```

设置该用户为administrator角色：

```shell
sudo rabbitmqctl set_user_tags admin administrator
```


设置权限：

```shell
sudo rabbitmqctl  set_permissions  -p  '/'  admin '.' '.' '.'
```

之后就能用admin用户远程连接rabbitmq server了。

#### docker

```shell
docker pull rabbitmq
```

```shell
docker run -d -p 5672:5672 -p  15672:15672 rabbitmq:3.7.8-management
```

docker run -d -p 5672:5672  rabbitmq:3.7.8-management
docker run -d --net=host rabbitmq:3.7.8-management

36.111.140.165

guest

NofyRaYrHuGmjO2i



张双双 producer 2&5hGFRQD6uSVHJD    management
张展展 consumer Wel*g4C!y1rCprQp      management





LANG=en_US.UTF-8



localedef -v -c -i en_US -f UTF-8 en_US.UTF-8



```
firewall-cmd --permanent --add-rich-rule="rule family="ipv6" source address="58.49.156.133" port protocol="tcp" port="9090" accept"
58.49.156.131
```





```
sudo docker run -d --net=host --name dispatcher_http registry.ctzcdn.com/cdn/dispatcher:v0.1.0
```

```
sudo docker run -d --net=host -p 9090:9090 -p 5555:5555  --restart=always -u root \
        -v /usr/bin/docker:/usr/bin/docker \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v /etc/sysconfig/docker:/etc/sysconfig/docker \
        -v /var/cluster_conf_agent/:/var/cluster_conf_agent/ \
        -v /opt/ats/etc/trafficserver/:/opt/ats/etc/trafficserver/ \
        -v /etc/cluster_conf/:/etc/cluster_conf/ \
        -v /etc/nsd:/etc/nsd \
        --name agent_0.1.0 registry.ctzcdn.com/cdn/cluster_conf_agent:0.1.0
```

```
sudo docker run -d --net=host -p 9090:9090 -p 5555:5555  --restart=always -u root \
        -v /usr/bin/docker:/usr/bin/docker \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v /etc/sysconfig/docker:/etc/sysconfig/docker \
        -v /var/cluster_conf_agent/:/var/cluster_conf_agent/ \
        -v /etc/nsd:/etc/nsd \
        --name agent_0.1.0 registry.ctzcdn.com/cdn/cluster_conf_agent:0.1.0
```

```
sudo docker run -d --net=host -p 9090:9090 -p 5555:5555  --restart=always -u root \
        -v /usr/bin/docker:/usr/bin/docker \
        -v /var/run/docker.sock:/var/run/docker.sock \
        -v /etc/sysconfig/docker:/etc/sysconfig/docker \
        -v /var/cluster_conf_agent/:/var/cluster_conf_agent/ \
        -v /opt/ats/etc/trafficserver/:/opt/ats/etc/trafficserver/ \
        -v /etc/cluster_conf/:/etc/cluster_conf/ \
        --name agent_0.1.0 registry.ctzcdn.com/cdn/cluster_conf_agent:0.1.0
```

| 机器          | 服务                | 端口       |
| ------------- | ------------------- | ---------- |
| 58.49.156.133 | rabbitmq,dispatcher | 5672,15672 |
| 58.49.156.135 | gslb,agent          | 9090,5555  |
| 58.49.156.141 | agent               | 9090,5555  |
| 58.49.156.139 | agent               | 9090,5555  |
| 58.49.156.137 | agent               | 9090,5555  |

rabbitmq用户名密码和之前一样





 Request_at as day ,
count(if Status!='completed',true,null)/count(*)   as Cancellation Rate

{"headers":["Id","Client_Id","Driver_Id","City_Id","Status","Request_at","Users_Id","Banned","Role","Users_Id","Banned","Role"],"values":[[1,1,10,1,"completed","2013-10-01",1,"No","client",10,"No","driver"],[3,3,12,6,"completed","2013-10-01",3,"No","client",12,"No","driver"],[4,4,13,6,"cancelled_by_client","2013-10-01",4,"No","client",13,"No","driver"],[5,1,10,1,"completed","2013-10-02",1,"No","client",10,"No","driver"],[7,3,12,6,"completed","2013-10-02",3,"No","client",12,"No","driver"],[9,3,10,12,"completed","2013-10-03",3,"No","client",10,"No","driver"],[10,4,13,12,"cancelled_by_driver","2013-10-03",4,"No","client",13,"No","driver"]]}