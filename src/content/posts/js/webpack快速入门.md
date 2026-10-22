---
title: webpack快速入门
published: 2018-03-08T14:16:07+08:00
description: webpack已经成为前端工程构建的重要工具，这篇文章将主要总结webpack相关的概念，基本配置，以及经常用的几个插件，使你能够快速上手构建自己的webpack工程化项目；
tags:
  - webpack
draft: false
abbrlink: webpack-quick-start
---

### webpack介绍

截止目前，webpack已经更新到4.0版本，最新版本已经到了v4.1.1(2018-3-8)；这篇文章关于webpack的所有介绍，将基于webpack 的 v4.1.1版本。详细介绍请参考[中文文档](https://doc.webpack-china.org/concepts/)以及[官方文档](https://webpack.js.org/concepts/)

在详细介绍具体的配置项之前，在这里先说下webpack到底是个什么东西，在我们的项目中究竟发挥着什么作用，以及可以为我们带来什么样的方便。

***webpack* 是一个现代 JavaScript 应用程序的*静态模块打包器(module bundler)*。当 webpack 处理应用程序时，它会递归地构建一个*依赖关系图(dependency graph)*，其中包含应用程序需要的每个模块，然后将所有这些模块打包成一个或多个 *bundle*。**

![](./webpack快速入门.assets/20180308152048985612690.png)

说白了，webpack就是一个项目打包工具，他可以将不同的文件通通打入一个或者多个文件。在这个工程中，webpack可以依赖各种loader对不同类型的的文件，进行进一步的操作。比如webpack依赖babel loader对js文件进行es6 es7转码，让你在使用es6 es7新语法的同时还可以将代码运行在比较古老的浏览器中。他还可以利用不同的plugin进行更多操作，比如利用**webpack.optimize.UglifyJsPlugin**去除代码中的空格，将文件最小化。等等，webpack可以干的事情非常的多，他在前端项目工程化中已经在扮演着一个大管家的作用。

------



### 概念

webpack是高度可配置的，而配置的项目也不是随意的，webpack中有**四个核心概念**

- 入口(entry)
- 输出(output)
- loader
- 插件(plugins)

整个webpack将围绕这四个主要的概念进行配置。

#### 入口(Entry)

**`entry` 对象是用于 webpack 查找启动并构建 bundle**。这句话可以理解为入口文件就是我们需要打包的文件，入口文件可以是一个也可以是多个。多个入口文件可以应对多页面应用或者用于抽取公共代码或者公用第三方代码库，用于加快首屏加载速度，模块化代码等。

#### 输出(Output)

`output` 位于对象最顶级键(key)，包括了一组选项，指示 webpack 如何去输出、以及在哪里输出你的「bundle、asset 和其他你所打包或使用 webpack 载入的任何内容」。

#### Loader

loader 用于对模块的源代码进行转换。loader 可以使你在 `import` 或"加载"模块时预处理文件。

##### 示例

```Shell
npm install --save-dev css-loader
npm install --save-dev ts-loader
```

然后指示 webpack 对每个 `.css` 使用 [`css-loader`](https://doc.webpack-china.org/loaders/css-loader)，以及对所有 `.ts` 文件使用 [`ts-loader`](https://github.com/TypeStrong/ts-loader)：

```Js
module.exports = {
  module: {
    rules: [
      { test: /\.css$/, use: 'css-loader' },
      { test: /\.ts$/, use: 'ts-loader' }
    ]
  }
};
```

##### 常用到的loader(vue开发)

- vue-loader 		
- babel-loader 
- url-loader
- css-loader
- less-loader


#### 插件(Plugins)

插件是 wepback 的[支柱](https://github.com/webpack/tapable)功能。插件在开发环境和生产环境为我们提供了非常多的便利，HtmlWebpackPlugin让我们将js和css文件打包到指定的html文件中，等等，下面列出几个常用的插件。

-  CopyWebpackPlugin //复制文件到打包后的指定目录
-  DefinePlugin //全局库
-  CommonsChunkPlugin //重复代码抽取为公共部分 插件
-  ProvidePlugin //全局变量定义
-  HotModuleReplacementPlugin 代码热替换
-  UglifyJsPlugin 代码丑化


### 其他配置

#### resolve.alias(别名)

resolve里面有一个alias的配置项目，能够让开发者指定一些模块的引用路径。对一些经常要被import或者require的库

```Js
resolve: {
    alias: {
      'vue$': 'vue/dist/vue.esm.js',
      '@': resolve('src'),
    }
```

在引入模块的时候可以这样写

```Js
import Chart from '@/components/Charts/keyboard'
```

#### dev-tool

 [source mapping](http://blog.teamtreehouse.com/introduction-source-maps)用于压缩代码中的错误定位。将压缩后的代码与source code之间匹配一个索引，当压缩代码某处出错时，精确到索引到源代码中的指定行。
### iview-admin中的webpack

项目目录结构如下

![20180309152056457218097.png](./webpack快速入门.assets/20180309152056457218097.png)

项目中webpack配置包含在build目录下，共三个，分别为base，dev，product，代表了基本配置，开发环境配置，生产环境配置。dev和product两个文件都使用了merge方法来将base中基础配置和自己的配置进行合并，这里依赖`webpack-merge`

#### base配置

```Js
const path = require('path');
const os = require('os');
const webpack = require('webpack');
const ExtractTextPlugin = require('extract-text-webpack-plugin');
const HappyPack = require('happypack');
var happyThreadPool = HappyPack.ThreadPool({
  size: os.cpus().length
});

function resolve(dir) {
  return path.join(__dirname, dir);
}

module.exports = {
  entry: {
    main: '@/main',
    'vender-base': '@/vendors/vendors.base.js',
    'vender-exten': '@/vendors/vendors.exten.js'
  },
  output: {
    path: path.resolve(__dirname, '../dist/dist')
  },
  module: {
    rules: [{
        test: /\.vue$/,
        loader: 'vue-loader',
        options: {
          loaders: {
            less: ExtractTextPlugin.extract({
              use: ['css-loader?minimize', 'autoprefixer-loader', 'less-loader'],
              fallback: 'vue-style-loader'
            }),
            css: ExtractTextPlugin.extract({
              use: ['css-loader', 'autoprefixer-loader'],
              fallback: 'vue-style-loader'
            })
          }
        }
      },
      {
        test: /iview\/.*?js$/,
        loader: 'babel-loader'
      },
      {
        test: /\.js$/,
        loader: 'babel-loader',
        exclude: /node_modules/
      },
      {
        test: /\.js[x]?$/,
        include: [resolve('src')],
        exclude: /node_modules/,
        loader: 'happypack/loader?id=happybabel'
      },
      {
        test: /\.css$/,
        use: ExtractTextPlugin.extract({
          use: ['css-loader?minimize', 'autoprefixer-loader'],
          fallback: 'style-loader'
        })
      },
      {
        test: /\.less$/,
        use: ExtractTextPlugin.extract({
          use: ['css-hot-loader', 'autoprefixer-loader', 'less-loader'],
          fallback: 'style-loader'
        }),
      },

      {
        test: /\.(gif|jpg|png|woff|svg|eot|ttf)\??.*$/,
        loader: 'url-loader?limit=1024'
      },
      {
        test: /jquery-mousewheel/,
        loader: "imports-loader?define=>false&this=>window"
      },
      {
        test: /malihu-custom-scrollbar-plugin/,
        loader: "imports-loader?define=>false&this=>window"
      },
      {
        test: /\.(html|tpl)$/,
        loader: 'html-loader'
      }
    ]
  },
  plugins: [
    new HappyPack({
      id: 'happybabel',
      loaders: ['babel-loader'],
      threadPool: happyThreadPool,
      cache: true,
      verbose: true
    }),
    //全局库
    new webpack.ProvidePlugin({
      $: 'jquery',
      jQuery: 'jquery',
      "window.jQuery": "jquery",
      //_: "lodash",
    }),

  ],
  resolve: {
    extensions: ['.js', '.vue'],
    alias: {
      'vue': 'vue/dist/vue.esm.js',
      '@': resolve('../src'),
      'node_modules': resolve('../node_modules'),
      webworkify: 'webworkify-webpack-dropin'
    }
  }
};
```

#### product配置

```Js
  new cleanWebpackPlugin(['dist/*'], {
            root: path.resolve(__dirname, '../')
        }),
        new ExtractTextPlugin({
            filename: '[name].[hash].css',
            allChunks: true
        }),
        new webpack.optimize.CommonsChunkPlugin({
            // name: 'vendors',
            // filename: 'vendors.[hash].js'
            name: ['vender-exten', 'vender-base'],
            minChunks: Infinity
        }),
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: '"production"'
            }
        }),
        new webpack.optimize.cleanWebpackPlugin({
            compress: {
                warnings: false
            }
        }),	
```

生产环境每次打包都需要将之前生成的文件清除，这里使用了cleanWebpackPlugin插件。另外在生产环境中要将代码尽量压缩到最小化，这里使用了cleanWebpackPlugin插件。

> 另外：如果项目使用nginx部署，还可以使用nginx进行压缩