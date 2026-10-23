---
title: js指南-语法和数据类型
published: 2019-01-01T00:00:00+08:00
description: javascript 变量、常量的声明，作用域，变量提升，数据结构和类型，数据类型的转换(parseInt(),parseFloat(),inNaN())，以及字面量
tags:
  - js
draft: true
slug: js-guide-grammar-types
---

### 变量声明
>var
声明一个变量，可选择将其初始化为一个值。
let
声明一个__块作用域__的局部变量(block scope local variable)，可选择将其初始化为一个值

### 常量声明
>const
你可以用关键字 const 创建一个只读(read-only)的常量。
__然而,对象属性是不受保护的,所以可以使用如下语句来执行。__

```javascript
const MY_OBJECT = {"key": "value"};
MY_OBJECT.key = "otherValue";
```

### 作用域
在所有函数之外声明的变量，叫做__全局变量__，因为它可被当前文档中的任何其他代码所访问。在函数内部声明的变量，叫做__局部变量__，因为它只能在该函数内部访问。

全局变量示例：

```javascript
if (true) {
  var x = 5;
}
console.log(x); // 5
```

如果使用 ECMAScript 6 中的 let 声明，上述行为将发生变化

```javascript
if (true) {
  let y = 5;
}
console.log(y); // ReferenceError: y is not defined
```

### 变量提升（hositing）
>js可以引用稍后声明的变量而不会引发异常。这一概念称为变量声明提升(hoisting)

__特性：__
 - JavaScript 变量感觉上是被“提升”或移到了所有函数和语句之前。
 - 然而提升后的变量将返回 undefined 值。所以在使用或引用某个变量之后进行声明和初始化操作，这个被提升的引用仍将得到 undefined 值。

```javascript
var myvar = "my value";
console.log(myvar);

(function() {
    console.log(myvar); // undefined
    var myvar = "local value";
})();
```

打印结果;
```javascript
my value
undefined
```

### 函数提升（Function hoisting）
只有函数声明会被提升到顶部，而不包括函数表达式
```javascript
/* 函数声明 */

foo(); // "bar"

function foo() {
  console.log("bar");
}


/* 函数表达式   表达式定义的函数，称为匿名函数。匿名函数没有函数提升。*/

baz(); // TypeError: baz is not a function
//此时的"baz"相当于一个声明的变量，类型为undefined。或者可以理解为变量提升
//由于baz只是相当于一个变量，因此浏览器认为"baz()"不是一个函数。
var baz = function() {
  console.log("bar2");
};
```
### __数据结构和类型__

**JavaScript语言可以识别下面 7 种不同类型的值：**

 - 六种 原型 数据类型:
    - Boolean.  布尔值，true 和 false.
    - null. 一个表明 null 值的特殊关键字。 JavaScript 是大小写敏感的，因此 null 与 Null、NULL或其他变量完全不同。
    - undefined.  变量未定义时的属性。
    - Number.  表示数字，例如： 42 或者 3.14159。
    - String.  表示字符串，例如："Howdy"
    - Symbol ( 在 ECMAScript 6 中新添加的类型).。一种数据类型，它的实例是唯一且不可改变的。
 - 以及 Object 对象

### 数据类型的转换(Data type conversion)
>字符串转换为数字(converting strings to numbers)

 - __parseInt()和parseFloat()__
 parseInt(string, radix); radix:进制，如十进制 radix传10
 parseFloat(string)
 如果参数字符串的第一个字符不能被解析成为数字,则返回NaN
 __isNaN__
 调用isNaN函数来判断parseFloat/parseInt的返回结果是否是NaN
 ```javascript
 //示例
 isNaN(NaN);       // true
 isNaN(undefined); // true
 isNaN({});        // true

 isNaN(true);      // false
 isNaN(null);      // false
 isNaN(37);        // false

 // strings
 isNaN("37");      // false: 可以被转换成数值37
 isNaN("37.37");   // false: 可以被转换成数值37.37
 isNaN("");        // false: 空字符串被转换成0
 isNaN(" ");       // false: 包含空格的字符串被转换成0

 // dates
 isNaN(new Date());                // false
 isNaN(new Date().toString());     // true

 isNaN("blabla")   // true: "blabla"不能转换成数值
 ```
 - __单目加法运算符__
```javascript
"1.1" + "1.1" = "1.11.1"
(+"1.1") + (+"1.1") = 2.2   // 注：加入括号为清楚起见，不是必需的。
```

### 字面量
#### 数组字面量 (Array literals)
```javascript
//长度为3
var fish = ["Lion", , "Angel"];
//长度为4，myList[0]==undefined(没被赋值，因而是undefined)
var myList = [ , 'home', , 'school'];

```
#### 对象字面量 (Object literals)
对象属性名字可以是任意字符串，包括空串。如果对象属性名字不是合法的javascript标识符，它必须用""包裹。属性的名字不合法，那么便不能用.访问属性值，而是通过类数组标记("[]")访问和赋值。
```javascript
var unusualPropertyNames = {
  "": "An empty string",
  "!": "Bang!"
}
console.log(unusualPropertyNames."");   // 语法错误: Unexpected string
console.log(unusualPropertyNames[""]);  // An empty string
console.log(unusualPropertyNames.!);    // 语法错误: Unexpected token !
console.log(unusualPropertyNames["!"]); // Bang!
//特殊的key应该用不同的方式访问属性
var foo = {a: "alpha", 2: "two"};
console.log(foo.a);    // alpha
console.log(foo[2]);   // two
//console.log(foo.2);  // Error: missing ) after argument list
//console.log(foo[a]); // Error: a is not defined
console.log(foo["a"]); // alpha
console.log(foo["2"]); // two

```

### RegExp 字面值
一个正则表达式是字符被斜线（译注：正斜杠“/”）围成的表达式。下面是一个正则表达式文字的一个例子。
```javascript
var re = /ab+c/;
```
### 字符串字面量 (String literals)
JavaScript 字符转译

    \0  Null字节
    \b  退格符
    \f  换页符
    \n  换行符
    \r  回车符
    \t  Tab (制表符)
    \v  垂直制表符
    \'  单引号
    \"  双引号
    \\  反斜杠字符（\）
    \XXX    由从0到377最多三位八进制数XXX表示的 Latin-1 字符。例如，\251是版权符号的八进制序列。
    \xXX    由从00和FF的两位十六进制数字XX表示的Latin-1字符。例如，\ xA9是版权符号的十六进制序列。
    \uXXXX  由四位十六进制数字XXXX表示的Unicode字符。例如，\ u00A9是版权符号的Unicode序列。见Unicode escape sequences (Unicode 转义字符).
    \u{XXXXX}   Unicode代码点 (code point) 转义字符。例如，\u{2F804} 相当于Unicode转义字符 \uD87E\uDC04的简写。