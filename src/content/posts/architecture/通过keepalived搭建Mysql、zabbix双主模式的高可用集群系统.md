---
title: 通过keepalived搭建Mysql、zabbix双主模式的高可用集群系统
published: 2018-03-23T12:37:11+08:00
description: 本文记录了通过keepalived搭建zabbix双主模式（主主同步）高可用系统的详细步骤，其中会介绍zabbix的安装，mysql的双主互备，keepalived的配置，也会记录过程中遇到的问题以及对应的解决方法;
tags:
  - keepalived
  - zabbix
  - 数据库
draft: false
category: 架构
image: ./通过keepalived搭建Mysql、zabbix双主模式的高可用集群系统.assets/20180316152118561067778.png
abbrlink: keepalived-mysql-dual-master
---

### Mysql双主模式

mysql双主模式也叫做主主同步或者双主互备，即两台数据库server互为主备。双主模式是在普通的master-slave主备模式下进一步拓展而来的，普通的master-slave主备模式即一主一备，slave主机拉取master主机的Binary log，然后将二进制文件解析为sql语句并完全顺序的执行sql语句所记录的所有操作，从而使slave的数据和master保持一致；双主互备是两台机器互相以对方为master，定时拉取对方的Binary log。双主互备中两台主机都可以进行读写操作，而在普通主备，只有master可以进行写操作，slave只能进行读取操作；



![20180316152118561067778.png](./通过keepalived搭建Mysql、zabbix双主模式的高可用集群系统.assets/20180316152118561067778.png)

------



### Keepalived

[Keepalived](http://www.keepalived.org/doc/)是一款高可用软件。keepalived可以让服务器集群共享一个虚拟ip，也就是我们说的vip，同一时间只有一个服务器占有这个虚拟ip，若该服务器不可用或者该服务器的权重小于其他机器，则虚拟IP漂移至另一台服务器并对外提供服务；

### 准备工作

#### 机器准备（centos7系统）

两台server:`183.57.148.5`（**master**）,`183.57.148.7`(**slave**)

一个vip:`183.57.148.23`

> 由于基于vrrp协议，两台server和vip必须处于同一网段

#### 安装mysql 并初始化密码

首先登陆master

```Sh
yum install mysql-server
mysql -h localhost -u root -p
```

发现需要输入密码,于是去日志文件里找默认密码

```Sh
vim /var/log/mysql.log
```

找到下面一行

`[Note] A temporary password is generated for root@localhost: i8nk2b*1z,bS`

`i8nk2b*1z,bS`是初始化的密码，再次使用`mysql -h localhost -u root -p`登陆

使用以下命令重置root密码

```Sql
ALTER USER 'root'@'localhost' IDENTIFIED BY 'MyNewPass111!';		
```

登陆slave执行相同的操作

### 下载zabbix-proxy，导入表结构

```shell
yum install zabbix-proxy-mysql
```

然后根据[zabbix文档](https://www.zabbix.com/documentation/3.4/manual/installation/install_from_packages/rhel_centos)提示创建数据库表结构

```Sh
mysql -h localhost -u root -p
```

```sql
create database zabbix_proxy character set utf8 collate utf8_bin;
```
为zabbix_proxy库创建zabbix用户并授权，然后退出（避免使用root登陆特定的数据库）

```Sql
grant all privileges on zabbix_proxy.* to zabbix@localhost identified by 'Zabbix@ctzcdn4321!';  
quit
```

执行zabbix_proxy自带的sql生成zabbix_proxy表结构

```Sh
zcat /usr/share/doc/zabbix-proxy-mysql-3.4.1/schema.sql.gz |mysql -uroot -p zabbix_proxy
```

这个过程需要耐心等待一会，然后登陆数据库查看表数量 一共140个，如果数量不对，需要drop掉zabbix_proxy重新再生成一次。

最后在slave机器上也执行以上操作。确保两台机器的数据库表结构一致；

### 修改/etc/my.cnf文件，配置同步

```Sh
vim /etc/my.cnf
```

在[mysqld]下追加

```Mysql
log-bin = mysql-bin    #开启binlog日志

binlog_format = mixed  #基于混合模式,mysql Replication 有三种模式，基于语句，基于行，基于混合模式

server-id = 1          #server-id master要和slave区分开，master为1 ，slave为2 

relay-log = relay-bin  # 开启中继日志

relay-log-index = slave-relay-bin.index #中继日志的索引文件

auto-increment-increment = 2 #主键自增的幅度，这个要和机器的数量一致

auto-increment-offset = 1  #从几开始自增，master从1开始自增，每次增加2,即master生成的主键永远为奇数

replicate-wild-do-table=zabbix_proxy.% #需要同步的表，这里是zabbix_proxy下的所有的表,用通配符%表示

slave_skip_errors = 1062,1032,1060  #同步时跳过的错误编号，1062，1032，1060

```

重启mysql`sudo systemctl restart mysqld`

重新登陆mysql,为slave机器授予replication权限

```sql
grant replication slave on *.* to 'repl_user'@'183.57.148.7' identified by 'MyNewPass111!';
```

查看master当前binlog状态信息

```
show master status;
```

![20180319152143914570938.png](./通过keepalived搭建Mysql、zabbix双主模式的高可用集群系统.assets/20180319152143914570938.png)

在slaver机器上指定数据库master为183.57.148.5，并指定日志文件名字和位置，这样slaver就知道从哪里开始进行同步了。

```Sh
change master to master_host='183.57.148.5',master_user='repl_user',master_password='MyNewPass111!',master_log_file='mysql-bin.000001',  master_log_pos=154;
```

开启slaver

```Sql
start slave
```

接下来在slave机器上进行同样的操作，给maser授予复制权限，然后查看slave机器的binlog状态信息（每个机器的不一定一样，这里和maser的状态一样）

```
grant replication slave on *.* to 'repl_user'@'183.57.148.4' identified by 'MyNewPass111!';
```

![20180319152143914570938.png](./通过keepalived搭建Mysql、zabbix双主模式的高可用集群系统.assets/20180319152143914570938.png)

在master机器上指定数据库master为183.57.148.7,并指定日志文件名字和位置

```Sql
change master to master_host='183.57.148.7',master_user='repl_user',master_password='MyNewPass111!',master_log_file='mysql-bin.000001',  master_log_pos=154;
```

开启slaver

```Sql
start slave
```

### 防火墙设置

开启3306端口

```Sh
sudo firewall-cmd --zone=public --add-port=3306/tcp --permanent

sudo firewall-cmd --reload
```

### 验证数据库同步

在两台机器上分别查看slave状态

```Sql
show slave status\G;
```

![20180322152171000488344.png](./通过keepalived搭建Mysql、zabbix双主模式的高可用集群系统.assets/20180322152171000488344.png)

必须确保两个参数 Slave_IO_Running，Slave_SQL_Running为Yes

都为yes后创建一个表，测试同步数据

```Sql
DROP TABLE IF EXISTS `test`;
CREATE TABLE `test` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
insert test values();
select * from test;
```

在master机器上执行上面的操作,返回结构，

![20180322152171091923913.png](./通过keepalived搭建Mysql、zabbix双主模式的高可用集群系统.assets/20180322152171091923913.png)

在slave上也执行查询语句`select * from test;`,返回同样的结果。再在master上执行`insert test values();`返回结果如下

![20180322152171094816591.png](./通过keepalived搭建Mysql、zabbix双主模式的高可用集群系统.assets/20180322152171094816591.png)

可以看到master上的所有自增主键都是奇数，接着在slave机器上执行`insert test values();`语句，结果为123，slave为偶数，从2开始，说明我们的自增配置已经生效，并且也进行了数据同步；

### 下载安装keepalived

`yum install keepalived`下载keepalived，keepalived只有一个配置文件，默认位于/etc/keepalived/keepalived.conf

在配置之前先查看本地机器的网卡设置，使用`ip a`命令,得知当前ip使用的是网卡**eth0**,这个要根据`ip a`命令执行结果得到。**网卡名称将在接下来的keepalived配置文件和防火墙设置中用到**。

```
vim /etc/keepalived/keepalived.conf
```

```
! Configuration File for keepalived
global_defs {
   router_id mysql-1
}
#group 
vrrp_sync_group VG1 {
      group {
              HA_1
               }
            }

vrrp_script check_mysql {
script /etc/keepalived/bin/check.sh
interval 2   #执行间隔
weight 20    #权重
}
vrrp_instance HA_1 {
    state BACKUP  #两个节点最好都设置成BACKUP模式，避免因为意外情况下（比如脑裂）相互抢占导致往两个节点写入相同数据而引发冲突；
    interface eth0  #网卡
    virtual_router_id 51 #两台机器要一致
    priority 100         #初始权重，master机器配置为100，slave配置为90
    nopreempt            #不抢占，当slave机器正常工作时，master恢复正常后不抢占slave的vip
    advert_int 1         #检查间隔，两台机器一致
    authentication { 
        auth_type PASS
        auth_pass 1111   #两台一致
    }
    virtual_ipaddress {
    	183.57.148.23  #vip
    }
	
    track_script {
        check_mysql
    }
}
```

#### keepalived的配置文件说明

vrrp_sync_group的应用场景为：如果路由有2个网段，一个内网，一个外网，每个网段开启一个VRRP实例，假设VRRP配置为检查内网，那么当外网出现问题 时，VRRPD会认为自己是健康的，则不会发送Master和Backup的切换，从而导致问题，Sync Group可以把两个实例都放入Sync Group，这样的话，Group 里任何一个实例出现问题都会发生切换。在这里其实并没有用到group，因为我们只设置了一个实例。

vrrp_instance配置了检测脚本，vip等信息。两台机器的配置基本一致，除了priority参数（master设置为100，slave设置为90）。当master机器keepalivde启动后，将会去执行check.sh，每两秒执行一次，如果执行结果返回零，将在初始权重上加上20，maste的权重将达到120，同理，slave的权重为110（90+20）。这时，vip将漂移到master机器上。如果master上的check.sh执行结果返回1,那么master的权重将不会加20，那么master的权重为100，小于110，此时vip将漂移到slave机器上。keepalived就是这样根据权重的大小进行vip漂移的。另外，需要注意的是，**检测脚本的权重一定要大于两台机器的初始权重**，20>(100-90),因为只有这样，检测脚本检测到服务异常时才能影响到权重的总和。

vrrp_script配置了检测脚本和被检测的服务的权重，以及检测频率等。这里的关键是check.sh的实现。这个脚本这里主要是用来检测mysql是否正常服务，而正常服务的检测可以很简单，也可以很复杂，比如简单的检测msyqld服务是否正常启动，复杂的可以用msyl命令登陆数据库，执行sql语句，查看mysql的状态，进行判断。这里我们只是简单的检测了mysqld服务是否正常启动；

```Sh
#!/bin/bash
killall -0 mysqld zabbix_proxy
```

试了了killall命令，如果没有该命令需要安装`sudo yum install psmisc -y`,`-0` 是检测服务正常运行的信号量，如果正常运行返回0，不正常返回1，支持传入多个服务；

同时需要注意的是记得为该脚本授权`chmod +x /etc/keepalived/bin/check.sh`;

`sudo vim check.sh`

```sh
#!/bin/bash
sudo killall -0 mysqld zabbix-proxy
```

#### Keepalived防火墙设置

keepalived需要执行下面两条语句，对防火墙进行操作，才能确保两台keepalived能够进行选举,如果没有进行防火墙设置，则会出现两台机器都绑定了vip（脑裂）,原因就是两台机器没法进行通信，无法找到真正的master;

```Sh
sudo firewall-cmd --direct --permanent --add-rule ipv4 filter INPUT 0 --in-interface eth0 --destination 224.0.0.18 --protocol vrrp -j ACCEPT
sudo firewall-cmd --direct --permanent --add-rule ipv4 filter OUT 0 --out-interface eth0 --destination 224.0.0.18 --protocol vrrp -j ACCEPT
sudo firewall-cmd --reload
```

### 启动zabbi-proxy

#### 修改配置文件

`vim /etc/zabbix/zabbix_proxy.conf`

```
ProxyMode=1
Server=124.126.126.143
Hostname=183.57.148.23  #vip
LogFile=/var/log/zabbix/zabbix_proxy.log
LogFileSize=0
PidFile=/var/run/zabbix/zabbix_proxy.pid
SocketDir=/var/run/zabbix
DBHost=localhost
DBName=zabbix_proxy
DBUser=zabbix
DBPassword=Zabbix@ctzcdn4321!
HeartbeatFrequency=10
ConfigFrequency=60
DataSenderFrequency=5
StartPollers=50
StartPollersUnreachable=10
StartTrappers=10
StartPingers=10
SNMPTrapperFile=/var/log/snmptrap/snmptrap.log
CacheSize=8G
StartDBSyncers=10
HistoryCacheSize=2G
HistoryIndexCacheSize=2G
Timeout=30
#DebugLevel=4
#ExternalScripts=/usr/lib/zabbix/externalscripts
#LogSlowQueries=3000

```

```sh
#开启端口
sudo firewall-cmd --zone=public --add-port=10051/tcp --permanent
sudo firewall-cmd --reload
#启动zabbix-proxy
systemctl start zabbix-proxy
```

#### 开机自动启动

```
systemctl enable zabbix-proxy
systemctl enable mysqld
```

### 测试方法

1.查看vip绑定情况 ip a

2.通过连接vip的mysql，

```
msyql -h 183.57.148.23 -uroot -p
show variables like "%hostname%";
```

查看返回的hostaname,就知道了当前连接是哪台机器



### **MySQL出现同步延迟解决优化方法**

 

1.主从复制的从库太多导致复制延迟
优化：建议从库数量3-5个为宜（具体看自己硬件配置）

2.从库硬件比主库硬件差
优化：提升硬件性能

3.慢SQL语句过多
优化：SQL语句执行时间太长，需要优化SQL语句（需要联系DBA开发共同商讨优化语句）

4.主从复制的设计问题
优化：主从复制单线程，可以通过多线程IO方案解决；另外MySQL5.6.3支持多线程IO复制。

5.主从库之间的网络延迟
优化：尽量链路短，提升端口带宽

6.主库读写压力大
优化：前端加buffer和缓存。主从延迟不同步（延迟的多少，只要不影响业务就没事）

7、业务设计缺陷导致延迟影响业务
优化：从库没有数据改读主库