---
title: 运力信息审核页面实现
published: 2019-01-01T00:00:00+08:00
description: 运力信息审核页面实现页面的实现思路，具体细节，以及问题总结；
tags:
  - js
draft: true
abbrlink: capacity-info-review-page
---

#### 总结
 - checkbox添加到grid
```javascript
    selModel : {
        selType : 'checkboxmodel',
        showHeaderCheckbox : true,
        allowDeselect: true,
        checkOnly : true,
        injectCheckbox: 0,
        mode: "SIMPLE",     //"SINGLE"/"SIMPLE"/"MULTI"
    },
```
 - item点击事件不选取checkbox
```javascript
'itemclick' : function (panel, record , item,a,e){
 var el = e.getTarget().className.trim();
    var f = el=='x-grid-cell-inner'?true:false;
    if(f){
        //点击事件
        $pageObj.regionCode=record.data.regionCode;
        get('palformInfoGrid1').getStore().loadPage(1);
    }

 }
},
```
 - column获取缓存里的数据类型
```javascript
renderer:function(value){
                            return getBaseDataText(value, 'OTHER_INFORMATION_STATUS');
                        }
```
 - 获取缓存中的数据对象(其中OTHER_INFORMATION_STATUS为枚举名称)
```javascript
if(top.CacheManager.data.OTHER_INFORMATION_STATUS){
    for(let i of top.CacheManager.data.OTHER_INFORMATION_STATUS){

    params.statuses.push(i.id)
    }
}
```