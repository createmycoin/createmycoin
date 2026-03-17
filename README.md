# createmycoin
一个能发行发行自己数字货币的项目。

水龙头：https://cloud.google.com/application/web3/faucet/ethereum/sepolia
学习：https://www.createmytoken.com


开发者：
  后端服务：D:\Git\github\createmycoin\createmycoin\backend\app.py

  前端访问：D:\Git\github\createmycoin\createmycoin\frontend\index.html









# CreateMyCoin 系统设计文档 v1.0

---

## 一、项目概述

**项目名称**：CreateMyCoin
**项目版本**：v1.0（最小可行产品 MVP）
**项目类型**：一键发币 Web 平台
**核心功能**：允许用户通过简单操作创建自定义 ERC20 Token，并部署到支持的 EVM 区块链网络。
**技术选型**：Python (PyCharm 开发) + 前后端分离架构。

### 1.1 项目目标 v1.0

* 提供最简洁易用的前端界面，用户可快速创建代币
* 支持 MetaMask 钱包连接进行部署签名
* 用户只需输入代币名称和发行数量，其它参数默认，可选修改
* 实时显示部署状态和结果（合约地址、交易哈希）
* 后端保存重要发币信息，使用 SQLite 数据库存储

### 1.2 用户群体

* 区块链初学者 / 教育用途
* 小型项目或个人想快速发行代币

---

## 二、功能模块设计 v1.0

### 2.1 前端模块

#### 2.1.1 钱包连接

* 功能：连接 MetaMask 钱包
* 验证用户账户、网络状态、余额
* 提示用户切换网络（主网 / 测试网）

#### 2.1.2 Token 参数输入

* 用户输入：

  * Token 名称（默认值可自动填充）
  * 发行数量
* 其它参数：

  * decimals、Mintable、Burnable、Pausable、Permit 等默认值，可在高级设置修改

#### 2.1.3 部署与状态显示

* 使用 Ethers.js / Web3.js 构建部署交易
* 用户钱包签名发送交易
* 前端实时显示部署进度和结果

  * 交易哈希
  * 合约地址
* 可选择刷新或复制信息

### 2.2 后端模块 v1.0

#### 2.2.1 数据存储

* 使用 SQLite 数据库存储重要发币信息
* 表结构示例：

| 表名       | 字段               | 类型       | 说明                           |
| -------- | ---------------- | -------- | ---------------------------- |
| projects | id               | int      | 项目ID                         |
| projects | wallet_address   | string   | 用户钱包地址                       |
| projects | token_name       | string   | 代币名称                         |
| projects | initial_supply   | uint256  | 初始发行量                        |
| projects | decimals         | int      | 精度                           |
| projects | features         | json     | Mint/Burn/Pausable/Permit 开关 |
| projects | chain            | string   | 部署链                          |
| projects | contract_address | string   | 合约地址                         |
| projects | tx_hash          | string   | 部署交易哈希                       |
| projects | timestamp        | datetime | 部署时间                         |

#### 2.2.2 API 接口

* 接收前端请求并存储发币信息
* 提供查询接口用于前端展示状态
* 可选提供模板合约源码管理（高级功能可扩展）

---

## 三、技术选型 v1.0

| 层      | 技术栈                           | 说明                       |
| ------ | ----------------------------- | ------------------------ |
| 前端     | HTML/CSS + JS + Ethers.js     | 钱包连接、表单输入、部署交互           |
| 后端     | Python (FastAPI/Flask)        | 用户信息存储、API 接口、SQLite 数据库 |
| 智能合约   | Solidity + OpenZeppelin ERC20 | 最简 ERC20 合约模板，参数化生成      |
| 数据库    | SQLite                        | 存储用户项目及代币信息              |
| RPC 节点 | Infura / Alchemy / QuickNode  | 支持测试网或主网部署               |

---

## 四、系统架构设计 v1.0

### 4.1 架构概览

```
用户
  │
  ▼
前端 (HTML/JS + Ethers.js)
  │  ├─ 钱包连接 (MetaMask)
  │  ├─ Token 名称 + 发行数量输入
  │  └─ 构建部署交易 & 签名
  ▼
智能合约部署 (EVM 链)
  │
  ▼
区块链网络 (Ethereum / Optimism / Base / 测试网)

后端 (Python + FastAPI/Flask)
  │  ├─ 接收发币信息
  │  ├─ 存储 SQLite 数据库
  │  └─ 提供查询 API 给前端

SQLite 数据库 (用户项目及发币记录)
```

### 4.2 前端流程 v1.0

1. 用户访问网页 → 连接 MetaMask 钱包
2. 输入 Token 名称与发行数量
3. 前端生成部署交易并通过钱包签名发送
4. 实时显示部署状态和结果（交易哈希/合约地址）
5. 调用后端 API 存储发币信息

### 4.3 后端流程 v1.0

1. 接收前端发币请求
2. 将发币重要信息存储到 SQLite 数据库
3. 提供查询接口给前端展示状态和历史记录
4. 可扩展为多模板管理及高级功能

---

## 五、安全与合规 v1.0

1. 所有交易由用户钱包签名，平台不持有私钥
2. 智能合约使用 OpenZeppelin ERC20 模板，保证安全性
3. SQLite 数据库仅存储非敏感信息，开发阶段可快速迭代
4. 前端提供网络检测，避免在错误网络部署

---

## 六、总结 v1.0

CreateMyCoin v1.0 是最简化的一键发币平台，实现了核心功能：

* 前后端分离
* 钱包连接与签名部署
* 用户输入代币名称和发行数量，其它参数默认，可选修改
* 部署状态和结果实时显示
* 后端记录重要发币信息（SQLite）

该版本为 MVP，为后续高级功能（多模板、Deflationary、流动性池、自动验证等）留有扩展空间。
