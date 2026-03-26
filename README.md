# tabcode bb-browser adapters

把 `https://tabcode.cc` 的核心控制台能力封装成 `bb-browser site` 本地 adapter。

## 当前命令

- `tabcode/dashboard`：仪表板聚合信息
- `tabcode/me`：当前账户信息
- `tabcode/keys`：API Key 列表
- `tabcode/key-create`：创建 API Key
- `tabcode/key-update`：更新 API Key
- `tabcode/key-delete`：删除 API Key
- `tabcode/key-priority`：查询/设置扣费优先级
- `tabcode/usage-summary`：调用汇总
- `tabcode/usage-requests`：调用明细
- `tabcode/usage-timeseries`：时序统计
- `tabcode/usage-ranking`：排行榜
- `tabcode/subscription`：当前订购与兑换记录
- `tabcode/redeem`：兑换套餐/加油包
- `huawei/overview`：华为开发者联盟控制台总览摘要
- `senssun/common`：香山大数据平台 `/common` 页聚合摘要
- `senssun/device-query`：按设备 ID 查询设备绑定信息
- `senssun/user-query`：按登录账号查询用户信息与绑定设备
- `senssun/user-measurements`：查询用户测量记录（体脂秤/厨房秤/卷尺/婴儿秤）
- `senssun/feedback`：查询用户反馈列表
- `senssun/measuring-log`：查询测量错误日志
- `senssun/user-error-log`：查询用户错误日志

## 安装

```bash
"./scripts/install-local-sites.sh"
```

安装后可直接运行：

```bash
bb-browser site tabcode/dashboard
bb-browser site tabcode/keys
bb-browser site tabcode/usage-summary
bb-browser site huawei/overview
bb-browser site senssun/common
bb-browser site senssun/device-query --deviceId 000113032964FB0141376B
bb-browser site senssun/user-query 13180121679
bb-browser site senssun/user-measurements 13180121679 all
bb-browser site senssun/user-measurements 13180121679 bodyfat
bb-browser site senssun/feedback 0 10
bb-browser site senssun/measuring-log --errorCode 20014 --pageSize 10
bb-browser site senssun/user-error-log --errorLogId 2c0377fd-ce6f-440e-9fcf-5c3ad0580de3
```

## 通过 Git 多机同步

本仓库只管理本地 adapter 源码：

- `sites/`
- `scripts/install-local-sites.sh`
- `README.md`

安装脚本会把 `sites/` 里的 JS 文件复制到本机的 `~/.bb-browser/sites/`。

### 开发机更新 adapter

1. 修改 `sites/` 下的文件
2. 本机安装：

```bash
"./scripts/install-local-sites.sh"
```

3. 提交并推送：

```bash
git add "sites" "scripts" "README.md"
git commit -m "feat: update adapters"
git push
```

### 其他机器首次使用

```bash
git clone "https://github.com/tomorrowDolol/bb-sites-private.git" "baby-cli"
cd "baby-cli"
"./scripts/install-local-sites.sh"
```

### 其他机器后续更新

```bash
git pull
"./scripts/install-local-sites.sh"
```

### 注意事项

- 本仓库不包含 `bb-browser` 主程序，请单独安装或单独更新。
- Git 只同步 adapter 文件，不同步浏览器登录态、Cookie、`localStorage`。
- 换机器后，需要在目标机器浏览器重新登录相关站点。
- 每次 `git pull` 后，都要重新执行一次安装脚本，否则 `~/.bb-browser/sites/` 不会自动更新。

## 设计原则

- **KISS**：命令面直接映射站点核心能力
- **YAGNI**：只覆盖已逆向确认的控制台能力
- **DRY**：各 adapter 共享同一套最小认证/请求模式
- **SOLID**：每个 adapter 只负责一个稳定能力

## 已知限制

- 当前站点认证基于浏览器 `localStorage` 中的 `auth:*` token。
- 华为控制台命令依赖 `developer.huawei.com` 当前登录态中的 Cookie（尤其是 `developer_userinfo` / `x-teamId`）。
- 香山大数据平台命令依赖 `inside.senssun.com` 当前浏览器页面里的 `localStorage.xs-token`，未登录时会自动返回明确提示。
- 未登录时，命令会返回明确提示，而不是静默失败。
- `bb-browser` 当前在“受管浏览器没有任何 page target”时，部分命令会先失败一次；先打开任意页面或保留一个 tab 即可规避。
