---
title: 深入理解javaScript笔记-编写高质量JavaScript代码的基本要点
published: 2018-01-17T13:54:11+08:00
description: 如何编写高质量的js代码，这篇文章记录了js编码过程中常见的一些问题，包括变量提升，变量命名，函数闭包等。遵从这些优秀的编程规则，有利于使我们的代码，更好维护，更优雅，避免未知的错误发生。
tags:
  - js
draft: true
category: JavaScript
slug: high-quality-javascript-basics
---

### 最小全局变量(Minimizing Globals)

**JavaScript通过函数管理作用域。在函数内部声明的变量只在这个函数内部，函数外面不可用。**

浏览器中的全局变量:this相当于window

```javascript
this.h="hello"
//"hello"
window.h
//"hello"
```

### 全局变量的问题

全局变量的问题在于，你的JavaScript应用程序和web页面上的所有代码都共享了这些全局变量，他们住在同一个全局命名空间，所以当程序的两个不同部分定义同名但不同作用的全局变量的时候，命名冲突在所难免。

#### 反例一：不声明的任何变量都会成为一个全局对象属性



```js
//隐式创建全局变量反例1
function sum(x, y) {
   // 不推荐写法: 隐式全局变量
   result = x + y;
   return result;
}
undefined
sum(1,1)
2
window.result
2
```

此段代码中的`result`没有声明。代码照样运作正常，但在调用函数后你最后的结果就是多一个全局变量result。

经验法则是始终使用var声明变量

```js
function sum(x, y) {
   var result = x + y;
   return result;
}
```

#### 反例二：使用任务链进行部分var声明

另一个创建隐式全局变量的反例就是使用任务链进行部分var声明。下面的片段中，`a`是本地变量但是`b`确实全局变量，这可能不是你希望发生的：

```js
function foo() {
   var a = b = 0;
   // ...
}
foo()
undefined //执行foo()返回undefined
window.b //发现b其实为全局变量，倒霉
0
```

> 此现象发生的原因在于这个从右到左的赋值，首先，是赋值表达式`b = 0`，此情况下b是未声明的。这个表达式的返回值是0，然后这个0就分配给了通过var定义的这个局部变量a。类似于`var a = (b = 0);`

**先准备好声明变量，再使用链分配是比较好的做法**

```js
function foo() {
   var a, b;
   // ... a = b = 0; // 两个均局部变量
}
```

### 忘记var的副作用(Side Effects When Forgetting var)

- 通过var创建的全局变量（任何函数之外的程序中创建）是不能被删除的。
- 无var创建的隐式全局变量（无视是否在函数中创建）是能被删除的。

隐式全局变量和明确定义的全局变量间有些小的差异，就是通过`delete`操作符让变量未定义的能力

**这表明，在技术上，隐式全局变量并不是真正的全局变量，但它们是全局对象的属性。属性是可以通过`delete`操作符删除的，而变量是不能的：**

```js
// 定义三个全局变量
var global_var = 1;
global_novar = 2; // 反面教材
(function () {
   global_fromfunc = 3; // 反面教材
}());

// 试图删除
delete global_var; // false
delete global_novar; // true
delete global_fromfunc; // true

// 测试该删除
typeof global_var; // "number"
typeof global_novar; // "global_nar is not defined"
typeof global_fromfunc; // "global_fromfunc is not defined"
```

### 单var形式（Single var Pattern）

在函数顶部使用单var语句是比较有用的一种形式，其好处在于：

- 提供了一个单一的地方去寻找功能所需要的所有局部变量
- 防止变量在定义之前使用的逻辑错误
- 帮助你记住声明的全局变量，因此较少了全局变量//zxx:此处我自己是有点晕乎的…
- 少代码（类型啊传值啊单线完成）

单var形式长得就像下面这个样子：

```js
function func() {
   var a = 1,
       b = 2,
       sum = a + b,
       myobject = {},
       i,
       j;
   // function body...
}
```



### 变量提升（Hoisting）

```js
myname = "global"; // 全局变量,不建议这么写，应该写成 var name = "global"
function func() {
    alert(myname); // "undefined"
    var myname = "local";
    alert(myname); // "local"
}
func();
//alert: undefined
//alert: local
```

上边的代码可以拆分了来理解

```js
myname = "global"; // 全局变量,不建议这么写，应该写成 var name = "global"
function func() {
    var myname=undefined
    alert(myname); // "undefined"
    myname = "local";
    alert(myname); // "local"
}
func();
```

myname变量的声明得到了提升，而在声明的时候是没有被赋值的。在这里还要注意到全局变量和函数内的变量同名，由于js的作用域机制，首先在函数内部找寻找变量，如果没有找到，再去上级（作用域）去找。这里直接找到了，也就不会出现弹出框里显示global的情况。

### for循环(for Loops)

在`for`循环中，你可以循环取得数组或是数组类似对象的值，譬如`arguments`和`HTMLCollection`对象。

`HTMLCollections`指的是DOM方法返回的对象，例如：

```js
document.getElementsByName()
document.getElementsByClassName()
document.getElementsByTagName()
document.images: 页面上所有的图片元素
document.links : 所有a标签元素
document.forms : 所有表单
document.forms[0].elements : 页面上第一个表单中的所有域
```

通常的循环形式如下：

```js
// 次佳的循环
for (var i = 0; i < myarray.length; i++) {
   // 使用myarray[i]做点什么
}
```

**这种形式的循环的不足在于每次循环的时候数组的长度都要去获取下。这回降低你的代码，尤其当`myarray`不是数组，而是一个`HTMLCollection`对象的时候。**而DOM操作一般都是比较昂贵的。

这就是为什么当你循环获取值时，缓存数组(或集合)的长度是比较好的形式，正如下面代码显示的：

```js
for (var i = 0, max = myarray.length; i < max; i++) {
   // 使用myarray[i]做点什么
}
```

### for-in循环(for-in Loops)

**`for-in`循环应该用在非数组对象的遍历上，使用`for-in`进行循环也被称为“枚举”。**

从技术上将，你可以使用`for-in`循环数组（因为JavaScript中数组也是对象），但这是不推荐的。因为如果数组对象已被自定义的功能增强，就可能发生逻辑错误。另外，在for-in中，属性列表的顺序（序列）是不能保证的。所以最好数组使用正常的for循环，对象使用for-in循环。

### （不）扩展内置原型((Not) Augmenting Built-in Prototypes)

扩增构造函数的prototype属性是个很强大的增加功能的方法，但有时候它太强大了

增加内置的构造函数原型（如Object(), Array(), 或Function()）挺诱人的，但是这严重降低了可维护性，因为它让你的代码变得难以预测。使用你代码的其他开发人员很可能更期望使用内置的 JavaScript方法来持续不断地工作，而不是你另加的方法。

另外，属性添加到原型中，可能会导致不使用hasOwnProperty属性时在循环中显示出来，这会造成混乱。

因此，不增加内置原型是最好的。你可以指定一个规则，仅当下面的条件均满足时例外：

- 可以预期将来的ECMAScript版本或是JavaScript实现将一直将此功能当作内置方法来实现。例如，你可以添加ECMAScript 5中描述的方法，一直到各个浏览器都迎头赶上。这种情况下，你只是提前定义了有用的方法。

- 如果您检查您的自定义属性或方法已不存在——也许已经在代码的其他地方实现或已经是你支持的浏览器JavaScript引擎部分。

- 你清楚地文档记录并和团队交流了变化。


如果这三个条件得到满足，你可以给原型进行自定义的添加，形式如下：

```js
if (typeof Object.protoype.myMethod !== "function") {
   Object.protoype.myMethod = function () {
      // 实现...
   };
}
```

### switch模式(switch Pattern)

```js
var inspect_me = 0,
    result = '';
switch (inspect_me) {
case 0:
   result = "zero";
   break;
case 1:
   result = "one";
   break;
default:
   result = "unknown";
}
```

这个简单的例子中所遵循的风格约定如下：

- 每个case和switch对齐（花括号缩进规则除外）
- 每个case中代码缩进
- **每个case以break清除结束**
- **避免贯穿（故意忽略break）。如果你非常确信贯穿是最好的方法，务必记录此情况，因为对于有些阅读人而言，它们可能看起来是错误的。**
- **以default结束switch：确保总有健全的结果，即使无情况匹配。**

### 避免隐式类型转换(Avoiding Implied Typecasting )

JavaScript的变量在比较的时候会隐式类型转换。这就是为什么一些诸如：false == 0 或 “” == 0 返回的结果是true。为避免引起混乱的隐含类型转换，在你比较值和表达式类型的时候始终使用===和!==操作符。

```js
var zero = 0;
if (zero === false) {
   // 不执行，因为zero为0, 而不是false
}

// 反面示例
if (zero == false) {
   // 执行了...
}
```

### parseInt()下的数值转换(Number Conversions with parseInt())

使用parseInt()进行转换时，加上第二个参数，即标明转换进制。

### 分隔单词(Separating Words)

当你的变量或是函数名有多个单词的时候，最好单词的分离遵循统一的规范，有一个常见的做法被称作“驼峰(Camel)命名法”，就是单词小写，每个单词的首字母大写。

对于构造函数，可以使用大驼峰式命名法(upper camel case)，如`MyConstructor()`。对于函数和方法名称，你可以使用小驼峰式命名法(lower camel case)，像是`myFunction(), calculateArea()`和`getFirstName()`。

开发者通常使用小驼峰式命名法，但还有另外一种做法就是所有单词小写以下划线连接：例如，`first_name, favorite_bands, `和`old_company_name`，这种标记法帮你直观地区分函数和其他标识——原型和对象。



参考连接：http://www.cnblogs.com/TomXu/archive/2011/12/28/2286877.html