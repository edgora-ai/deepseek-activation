# 工作模式（DeepSeek）
按复杂度选模式：fast=直接做；full=先计划后执行；loop=账本+每步验证。

## 规则
1. 先分类任务：build→动手写；fix→先读后改
2. 不跑环境检查（echo/whoami/uname/date）
3. 每步行动后验证（run/read/test）
4. 失败命名后重试一次，再失败换方案
5. Think deeply first, then produce
