---
title: RabbitMQ 发布订阅：CDN 配置下发和分布式账单任务的实践
published: 2026-10-25T16:00:00+08:00
description: 我在中国电信用 RabbitMQ 做过 CDN 配置下发系统，在百度用 RabbitMQ + Celery 做过分布式账单任务。这篇整理 RabbitMQ 的核心概念、交换机类型怎么选，以及消息不丢、不重、不乱序的几种做法。
tags:
  - rabbitmq
  - 消息队列
  - celery
  - CDN
draft: false
category: 架构
slug: rabbitmq
---

我用 RabbitMQ 做过两个系统：

- **中国电信 CDN 配置系统**：中心生成 Nginx 302 调度、ATS 缓存、DNS 等组件的配置，通过 RabbitMQ 下发到各个节点，节点上的 agent 收到后更新配置文件、重启对应的 Docker 服务；缓存刷新任务也走同一条链路。
- **百度云 CDN 定制化账单**：每月给头部客户生成账单，任务通过 RabbitMQ 分发给多台机器并行计算，用 Celery 把「拉数据 → 计费 → 生成文件 → 上传存储 → 发邮件」编排成链式任务。

这篇从这两个场景出发，整理 RabbitMQ 的用法和几个关键问题。

## 一、核心概念

RabbitMQ 里生产者不直接把消息发给队列，而是发给**交换机（exchange）**，交换机按规则把消息路由到一个或多个**队列（queue）**，消费者再从队列里取。

```mermaid
flowchart LR
    P["生产者"] -->|routing key| X{{"交换机"}}
    X -->|binding| Q1[("队列 1")]
    X -->|binding| Q2[("队列 2")]
    Q1 --> C1["消费者 1"]
    Q2 --> C2["消费者 2"]
```

交换机有四种类型，选哪种取决于「一条消息要给谁」：

| 类型 | 路由规则 | 适合的场景 |
| --- | --- | --- |
| direct | routing key 完全匹配 | 点对点，把任务发给指定的一类消费者 |
| fanout | 忽略 routing key，发给所有绑定的队列 | 广播，所有节点都要收到 |
| topic | routing key 按通配符匹配，`*` 匹配一段，`#` 匹配多段 | 按维度灵活订阅，比如按区域、按组件 |
| headers | 按消息头匹配 | 用得很少 |

## 二、配置下发：用 topic 交换机做定向广播

下面是按这个场景整理的思路和简化代码，不是当时的原始实现。

CDN 配置下发的特点是：一次变更，可能要发给全网所有节点，也可能只发给某个区域、某一类组件。用 topic 交换机，把 routing key 设计成「区域.组件」的形式，就能同时满足这两种需求：

- 每个节点的 agent 建一个自己的持久化队列，按所在区域和运行的组件绑定，比如广东节点绑定 `guangdong.nginx`、`guangdong.ats`，再绑定全网广播用的 `all.nginx`、`all.ats`；
- 只改广东节点的 ATS 配置，发 `guangdong.ats`；
- 全网的 Nginx 都要改，发 `all.nginx`；
- 以后要加一个维度（比如运营商），也只是在 routing key 里多加一段，通配符 `*`、`#` 可以按需匹配。

agent 端的处理流程（Python + pika，简化版）：

```python
import json
import pika

conn = pika.BlockingConnection(pika.ConnectionParameters("mq-host"))
ch = conn.channel()

ch.exchange_declare(exchange="cdn.config", exchange_type="topic", durable=True)
q = ch.queue_declare(queue="agent.node-001", durable=True).method.queue
for key in ["guangdong.nginx", "guangdong.ats", "all.nginx", "all.ats"]:
    ch.queue_bind(exchange="cdn.config", queue=q, routing_key=key)

ch.basic_qos(prefetch_count=1)  # 一次只取一条，处理完再取下一条

def on_message(ch, method, props, body):
    task = json.loads(body)
    try:
        if already_applied(task["version"]):     # 幂等：同一版本配置只应用一次
            ch.basic_ack(method.delivery_tag)
            return
        write_config(task["component"], task["content"])
        reload_service(task["component"])         # 例如 docker restart / nginx -s reload
        report(task["id"], "success")
        ch.basic_ack(method.delivery_tag)         # 处理成功才确认
    except Exception as e:
        report(task["id"], "failed", str(e))
        ch.basic_nack(method.delivery_tag, requeue=False)  # 交给死信队列，避免无限重试

ch.basic_consume(queue=q, on_message_callback=on_message)
ch.start_consuming()
```

这段代码里体现了配置下发最关心的三件事：

1. **手动确认（ack）**：改完配置、重启成功之后才 ack。agent 处理到一半挂掉，消息会重新投递，不会丢。
2. **幂等**：重新投递意味着同一条消息可能执行两次。每份配置带一个版本号，已经应用过的版本直接跳过。
3. **结果回报**：中心要知道每个节点到底改没改成功，所以 agent 处理完要上报结果，失败的单独重试或者人工介入。

## 三、分布式账单：RabbitMQ + Celery 的链式任务

账单场景和配置下发不同：不是「所有节点都要收到」，而是「一堆任务，谁空闲谁来做」。这正好是工作队列模式：多个 worker 消费同一个队列，RabbitMQ 按轮询把任务分给它们，`prefetch_count` 控制每个 worker 手上最多压几个任务，避免慢的 worker 囤积任务。

直接用 pika 写任务分发、重试、结果收集比较繁琐，所以用了 [Celery](https://docs.celeryq.dev/)，RabbitMQ 作为它的 broker。一个客户的出账流程是几个有先后依赖的步骤，用 Celery 的 `chain` 串起来，上一步的返回值自动作为下一步的输入：

```python
from celery import Celery, chain

app = Celery("billing", broker="amqp://user:pass@mq-host//")

@app.task(bind=True, max_retries=3, default_retry_delay=60)
def fetch_usage(self, customer, month):
    try:
        return query_usage(customer, month)      # 拉取域名级带宽、流量打点
    except TimeoutError as e:
        raise self.retry(exc=e)                  # 数据源超时，延迟 60 秒重试，最多 3 次

@app.task
def calc_bill(usage):
    return apply_billing_rules(usage)            # 95 峰值、日峰月均、闲忙时等计费方式

@app.task
def render_and_upload(bill):
    return upload(render_file(bill))             # 按客户要求的格式生成文件并上传

@app.task
def send_mail(file_url):
    notify(file_url)

# 每个客户一条链，所有客户的链并行跑在多台 worker 上
for customer in customers:
    chain(fetch_usage.s(customer, "2020-10"), calc_bill.s(),
          render_and_upload.s(), send_mail.s()).apply_async()
```

几个实际要注意的点：

- **重试只针对可恢复的错误**：数据源超时可以重试；计费规则配错了，重试多少次都一样，应该直接失败、告警。
- **每一步都要幂等**：重试意味着同一步可能执行多次，上传文件用固定的文件名覆盖，发邮件前检查是否已发送。
- **定时校验**：链式任务跑完不代表结果对。当时还有一个定时任务，检查账单数据和源数据是否一致，不一致就重新触发。

## 四、消息不丢、不重、不乱序

这是用消息队列绕不开的三个问题，整理一下各自的手段：

**不丢**要三端一起保证：

- 生产者：开启 **publisher confirm**，broker 确认收到之后才算发送成功；
- broker：交换机、队列声明为 `durable`，消息设为持久化（`delivery_mode=2`），重启后不丢；
- 消费者：关闭自动确认，**处理成功后手动 ack**。

**不重**：RabbitMQ 本身只能做到「至少一次」投递，重复是不可避免的，只能靠消费端**幂等**解决，比如用业务 ID 或版本号去重。

**不乱序**：单个队列、单个消费者时消息是有序的；一旦多个消费者并发处理，或者消息被重新投递，顺序就无法保证。配置下发这种场景，与其强求顺序，不如每份配置带上版本号，**只应用比当前更新的版本**，乱序到达的旧版本直接丢弃。

## 五、本地快速启动

```shell
# 带管理界面的镜像，15672 是 Web 管理端口
docker run -d --name rabbitmq -p 5672:5672 -p 15672:15672 rabbitmq:3-management

# 默认的 guest 账号只能从本机登录，远程连接要新建用户
docker exec rabbitmq rabbitmqctl add_user <user> <password>
docker exec rabbitmq rabbitmqctl set_user_tags <user> administrator
docker exec rabbitmq rabbitmqctl set_permissions -p / <user> ".*" ".*" ".*"
```

注意 `set_permissions` 的三个参数是正则表达式，分别表示配置、写、读权限，`".*"` 才是「全部」；只写 `"."` 匹配的是长度为 1 的资源名。

## 参考

- [RabbitMQ Tutorials](https://www.rabbitmq.com/tutorials)
- [RabbitMQ 可靠性指南](https://www.rabbitmq.com/docs/reliability)
- [Celery Canvas：chain、group、chord](https://docs.celeryq.dev/en/stable/userguide/canvas.html)
