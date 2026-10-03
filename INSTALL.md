# 安装 dsh-personal-skins

这份文件既写给人，也写给替你操作的 AI 助手。目标：把本仓库装进当前 DeepSeek Harness 的 profile，并让「我的皮肤」出现在 **设置** 里。

> 把下面这句话发给 DSH（或任意 AI 助手），它会照本文件执行：
>
> ```
> 读取 https://github.com/<用户名>/dsh-personal-skins/blob/main/INSTALL.md 并按其中的指引安装本插件
> ```

## 0. 先确认环境

- **DSH 版本**：需要 0.2 系列。本插件的 `peerDependencies` 声明为 `>=0.2.0-rc.2 <0.3.0-0`，低于或超出这个范围会被宿主拒绝加载。
- **当前 profile**：profile 启动的 Harness 里 `echo "$DSH_PROFILE"` 会给出名字（`$DSH_PROFILE_DIR` 是它的目录）。桌面 App 用的是 `desktop`，Web 版通常是 `web`。
- **`desktop` profile 是保留的**：普通 `dsh` 会直接拒绝（`profile "desktop" is managed exclusively by the Electron application`），只有 App 自带的 CLI 接受它。

## 1. 选一种安装方式

| 场景 | 用哪种 | 需要终端吗 |
|---|---|---|
| 桌面 App 用户 | 界面里的「＋ 添加插件」 | 不需要 |
| 桌面 App，用命令行 | App 自带 CLI（下面第 3 节） | 需要 |
| Web profile | `dsh plugin --profile web add ...` | 需要 |
| 本机还没发布的目录 | 第 4 节 | 需要 |

## 2. 桌面端图形界面（给用户的最短路径）

1. 打开 DeepSeek Harness → **设置 → 插件**
2. 点右上角 **＋ 添加插件**
3. 粘贴 `<用户名>/dsh-personal-skins`（也接受 `https://github.com/<用户名>/dsh-personal-skins`）
4. 装完 **完全退出并重新打开** DeepSeek Harness
5. **设置 → 我的皮肤** → ＋新建皮肤 → 上传图片 → 保存 → 应用

安装源（npm 官方源 / 中国大陆镜像源 / 自定义）只影响从 npm 安装；用 GitHub 或本地目录时保持默认即可。

## 3. 命令行安装

Web profile：

```sh
dsh plugin --profile web add 'github:<用户名>/dsh-personal-skins'
```

桌面端（**先完全退出 DeepSeek Harness**，App 开着时 profile 的 `package.json` 被加锁，安装会一直等）：

```sh
# macOS
DSH_CLI='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
"$DSH_CLI" plugin --profile desktop add 'github:<用户名>/dsh-personal-skins'
```

`dsh plugin` 就是包管理器的转发入口。它会：

1. 把包装进 `<profile 目录>/node_modules/`；
2. 读包的 manifest，发现它声明了 `dsh.bundle.patch`，于是**自动**把 `dsh-personal-skins` 追加进该 profile `package.json` 的 `dsh.profile.bundles`。

**不要**手工编辑 profile 的 `package.json` 或 `cordis.patch.yml`，也不要在 profile 目录里直接跑 `pnpm` —— 上面的命令已经做了这些事，手工改容易把 profile 弄坏。

包内已经提交了构建好的 `lib/client.js`，所以 `github:` 安装不需要任何构建步骤（仓库里没有 `prepare` 脚本）。

## 4. 从本机目录安装（开发 / 尚未发布时）

```sh
# 1. 先构建客户端产物（改了 src/client/ 就要重跑；正常安装用户不需要）
cd '/绝对路径/dsh-personal-skins'
node scripts/build-client.mjs

# 2. 桌面端：完全退出 App 后
DSH_CLI='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
"$DSH_CLI" plugin --profile desktop add "$PWD"
```

- 路径必须**真实存在**。路径写错时 pnpm 读不到目标的 `package.json`，会退回用目录名当依赖名；非 ASCII 目录名会被 pnpm 拒绝（`ERR_PNPM_INVALID_DEPENDENCY_NAME`）。
- 路径正确时依赖名取自包内 `package.json` 的 `name`（`dsh-personal-skins`），与目录叫什么无关；路径含空格要加引号。
- 用 `"$PWD"` 可以免去手打绝对路径。

## 5. 验证

```sh
# 组合后的 profile 里应当出现 dsh-personal-skins
DSH_CLI='/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh'
"$DSH_CLI" --profile desktop --dump-config | grep personal-skins
```

重启 DeepSeek Harness，然后：

- **设置** 的导航里应当多出 **「我的皮肤」**；
- 插件页的「已安装」里会列出 `dsh-personal-skins`。

注意：**装完第一次重启之前，界面不会有任何变化**；而且在你保存并应用一套预设之前，画面也不会变——渲染层只在有激活预设时才改主题令牌。这是有意的。

## 6. 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| `ERR_PNPM_INVALID_DEPENDENCY_NAME ... "某中文名"` | 给的路径不存在，pnpm 退回用目录名当依赖名 | 用真实存在的绝对路径重装；失败后先做下一行 |
| 装失败后重试一直失败 | profile 里留下了含错误依赖的 `pnpm-lock.yaml` | `rm -f ~/.dsh/profiles/desktop/pnpm-lock.yaml`（Web profile 把路径里的 `desktop` 换成 `web`），再重试 |
| `profile "desktop" is managed exclusively by the Electron application` | 用了普通 `dsh` | 改用 App 自带的 CLI（第 3 节） |
| 命令卡住不动 | App 还开着，profile 的 `package.json` 被加锁 | 完全退出 DeepSeek Harness 再执行 |
| 重启后设置里没有「我的皮肤」 | 客户端半边没进模块图 | 再完全退出并重启一次；仍有问题请带版本号提 issue |
| 界面没变化 | 还没保存/应用预设 | 进「设置 → 我的皮肤」新建并应用一套 |
| 升级 DSH 后皮肤消失 | 宿主会停用未声明支持当前版本的插件 | 更新插件；或在插件页按提示放行当前版本 |

## 7. 卸载

```sh
# Web profile
dsh plugin --profile web remove dsh-personal-skins
# 桌面端（先完全退出 App）
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' plugin --profile desktop remove dsh-personal-skins
```

重启 DeepSeek Harness。上传的图片和预设仍保留在 `$DSH_HOME/personal-skins/`，需要的话手动删除。
