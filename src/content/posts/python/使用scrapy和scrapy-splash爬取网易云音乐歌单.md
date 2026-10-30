---
title: 使用scrapy+scrapy-splash爬取网易云音乐歌单
published: 2018-05-02T16:37:11+08:00
description: 在使用网易云音乐的时候，你是否想过大家都在听些什么，什么音乐被听得最多，作为一枚程序员，肯定是自己动手丰衣足食啦，那么，这篇文正将会告诉你如何使用scrapy+scrapy-splash来爬取网易云音乐的歌单，然后存入mongodb，通过播放量找到大家听得最多的歌单。
tags:
  - python
  - scrapy
draft: false
category: Python
slug: scrapy-netease-music-playlist
---

> 这是 2018 年写的旧文。网易云音乐的页面和接口此后变化很大，文中的选择器和地址大概率已经失效，这里只作为 Scrapy + Splash 抓取动态页面的思路参考。

![2018051515263513332302.png](./使用scrapy和scrapy-splash爬取网易云音乐歌单.assets/2018051515263513332302.png)

### 创建项目

```bash
scrapy startproject music163Scrapy
cd music163Scrapy
scrapy genspider Music163 163.com
```

文件目录如下：

![20180515152636349896977.png](./使用scrapy和scrapy-splash爬取网易云音乐歌单.assets/20180515152636349896977.png)

### Items.py

生成项目目录之后就可以开始编写代码啦，首先修改items.py，定义我们爬取网页后收集的字段。

```python
import scrapy


class Scrapymusic163Item(scrapy.Item):
    # define the fields for your item here like:
    # name = scrapy.Field()
    title = scrapy.Field()  # 标题
    link = scrapy.Field()  # 链接
    realLink=scrapy.Field() #完整连接
    desc = scrapy.Field()  # 简述
    listenCount = scrapy.Field() #播放数量
    posttime = scrapy.Field()  # 发布时间
    imgUrl=scrapy.Field()  # 歌单封面图片url
    # pass

```

### Music163Spider

```python
class Music163Spider(scrapy.Spider):

    name = "music163"
    allowed_domains = ["163.com"]
    start_urls = [
        "https://music.163.com/discover/playlist/?order=new",
        "https://music.163.com/#/discover/playlist/"

    ]
    def parse(self, response):
        for url in self.start_urls:
            yield SplashRequest(url=url, callback=self.parseRequest,endpoint='render.json', args={'wait': 1,'html':1,'iframes': 1,'script':1})

    def parseRequest(self,response):
        iframe_html = response.data['childFrames'][0]['html']
        sel = parsel.Selector(iframe_html)
        # for se in sel.xpath('//div[@class="n-rcmd"]/div[@class="v-hd2"]/div[@class="tab"]/a'):
        for se in sel.xpath("//div[@id='cateListBox']/div[@class='bd']//a")[1:]:
            item = Scrapymusic163Item()
            item['title'] = se.xpath('text()')[0].extract()
            item['link'] = se.xpath('@href')[0].extract()
            url = response.urljoin(item['link'])
            yield SplashRequest(url,self.parse_gedan,endpoint='render.json', args={'wait': 2,'html':1,'iframes': 1,'script':1})
    def parse_gedan(self, response):
        iframe_html = response.data['childFrames'][0]['html']
        sel = parsel.Selector(iframe_html)
        for se in sel.xpath('//ul[@id="m-pl-container"]/li'):
            item = Scrapymusic163Item()
            item['title'] = se.xpath('p[@class="dec"]/a/text()')[0].extract()
            item['link'] = se.xpath('p[@class="dec"]/a/@href')[0].extract()
            url=response.urljoin(item['link'])
            item['realLink']=url
            item['listenCount']=se.xpath('div/div/span[@class="nb"]/text()')[0].extract()
            if(item['listenCount'] and "万" in item['listenCount']):
                item['listenCount']=int(item['listenCount'].replace("万","0000"))
            item['listenCount']=int(item['listenCount'])
            item['imgUrl']=se.xpath('div/img[@class="j-flag"]/@src')[0].extract()
            yield item
        next_pages = sel.xpath('//a[@class="zbtn znxt"]')

        if next_pages:
            url = response.urljoin(next_pages.xpath('@href')[0].extract())
            yield SplashRequest(url,self.parse_gedan,endpoint='render.json', args={'wait': 2,'html':1,'iframes': 1,'script':1})
if __name__ == '__main__':
    pass
```

上边这段代码是爬取歌单的关键。这里首先说下爬取的思路，打开网易云的网站，找到歌单连接,歌单分为热门和最新两种，每种又根据风格分为72小类，思路就是先爬取所有种类的连接

![20180515152636458293531.png](./使用scrapy和scrapy-splash爬取网易云音乐歌单.assets/20180515152636458293531.png)

再打开每类歌单的网页

![20180515152636639480608.png](./使用scrapy和scrapy-splash爬取网易云音乐歌单.assets/20180515152636639480608.png)

从上面的图片中，我们可以看到每首歌的标题,连接，收听次数等信息。

### scrapy-splash

由于网易云的连接嵌套了动态链接的iframe,这里使用了scrapy-splash来动态渲染iframe，相当于让scrapy-splash来执行网页中的js，并将渲染结果返给我们，这样我们就可以继续使用xpath来筛选自己感兴趣的内容了。

#### docker 部署scrapy-splash

```bash
docker pull scrapinghub/splash

docker run -p  8050:8050 scrapinghub/splash
```

#### 配置

```bash
vim setting.py
```

```python
#SPLASH SERVER
SPLASH_URL = 'http://127.0.0.1:8050/render.json'

DOWNLOADER_MIDDLEWARES = {
    'scrapy_splash.SplashCookiesMiddleware': 723,
    'scrapy_splash.SplashMiddleware': 725,
    'scrapy.downloadermiddlewares.httpcompression.HttpCompressionMiddleware': 810,
}


SPIDER_MIDDLEWARES = {
    'scrapy_splash.SplashDeduplicateArgsMiddleware': 100,
}

DUPEFILTER_CLASS = 'scrapy_splash.SplashAwareDupeFilter'

HTTPCACHE_STORAGE = 'scrapy_splash.SplashAwareFSCacheStorage'
```

详细参见[scrapy-splash文档](http://splash.readthedocs.io/en/latest/)

需要注意的是在使用scrapy-splash时需要用SplashRequest来代替scrapy原始的request,这是scrapy-splash对scrapy的request进行了进一步的封装，支持了更多的参数，同时也支持将request的返回配置为不同的格式，如html,json等。这里使用了json返回。

#### mongodb

依赖[scrapy-mongodb](https://github.com/sebdah/scrapy-mongodb)

```python
ITEM_PIPELINES = {
  "scrapy_mongodb.MongoDBPipeline":900
}

MONGODB_URI = 'mongodb://root:'+urllib.parse.quote('MyNewPass+@321')+'@localhost:27017'
MONGODB_DATABASE = 'scrapy'
# MONGODB_COLLECTION = 'my_items'
# 连接不重复，避免重复爬取
MONGODB_UNIQUE_KEY = 'realLink'

MONGODB_SEPARATE_COLLECTIONS = True
```

### 爬取结果

![20180515152636644617456.png](./使用scrapy和scrapy-splash爬取网易云音乐歌单.assets/20180515152636644617456.png)

共爬取了15万左右的歌单。下面是播放次数最多的五个歌单

```js
/* 1 */
{
    "_id" : ObjectId("5aea7a036d5b76bf8d42659d"),
    "title" : "华语速爆新歌",
    "link" : "/playlist?id=924680166",
    "realLink" : "https://music.163.com/playlist?id=924680166",
    "listenCount" : 152900000,
    "imgUrl" : "http://p1.music.126.net/Zcv4NgK5T0bd1yMzAFp8Iw==/109951163276364917.jpg?param=140y140"
}

/* 2 */
{
    "_id" : ObjectId("5aea78a56d5b76bf8d422179"),
    "title" : "【节奏控】那些超带感的音乐（典藏版）",
    "link" : "/playlist?id=306397077",
    "realLink" : "https://music.163.com/playlist?id=306397077",
    "listenCount" : 140930000,
    "imgUrl" : "http://p1.music.126.net/RnOZHM0BNxXuy-RwQQI5BA==/3313928048221849.jpg?param=140y140"
}

/* 3 */
{
    "_id" : ObjectId("5aea7fd16d5b76bf8d43b0db"),
    "title" : "【旋律控】超级好听的外文歌",
    "link" : "/playlist?id=310970433",
    "realLink" : "https://music.163.com/playlist?id=310970433",
    "listenCount" : 101740000,
    "imgUrl" : "http://p1.music.126.net/2MsstS-M9w5-li0aRy3sUQ==/1380986606815861.jpg?param=140y140"
}

/* 4 */
{
    "_id" : ObjectId("5aea95f76d5b76bf8d46289a"),
    "title" : "那些只听前奏就中毒的英文歌",
    "link" : "/playlist?id=37432514",
    "realLink" : "https://music.163.com/playlist?id=37432514",
    "listenCount" : 95420000,
    "imgUrl" : "http://p1.music.126.net/mQy3lRj6YJ0TW3fM9v85YA==/6643249256145165.jpg?param=140y140"
}

/* 5 */
{
    "_id" : ObjectId("5aea789a6d5b76bf8d42194c"),
    "title" : "【欧美男团】秒杀耳朵系列",
    "link" : "/playlist?id=117377955",
    "realLink" : "https://music.163.com/playlist?id=117377955",
    "listenCount" : 71150000,
    "imgUrl" : "http://p1.music.126.net/FJAxNkFoq3dGiS9tz_bGgQ==/3405187512421439.jpg?param=140y140"
}
```



### github地址

https://github.com/tracerZzz/music163Scrapy

### 参考

[scrapy文档](http://scrapy-chs.readthedocs.io/zh_CN/latest/intro/tutorial.html)

[scrapy-splash文档](http://splash.readthedocs.io/en/latest/)

[scrapy-mongodb](https://github.com/sebdah/scrapy-mongodb)


