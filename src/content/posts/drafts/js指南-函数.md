---
title: js指南-函数
published: 2019-01-01T00:00:00+08:00
description: javascript 函数 argumnets,箭头函数，默认参数
tags:
  - js
draft: true
slug: js-guide-functions
---

### 使用arguments对象
例：设想有一个用来连接字符串的函数。唯一事先确定的参数是在连接后的字符串中用来分隔各个连接部分的字符（译注：比如例子里的分号“；”）。该函数定义如下：
```javascript
function myConcat(separator) {
   var result = "", // initialize list
       i;
   // iterate through arguments
   for (i = 1; i < arguments.length; i++) {
      result += arguments[i] + separator;
   }
   return result;
}

// returns "red, orange, blue, "
myConcat(", ", "red", "orange", "blue");

```

注意： arguments 变量只是 ”类数组对象“，并不是一个数组。称其为类数组对象是说它有一个索引编号和Length属性。尽管如此，它并不拥有全部的Array对象的操作方法。

### 函数参数(Function parameter)
#### 默认参数
>从ECMAScript 6开始，有两个新的类型的参数：默认参数(default parameters)，剩余参数(rest parameters)。

在JavaScript中，函数参数的默认值是undefined。
在过去，用于设定默认的一般策略是在函数的主体测试参数值是否为undefined，如果是则赋予一个值。
```javascript
function multiply(a, b) {
  b = typeof b !== 'undefined' ?  b : 1;

  return a*b;
}

multiply(5); // 5
```

使用默认参数，在函数体的检查就不再需要了。
```javascript
function multiply(a, b = 1) {
  return a*b;
}

multiply(5); // 5
```

#### 剩余参数(rest parameters)

剩余参数语法允许将不确定数量的参数表示为数组。
```javascript
function multiply(multiplier, ...theArgs) {
  return theArgs.map(x => multiplier * x);
}

var arr = multiply(2, 1, 2, 3);
console.log(arr); // [2, 4, 6]
```

### 箭头函数(Arrow functions)
箭头函数表达式的语法比函数表达式短，并且不绑定自己的 this，arguments，super或 new.target。此外，箭头函数总是匿名的。这些函数表达式最适合非方法函数，它们不能用作构造函数。

#### 基础语法
```javascript
(param1, param2, …, paramN) => { statements }
(param1, param2, …, paramN) => expression
         // equivalent to:  => { return expression; }

// 如果只有一个参数，圆括号是可选的:
(singleParam) => { statements }
singleParam => { statements }

// 无参数的函数需要使用圆括号:
() => { statements }
```

#### 高级语法

```javascript
// 返回对象字面量时应当用圆括号将其包起来:
params => ({foo: bar})

// 支持 Rest parameters 和 default parameters:
(param1, param2, ...rest) => { statements }
(param1 = defaultValue1, param2, …, paramN = defaultValueN) => { statements }

// Destructuring within the parameter list is also supported
var f = ([a, b] = [1, 2], {x: c} = {x: a + b}) => a + b + c;
f();  // 6
```