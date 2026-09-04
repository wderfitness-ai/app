# 跟单管理系统 MVP

这是一个零外部依赖的 Node.js Web 后台 MVP，用 JSON 文件持久化数据，适合先跑通贸易公司核心流程：

客户订单 -> 工厂采购订单 -> 生产状态 -> QC -> 付款 -> 利润计算 -> 导出 PI/PO/QC。

## 运行

```bash
npm run seed
npm run dev
```

打开 `http://localhost:3000`。

## 测试账号

| 角色 | 邮箱 | 密码 |
|---|---|---|
| Admin | admin@trade.local | password123 |
| Admin | wdefitness@trade.local | password123 |
| Sales | sales@trade.local | password123 |
| Merchandiser | merch@trade.local | password123 |
| Finance | finance@trade.local | password123 |
| Factory | factory-a@trade.local | password123 |
| Factory | factory-b@trade.local | password123 |

## 数据存储

数据文件：`data/database.json`

上传目录：`uploads/<订单号>/`
