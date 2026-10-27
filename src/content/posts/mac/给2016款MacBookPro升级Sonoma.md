---
title: 给 2016 款 MacBook Pro 装上 macOS Sonoma：OpenCore Legacy Patcher 实录
published: 2026-10-27T01:30:00+08:00
updated: 2026-10-27T23:30:00+08:00
description: 家里有一台 2016 款 15 英寸 MacBook Pro，官方最高只能升到 macOS 12，装不了要求 macOS 13 以上的新软件。用 OpenCore Legacy Patcher 把它升到了 Sonoma 14，这篇记录选版本的考虑、安装步骤，以及装完后遇到的屏幕闪烁、Wi-Fi 消失、指纹失效、iCloud 退不出去、睡眠唤醒死机这些坑。
tags:
  - macOS
  - OpenCore
  - Mac
category: 工具
draft: false
slug: oclp-sonoma-2016-macbook-pro
---

> 2026-10-27 晚更新：用了一天后发现一睡眠就再也唤醒不了，补上了[睡眠唤醒死机](#睡眠后唤醒就死机)的排查过程和最终设置。

家里有一台 2016 款 15 英寸 MacBook Pro（i7 四核、16GB 内存），一直停在 macOS 12 Monterey。这是苹果给它的最后一个版本，"软件更新"里不会再出现新系统。

平时用着没什么问题，直到想装一个桌面应用，发现它要求 macOS 13 以上。越来越多的新软件都是这个要求，这台机器眼看就要被软件淘汰了。于是用 **OpenCore Legacy Patcher**（简称 OCLP）把它升到了 macOS 14 Sonoma。

这篇记录整个过程，包括中间踩到的坑。

## 一、OCLP 是什么

OCLP 是社区维护的开源工具，专门让苹果已经不支持的老 Mac 装上新系统。它做两件事：

- **开机引导**：在硬盘的 EFI 分区装一个 OpenCore 引导器。每次开机先经过它，它让新系统"认为"这台机器是受支持的型号。
- **补驱动**：新系统删掉了老硬件的驱动（显卡、无线网卡等），OCLP 装完系统后再把这些驱动补回去，叫 **Root Patch**。

这台 2016 款 15 英寸（型号 `MacBookPro13,3`）在 OCLP 的支持列表里。

## 二、选哪个版本

**OCLP 版本：2.5.1。**下载时 Releases 页面最新的已经是 3.x，但都标着 Pre-release（预发布）。3.x 主要是为了支持 macOS 26 Tahoe，还在完善中，所以选了 2.x 里最新的正式版 2.5.1。

注意：从 2.3.0 开始，官方不再提供 `OpenCore-Patcher-GUI.app.zip`，要下载的是 **`OpenCore-Patcher.pkg`**，双击安装后在"应用程序"里打开。

**macOS 版本：14 Sonoma。**

| 版本 | 考虑 |
| --- | --- |
| 13 Ventura | 能满足"13 以上"的要求，但没有理由不再往上一版 |
| **14 Sonoma** | 在老机型上用 OCLP 安装的人多，补丁成熟，选它 |
| 15 Sequoia | OCLP 2.x 的发布说明里一直写着"支持仍在积极开发中"；它的亮点功能（iPhone 镜像、Apple 智能）在 Intel 机器上本来就用不了 |
| 26 Tahoe | 只有 3.x 预发布版支持，而且是最后一个支持 Intel 的系统，不折腾 |

## 三、安装前要想清楚的两件事

### 要不要备份

稳妥的做法是先用时间机器备份一次。备份防两种意外：安装中途失败系统起不来；装完不满意想退回去。后一种最麻烦，从新系统退回旧系统必须抹盘重装。

我这台机器上没有什么要紧的东西，就没有备份。如果你的电脑里有重要文件，一定先备份。

### 要不要抹盘重装

**不要抹盘**，直接在原系统上升级。原因在 T1 芯片。

2016、2017 款带 Touch Bar 的 MacBook Pro 都有一颗 **T1 芯片**，它是苹果的第一代安全芯片，相当于电脑里的一台小电脑，负责 Touch Bar、Touch ID 指纹、Apple Pay。

Sonoma 删掉了对 T1 的支持。OCLP 1.1.0 以后能补回来，但前提是硬盘上还留着旧系统里和 T1 配合用的文件。OCLP 官方文档写明：**抹掉硬盘会清除 T1 的固件，并且不会重新安装。**所以直接升级更稳。

想要一台干净的系统，正确顺序是：先在恢复模式里抹盘、重装一个全新的 Monterey，再用 OCLP 升级到 Sonoma。

## 四、安装步骤

需要准备一块 16GB 以上的 U 盘或移动硬盘。我用的是一块 1TB 的希捷移动硬盘，原来是 NTFS 格式，Mac 上只能读不能写。这不影响做安装盘：OCLP 写入时会把整块盘抹掉，重新分区成 macOS 的格式，根本不会往 NTFS 里写东西。

1. **安装 OCLP**：下载 `OpenCore-Patcher.pkg`，双击安装，打开 OpenCore-Patcher。
2. **做安装盘**：点 **Create macOS Installer → Download macOS Installer**，选 Sonoma 14.x 的最新版，下载约 13GB，然后写入移动硬盘。选盘时看清容量，别选成内置硬盘。
   - 安装器走的是苹果官方的软件更新服务器，国内下载速度还可以；
   - 写入时进度条会在某个百分比停很久，这是正常的。可以打开"活动监视器"的"磁盘"标签页，看写入的数据还在不在涨；
   - 已经有"安装 macOS Sonoma.app"的话，可以选 **Use Existing macOS Installer**，省掉下载。
3. **把 OpenCore 装到内置硬盘**：点 **Build and Install OpenCore → Install to disk**，选内置硬盘的 EFI 分区。装在内置硬盘上，以后开机就自动经过 OpenCore，不用插着 U 盘。
4. **从安装盘启动**：插着移动硬盘重启，按住 **Option** 键，选 **EFI Boot**，再在 OpenCore 的菜单里选 **Install macOS Sonoma**。
5. **安装**：目标选 **Macintosh HD**，**不要进磁盘工具抹盘**，直接安装就是保留数据的升级。中途会自动重启好几次，黑屏、白苹果卡很久都正常，全程约一小时。
6. **打补丁**：进入系统后打开 OCLP，点 **Post-Install Root Patch → Start Root Patching**，完成后重启。

## 五、踩到的坑

### 选了 EFI Boot，还没来得及选就直接进了旧系统

OpenCore 的选择菜单默认隐藏或者倒计时很短，选了 EFI Boot 之后，它自动启动了默认系统，也就是原来的 Monterey。

解决：选 EFI Boot 回车后，**立刻按住 Option 键（或 Esc）**，直到出现 OpenCore 的菜单。也可以在 OCLP 的 **Settings → Build** 里打开 **Show OpenCore Bootpicker**，重新 Build and Install OpenCore，以后每次开机都会显示菜单。

### 装完屏幕一直闪，设置向导里搜不到 Wi-Fi

这两个是同一个原因：Sonoma 里没有这台机器集成显卡和无线网卡的驱动，要靠 Root Patch 补回来。

- **屏幕闪**：Intel 集成显卡没有驱动。可以先在"系统设置 → 电池 → 选项"里关掉"自动切换显卡"，让系统固定用 AMD 独立显卡（它的驱动 Sonoma 自带），屏幕就不闪了。
- **没有 Wi-Fi**：设置向导里点"其他网络选项 → 我的电脑未连接到互联网"跳过，Apple ID 也选"稍后设置"，先进桌面。

进桌面后打补丁，这台机器需要的补丁是：

| 补丁 | 作用 |
| --- | --- |
| Graphics: Intel Skylake | Intel HD 530 集成显卡驱动 |
| Graphics: AMD Polaris | AMD Radeon Pro 独立显卡相关的补丁 |
| Networking: Modern Wireless | 博通无线网卡驱动 |
| Miscellaneous: T1 Security Chip | T1 芯片支持 |

补丁文件已经打包在 OCLP 的安装包里，我在没有联网的情况下打补丁也成功了。打完重启，屏幕不闪了，Wi-Fi 也回来了。日志里会提到 KDK（内核开发包），部分情况下要从 GitHub 下载它，如果打补丁时提示下载失败，可以用 iPhone 的个人热点通过数据线给 Mac 临时联网。

### Touch ID 录不进指纹

升级后 Touch Bar 正常，说明 T1 芯片在工作，补丁也生效了；但在"触控 ID 与密码"里添加指纹，输完密码没有反应。

试过的办法：

- 完整关机再开机，让 T1 重新初始化；
- 在 OCLP 里 **Revert Root Patches** 撤销补丁、重启，再重新打一遍补丁。

都没用。社区里有人通过修改 OCLP 的 SMBIOS 伪装设置恢复了 Touch ID，但也有人改完开不了机。这台是家庭备用机，用密码解锁完全够用，就没有再折腾。

### iCloud 退不出登录，照片、音乐也打不开

升级后想退出 iCloud，一直转圈。强制退出、重启、先关"查找我的 Mac"都不行，接着自带的照片、音乐也打不开了。

原因是退出过程卡在一半，账户状态乱了；照片和音乐启动时要读 iCloud 账户和钥匙串，也跟着卡住。

解决办法是**新建一个管理员用户**，用新用户登录后一切正常。说明系统没问题，只是旧用户的账户数据坏了。把旧用户删掉，再在 iPhone 的"设置 → 你的名字"设备列表里把这台 Mac 从账户中移除，就彻底干净了。

### 睡眠后唤醒就死机

装好用了一天，发现只要电脑进入睡眠，再唤醒就卡死：屏幕闪一下或者干脆不亮，键盘鼠标都没反应，只能长按电源键强制关机。

**先看崩溃日志。** macOS 会把这类故障记在 `/Library/Logs/DiagnosticReports/` 里，一共找到两种文件：

- `Kernel-*.panic`：内核崩溃记录
- `Sleep Wake Failure_*.diag`：睡眠唤醒失败记录

`.panic` 文件有好几 MB，第一行是一段 JSON 元信息，第二行才是正文，崩溃原因在 `macOSPanicString` 字段里，旁边还有一大段 base64 编码的现场快照。直接 `grep` 搜不到东西，用 Python 解析一下就清楚了：

```bash
f=$(ls -t /Library/Logs/DiagnosticReports/Kernel-*.panic | head -1)
python3 - "$f" <<'PY'
import json, sys
body = open(sys.argv[1], errors="ignore").read().split("\n", 1)[1]
d, _ = json.JSONDecoder().raw_decode(body)
print(d.get("macOSPanicString", "")[:1500])
PY
```

日志里能看出三件事：

| 记录 | 内容 | 说明 |
| --- | --- | --- |
| 内核崩溃 | `AMDFramebufferVIB::setPowerState ... timed out after 45290 ms` | 唤醒时给 AMD 独显重新上电，45 秒没完成，系统判定超时崩溃 |
| 唤醒失败 | 卡在 `IOGraphicsSystem`，等着 AMD Radeon 的驱动 | 和上一条是同一个问题，最后是我按电源键强制关的机 |
| 唤醒失败 | `Sleep Wake failure in EFI` | 只用核显时出现，在更早的固件阶段就失败了 |

另外还有一次和睡眠无关的崩溃，出在 OCLP 补的无线网卡驱动（`AirPort.BrcmNIC`）上，只出现过一次，先观察。

**按日志试了几种设置，都不行：**

1. **关掉待机**（`sudo pmset -a standby 0`）。有人在 2017 款 MacBook Pro 上用这招解决了 OCLP + Sonoma 的唤醒失败，两款硬件很接近，但在我这台上没用。
2. **只用独显**（`sudo pmset -a gpuswitch 1`）。想看看是不是双显卡切换的问题，结果更糟：直接无法唤醒。这正好和日志对上了，问题就出在 AMD 独显的唤醒上。
3. **只用核显**（`sudo pmset -a gpuswitch 0`），并关掉休眠镜像。躲开了独显，但唤醒在固件阶段又失败了，也就是上表的第三条。

15 寸 2016 款还有个硬件限制：雷雳接口是直接接在独显上的。我这台平时要接外接显示器，只要插上显示器，系统就会强制启用独显，所以「只用核显」这条路本来也走不通。

**最终方案：不让系统睡眠，只关屏幕。** 既然唤醒这一步过不去，就干脆不睡：

```bash
sudo pmset -a gpuswitch 2
sudo pmset -a sleep 0
sudo pmset -a disablesleep 1
sudo pmset -a hibernatemode 0
sudo pmset -a autopoweroff 0
sudo pmset -a standby 0
sudo pmset -a powernap 0
sudo rm -f /var/vm/sleepimage
sudo pmset -a displaysleep 10
```

| 设置 | 作用 |
| --- | --- |
| `gpuswitch 2` | 恢复显卡自动切换（接显示器时本来就会用独显） |
| `sleep 0`、`disablesleep 1` | 系统不睡眠，合盖也不睡眠 |
| `hibernatemode 0`、`autopoweroff 0`、`standby 0` | 关掉休眠镜像和深度待机，不再往硬盘写内存镜像 |
| `powernap 0` | 关掉睡眠时的后台唤醒 |
| `displaysleep 10` | 10 分钟没操作就关屏幕 |

**熄屏要先测一下。** 熄屏后再点亮，也会让显卡的显示输出断电再上电，有可能触发同样的问题。我先把熄屏时间设成 1 分钟，等屏幕熄灭后动鼠标，能正常亮起，才改回 10 分钟。如果你的机器熄屏后也会卡死，就设成 `displaysleep 0`（永不熄屏），改用显示器自己的节能功能。

改完用 `pmset -g` 检查，应该能看到 `SleepDisabled 1`、`sleep 0`、`hibernatemode 0` 这些值。

一个小坑：一开始我把带 `#` 注释的命令直接粘进终端，结果好几行报 `Usage: pmset <options>`。macOS 默认的 zsh 在交互模式下不把 `#` 当注释，注释文字被当成参数传给了 pmset。不带注释重新执行就好了。

**日常使用要注意：**

- **不要点苹果菜单里的「睡眠」**，它会绕过上面的设置强制睡眠，还是会死机。
- 离开时用 `Control + Command + Q` 锁屏，锁屏不涉及睡眠。
- 长时间不用就直接关机。
- 以后升级了 OCLP，想再试试正常睡眠，把 `disablesleep` 改回 0、`sleep` 改回 1 即可。

## 六、装完之后要知道的

- **别删 OCLP，别动 EFI 分区**：现在每次开机都要经过 OpenCore。
- **少用"重置 NVRAM"**：重置后可能绕过 OpenCore，系统进不去。万一进不去，开机按住 Option 选 EFI Boot。
- **系统更新**：14.x 的小版本更新可以装，但下载的是完整安装包；更新完显卡等补丁会失效，OCLP 会自动弹窗提示重新打补丁。大版本升级（15、26）别点。我关掉了"自动安装 macOS 更新"，只保留"安全响应和系统文件"。
- **安全性略低**：为了打补丁，OCLP 关掉了部分系统完整性保护（SIP），个别检测 SIP 的软件可能拒绝运行。不在这台机器上处理敏感事务就好。
- **FileVault 尽量别开**：打补丁时一般要求它关闭。
- **系统不睡眠**：这台机器睡眠后唤醒会死机，现在是「只关屏幕、系统不睡」，详见上面的[睡眠后唤醒就死机](#睡眠后唤醒就死机)。别点苹果菜单里的「睡眠」。
- **Homebrew 没有现成的安装包**：Intel 芯片 + Sonoma 的组合，Homebrew 装软件要从源码编译，很慢。在这台机器上搭博客写作环境的过程记在了[《从 Hexo 迁移到 Astro》](/posts/hexo-to-astro-migration/)里。

## 七、效果

升级后的系统是 macOS Sonoma 14.8.9。显卡、Wi-Fi、Touch Bar 都正常，只有 Touch ID 没有恢复，另外系统睡眠后无法唤醒，只能设成不睡眠、只关屏幕。新软件都能装了，接 4K 显示器看视频、写写代码、跑博客的本地预览都没问题，当一台家庭备用机绰绰有余。

一台十年前的电脑，硬件其实还够用，被淘汰的只是系统支持。OCLP 让它多用好几年。

> 参考：[OCLP 官方文档：macOS Sonoma](https://dortania.github.io/OpenCore-Legacy-Patcher/SONOMA-DROP.html)、[OCLP 支持机型](https://dortania.github.io/OpenCore-Legacy-Patcher/MODELS.html)、[OCLP Releases](https://github.com/dortania/OpenCore-Legacy-Patcher/releases)、[2017 款 MacBook Pro 在 OCLP Sonoma 上的睡眠唤醒失败](https://hexacera.com/posts/oclp-sonoma-sleep-wake-failure)。
