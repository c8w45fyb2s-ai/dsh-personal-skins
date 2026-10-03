# dsh-personal-skins

给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 换上你自己的图片：上传背景图和透明立绘，调整位置、缩放、模糊、遮罩与面板透明度，保存成多套预设随时切换。

安装后入口在 **设置 → 我的皮肤**。数据只写在本机（`$DSH_HOME/personal-skins/`），不改动 Harness 安装目录，也不联网。

## 安装

### 方式一：桌面端界面里安装（推荐，不用终端）

1. 打开 DeepSeek Harness → **设置 → 插件**
2. 点右上角 **＋ 添加插件**
3. 粘贴仓库地址：`<用户名>/dsh-personal-skins`
4. 装完 **完全退出并重新打开** DeepSeek Harness
5. **设置 → 我的皮肤 → ＋新建皮肤** → 上传图片 → 保存 → 应用

### 方式二：把这句话发给 DSH（或任意 AI 助手）

```
读取 https://github.com/<用户名>/dsh-personal-skins/blob/main/INSTALL.md 并按其中的指引安装本插件
```

### 方式三：命令行

```sh
# Web profile（`dsh` 已在 PATH 上）
dsh plugin --profile web add 'github:<用户名>/dsh-personal-skins'
```

桌面端用的是由 App 独占的 `desktop` profile，只有 App 自带的 CLI 接受它，且**安装前要完全退出 App**：

```sh
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' \
  plugin --profile desktop add 'github:<用户名>/dsh-personal-skins'
```

装完重启一次 DeepSeek Harness。安装命令会把包装进 profile，并**自动**把这个声明了 `dsh.bundle.patch` 的包追加进 `dsh.profile.bundles`，不需要手工编辑 profile 的 `package.json` 或 `cordis.patch.yml`。

安装失败，或想先用本机目录试，见 [INSTALL.md](INSTALL.md)。

## 使用

进入 **设置 → 我的皮肤**：

- **＋新建皮肤**：起个名字，上传背景图（PNG / JPEG / WebP），可选再传一张透明底立绘
- **浅色 / 深色**：两套模式可以分别选图；只传一张也能用
- 可调参数：背景水平/垂直位置、缩放、模糊、遮罩、面板不透明度、强调色、立绘位置/大小/透明度/镜像
- 保存后点 **应用** 生效；每套预设是一张卡片，点 **应用** 随时切换
- **恢复默认** 一键撤销本插件的全部视觉效果

上传的图片按内容哈希去重存放，删除某套预设不会误删别的预设共用的图片。

## 卸载

1. 在「我的皮肤」里点 **恢复默认**
2. 用与安装相同的方式移除包：

```sh
dsh plugin --profile web remove dsh-personal-skins
# 桌面端：
'/Applications/DeepSeek Harness.app/Contents/Resources/runtime/cli/bin/dsh' plugin --profile desktop remove dsh-personal-skins
```

3. 重启 DeepSeek Harness。图片和预设仍留在 `$DSH_HOME/personal-skins/`，需要的话手动删除。

## 数据与隐私

配置写入 `$DSH_HOME/personal-skins/profile.json`，图片写入同目录下的 `assets/`；未设置 `DSH_HOME` 时使用 `~/.dsh/personal-skins/`。支持 PNG、JPEG 和 WebP，单张不超过 10 MiB、最大 4000 万像素。

插件通过 DSH 0.2 的 Connection Fetch transport 提供本机接口（桌面版走 IPC carrier，Web profile 走本机 API carrier），并拒绝跨站请求和缺少写入令牌的 POST。**当前版本面向本机实例**；部署在服务器上供他人访问前，需要自行在其前面加一层鉴权——接口本身不带用户认证。

## 开发

需要 Node.js 24。仓库根目录：

```sh
node scripts/build-client.mjs   # 把 src/client/ 打进 lib/client.js（改了客户端代码必须重跑）
node --test                     # 单元测试
node scripts/check-package.mjs  # 打包前检查：MIT、导入完整、发布名单里不含图片
DSH_PREVIEW_SEED_IMAGE=/绝对路径/图片.png node scripts/dev-server.mjs
```

最后一条会在 `http://127.0.0.1:4177/` 起一个独立预览页。它复用与插件完全相同的 Fetch routes、store、客户端 API、编辑器和渲染器，数据隔离在 `.local-demo/`（已 Git 忽略，也不会进 npm 包）。不带 `DSH_PREVIEW_SEED_IMAGE` 时预览从空白状态启动，直接在页面上新建皮肤、上传图片即可。

`tests/renderer.browser.html` 是渲染层的浏览器检查页（断言主题令牌的投影与还原），用浏览器打开、看标题是否 PASS。

## 实现要点

DSH 用 `renderSlot()` 把每个 slot 挂成 `<div data-slot="…" style="display: contents">` 锚点；`display: contents` 不产生盒子，所以在锚点上设背景没有任何效果。因此渲染器**不改动任何宿主元素**：它把预设的面板颜色投影到宿主主题令牌（`--dsw-alias-bg-base`、`--dsw-alias-bg-layer-1..3`，主题把令牌声明在 `body` 上，含 `body[data-ds-dark-theme]`），停用时精确还原；壁纸本身放在一个 `position: fixed; z-index: -1` 的独立图层里。`data-slot` 只用来定位输入框子树以投射强调色。

## 许可

代码采用 **MIT**，见 [LICENSE](LICENSE)。

本仓库不包含任何美术素材：仓库里没有图片，上传的图片归上传者所有，使用者需自行确保有权使用。
