---
title: 群晖 NFS 共享的权限坑
date: 2026-10-10
tags: [Synology, NFS, Linux]
summary: 「明明给共享授权了，Linux 挂上去还是 Permission denied」—— 大概率是 squash 映射和服务端共享权限没对上。
---

在群晖上开 NFS 共享，最常见的翻车现场是这个：

```text
mount: /mnt/data: permission denied, or no such device
# 或者挂上了，写文件时
bash: /mnt/data/x: Permission denied
```

共享设置里明明写了主机名，权限也给了。问题通常出在**服务端权限和客户端身份的映射**上。

## 关键概念

NFS 传过去的是 **UID/GID 数字**，不是用户名。服务端只认数字，所以：

- 客户端上 `peter` 的 UID 是 1000
- 服务端上 UID 1000 是不是 `peter`，群晖不关心
- 共享设置里的「squash」决定服务端把收到的 UID 换成谁

三种 squash 模式：

| 模式 | 收到 UID=1000 时按谁算 | 适用场景 |
|------|------------------------|----------|
| 不映射 | 原样保留 1000 | 双端 UID 一致 |
| 映射为 admin | 一律算 admin | 服务端指定一个账号 |
| **全部映射为 guest** | 一律算 nobody/guest | 客户端 UID 各不相同 |

## 推荐配置

如果客户端机器数量多、UID 不可控，用「全部映射为 guest」最省心：

```text
NFS 权限：
  来源      192.168.1.0/24
  Squash    Map all users to guest
  Security  sys
  RW        可读写
```

但注意，**这只解决了「以谁的身份访问」，没解决「这个身份有没有权限」**。

### 还有第二层：共享文件夹权限

群晖的共享文件夹有自己的 ACL。服务端映射成 guest 之后，guest 能不能写，取决于共享文件夹有没有给 guest 授予权限。

```
控制面板 → 共享文件夹 → 选中 → 编辑 → NFS 权限
控制面板 → 共享文件夹 → 选中 → 权限 → 把 guest 加进去
```

只配了 NFS 权限、没配共享文件夹权限，就会得到那个经典的 `Permission denied`。

## 客户端挂载参数

```bash
# /etc/fstab
nas:/volume1/share  /mnt/share  nfs  vers=3,nolock,soft,_netdev,x-systemd.automount  0  0
```

几个参数的理由：

- `vers=3` —— 一些老客户端和工具对 NFSv4 的 ACL 支持不完整，v3 更直白。
- `nolock` —— 避免客户端 lockd 与服务端状态不一致导致挂载卡死。
- `soft` —— 网络断开时返回错误而不是无限挂起；代价是写入可能中断，数据敏感的场景要权衡。
- `x-systemd.automount` —— 开机不强依赖网络，第一次访问时才挂。

> 如果挂载时报 `access denied` 而不是 `no such device`，八成是来源 IP 或子网写错了；报 `permission denied` 则是权限映射那层。

## 排查顺序

1. `showmount -e <nas>` 看服务端导出了哪些共享。
2. `mount -v` 看挂载时的实际参数。
3. 挂上后 `ls -ln` 看文件属主的**数字** UID/GID 是多少。
4. 对照服务端共享设置里的 squash 模式，确认这个数字会被映射成谁。
5. 到共享文件夹权限里确认那个身份有读写权。

每一步都能排除掉一类原因，别一上来就重装。
