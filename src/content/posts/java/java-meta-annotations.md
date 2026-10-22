---
title: java元注解
published: 2016-12-06T11:22:11+08:00
description: java元注解理解
tags:
  - java
draft: false
abbrlink: java-meta-annotations
---

![](./java-meta-annotations.assets/2018031215208216305763.png)
### 元注解（修饰注解的注解）

|注解|说明|参数|
|-------------|-------------|--------|
|@interface|使用 @interface 关键字声明一个注解||
|@Inherited| @Inherited：允许子类继承父类的注解。||
|@Retention|这种类型的注解会被保留到哪个阶段||
|@Documented |注解表明这个注解应该被 javadoc工具记录.||
|@Target|注解的作用目标||

### 元注解源码
#### Target和ElementType枚举
```java
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.ANNOTATION_TYPE)
public @interface Target {
    ElementType[] value();
}

public enum ElementType {
    /** Class, interface (including annotation type), or enum declaration */
    TYPE,
    /** Field declaration (includes enum constants) */
    FIELD,
    /** Method declaration */
    METHOD,
    /** Parameter declaration */
    PARAMETER,
    /** Constructor declaration */
    CONSTRUCTOR,
    /** Local variable declaration */
    LOCAL_VARIABLE,
    /** Annotation type declaration */
    ANNOTATION_TYPE,
    /** Package declaration */
    PACKAGE
}
```
### Retention注解源码和RetentionPolicy枚举
```java
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target(ElementType.ANNOTATION_TYPE)
public @interface Retention {
    RetentionPolicy value();
}

public enum RetentionPolicy {
    /**
     * Annotations are to be discarded by the compiler.
     */
    SOURCE,
    /**
     * Annotations are to be recorded in the class file by the compiler
     * but need not be retained by the VM at run time.  This is the default
     * behavior.
     */
    CLASS,
    /**
     * Annotations are to be recorded in the class file by the compiler and
     * retained by the VM at run time, so they may be read reflectively.
     *
     * @see java.lang.reflect.AnnotatedElement
     */
    RUNTIME
}

```

### 创建一个注解
```java
/** 
 * 下划线转换驼峰注解  
 * @version 2.0 
 */
@Inherited  
@Retention(RetentionPolicy.RUNTIME)  
@Target(ElementType.METHOD)
public @interface ConvertHump {
}

```
### @CallerSensitive
```java
@Retention(RetentionPolicy.RUNTIME)
@Target({ java.lang.annotation.ElementType.METHOD })
public @interface CallerSensitive {
}
```
这个注解是为了堵住漏洞用的。曾经有黑客通过构造双重反射来提升权限，原理是当时反射只检查固定深度的调用者的类，看它有没有特权，例如固定看两层的调用者（getCallerClass(2)）。如果我的类本来没足够权限群访问某些信息，那我就可以通过双重反射去达到目的：反射相关的类是有很高权限的，而在 我->反射1->反射2 这样的调用链上，反射2检查权限时看到的是反射1的类，这就被欺骗了，导致安全漏洞。使用CallerSensitive后，getCallerClass不再用固定深度去寻找actual caller（“我”），而是把所有跟反射相关的接口方法都标注上CallerSensitive，搜索时凡看到该注解都直接跳过，这样就有效解决了前面举例的问题

​	