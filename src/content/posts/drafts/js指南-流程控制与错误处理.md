---
title: js指南-流程控制与错误处理
published: 2019-01-01T00:00:00+08:00
description: javascript 变量、常量的声明，作用域，变量提升，数据结构和类型，数据类型的转换(parseInt(),parseFloat(),inNaN())，以及字面量
tags:
  - js
draft: true
slug: js-guide-control-flow
---

### 语句块（Block Statement）
>在ECMAScript 6标准之前，Javascript没有块作用域。

```javascript
var x = 1;
{
  var x = 2;
}
alert(x); // 输出的结果为 2,这是因为块级作用域中的 var x变量声明与之前的声明在同一个作用域内
```
>在ECMAScript 6标准之后，可以使用let定义块作用域变量

```javascript
let x = 1;
{
    let x = 2;
    console.log(x);  //输出的结果为 2
}
console.log(x); // 输出的结果为 1
```

### __False 等效值__

>下面这些值将被计算出 false (also known as Falsy values):

 - false
 - undefined
 - null
 - __0__
 - NaN
 - 空字符串 ("")
当传递给条件语句时，所有其他值，包括所有对象会被计算为 true 。

这里需要留意，当在对js对象进行条件判断时，需要注意对象是否是以上中的一个；例如
```javascript
var flag;
flag=0;
if(flag){
    console.log("flag 存在");
}
//在此，代码本意为如果flag已经被赋值，则执行打印，实际情况为flag为0，
//js将0等效为false，此时代码将不会达到预想结果
```

### 循环语句（Loop Statement）
#### for...in
for...in __循环只遍历可枚举属性__。像 Array 和 Object 使用内置构造函数所创建的对象都会继承自 Object.prototype 和 String.prototype 的不可枚举属性，例如 String 的 indexOf()  方法或者 Object 的 toString 方法。循环将迭代对象的所有可枚举属性和从它的构造函数的 prototype 继承而来的（包括被覆盖的内建属性）。

>给数组对象添加可枚举属性(Array添加remove方法)

```javascript
//定义array的remove方法
Array.prototype.remove = function() {
    var what, a = arguments, L = a.length, ax;
    while (L && this.length) {
        what = a[--L];
        while ((ax = this.indexOf(what)) !== -1) {
            this.splice(ax, 1);
        }
    }
    return this;
};

var a=[1,2,3];
for(var i in a){
    console.log(i);
}
//打印结果
//0
//1
//2
//remove
```

>这里你会发现，循环结果多出一个remove来，for in 遍历了所有的可枚举类型，可以使用下面的代码，将remove方法指定为不可枚举

```javascript
    Object.defineProperty(Array.prototype, 'remove', {
        enumerable: false, //设置为不可枚举
        value: function(s) {
            for (var i = 0; i < this.length; i++) {
                if (s == this[i])
                    this.splice(i, 1);
            }
        }
    });
    var a=[1,2,3];
    for(var i in a){
        console.log(i);
    }
    //打印结果
    //0
    //1
    //2
```

>另外，for...in 并不能够保证返回的是按一定顺序的索引，因此当迭代那些访问次序重要的 arrays 时用整数索引去进行 for 循环 (或者使用 Array.prototype.forEach() 或 for...of 循环) 。

### for...of

>for...of语句在可迭代对象(包括 Array, Map, Set, String, TypedArray，arguments 对象等等)上创建一个迭代循环，对每个不同属性的属性值,调用一个自定义的有执行语句的迭代挂钩.
>//遍历 Array:

```javascript

let iterable = [10, 20, 30];

for (let value of iterable) {
  console.log(value);
}
// 10
// 20
// 30


//如果你不修改语句块中的变量 , 也可以使用 const 代替 let .

let iterable = [10, 20, 30];

for (const value of iterable) {
  console.log(value);
}
// 10
// 20
// 30
```

>遍历 String:

```javascript
let iterable = "boo";

for (let value of iterable) {
  console.log(value);
}
// "b"
// "o"
// "o"
```

>遍历Map:

```javascript
let iterable = new Map([["a", 1], ["b", 2], ["c", 3]]);

for (let entry of iterable) {
  console.log(entry);
}
// [a, 1]
// [b, 2]
// [c, 3]

for (let [key, value] of iterable) { //解构赋值
  console.log(value);
}
// 1
// 2
// 3
```

>遍历 Set:

```javascript
let iterable = new Set([1, 1, 2, 2, 3, 3]);

for (let value of iterable) {
  console.log(value);
}
// 1
// 2
// 3
```

>遍历生成器

```javascript
// 注意: Firefox目前还不支持 "function*".
// 删除该*号可以让下面的代码在Firefox 13中正常运行.
 
function* fibonacci() { // 一个生成器函数
    let [prev, curr] = [0, 1];
    for (;;) {
        [prev, curr] = [curr, prev + curr];
        yield curr;
    }
}
 
for (let n of fibonacci()) {
    // 当n大于1000时跳出循环
    if (n > 1000)
        break;
    console.log(n);
}
```

>遍历另外的可遍历对象

```javascript
var iterable = {
  [Symbol.iterator]() {
    return {
      i: 0,
      next() {
        if (this.i < 3) {
          return { value: this.i++, done: false };
        }
        return { value: undefined, done: true };
      }
    };
  }
};

for (var value of iterable) {
  console.log(value);
}
// 0
// 1
// 2
```

### for...of与for...in的区别
 - for...in循环会遍历一个object所有的可枚举属性。

 - for...of语法是为各种collection对象专门定制的，并不适用于所有的object.它会以这种方式迭代出任何拥有[Symbol.iterator] 属性的collection对象的每个元素。
 - for...in 遍历每一个属性名称,而 for...of遍历每一个属性值

### 异常处理
>try catch finally  执行顺序

```javascript
function f() {
  try {
    console.log(0);
    throw "bogus";
  } catch(e) {
    console.log(1);
    return true; // this return statement is suspended
                 // until finally block has completed
    console.log(2); // not reachable
  } finally {
    console.log(3);
    return false; // overwrites the previous "return"
    console.log(4); // not reachable
  }
  // "return false" is executed now  
  console.log(5); // not reachable
}
f(); // console 0, 1, 3; returns false
```
