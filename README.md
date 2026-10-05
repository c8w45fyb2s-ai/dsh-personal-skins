# dsh-personal-skins

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 添加自定义背景图和透明立绘，保存多套皮肤并随时切换。支持 DSH 0.2.0-rc.2 版本。

## 安装

1. 打开 **设置 → 插件 → ＋ 添加插件**。
2. 粘贴 `c8w45fyb2s-ai/dsh-personal-skins`。
3. 安装后**完全退出并重新打开** DeepSeek Harness。
4. 进入 **设置 → 我的皮肤 → 打开皮肤工作区**。

Web 版也可用命令行安装：

```sh
dsh plugin --profile web add 'github:c8w45fyb2s-ai/dsh-personal-skins'
```

桌面端命令行、本地安装及排错见 [INSTALL.md](INSTALL.md)。安装无需自行构建。

## 使用

- **新建皮肤**：填写名称，上传背景图或透明立绘。
- **浅色 / 深色**：切换预览配色，两种模式共用图片；上传、替换和移除只需操作一次。
- 调整背景位置、缩放、模糊和遮罩；立绘可调整位置、大小、透明度和镜像。精致主题还支持强调色、面板不透明度及装饰。
- 点 **保存**，再从列表点 **应用**；点 **恢复默认** 可停用皮肤。

图片支持 PNG、JPEG、WebP，单张不超过 10 MiB、4000 万像素。

## 数据与卸载

配置和图片保存在 `$DSH_HOME/personal-skins/`，默认是 `~/.dsh/personal-skins/`。图片按内容去重，插件不向外部服务上传数据。仅面向本机使用，远程部署需另配鉴权。

卸载前点 **恢复默认**，移除插件后重启 DSH。卸载方法见 [INSTALL.md](INSTALL.md#7-卸载)；已有图片和预设会保留。

## 开发

需要 Node.js 24：

```sh
npm run build          # 构建客户端
npm test               # 单元测试
npm run check:package  # 发布包检查
npm run dev:preview    # 本地预览
```

修改客户端后需重新构建并提交 `lib/client.js`。预览默认地址为 `http://127.0.0.1:4177/`，数据隔离在 `.local-demo/`。浏览器检查页为 `tests/renderer.browser.html`。

## 许可

代码采用 [MIT](LICENSE)。仓库不附带美术素材，图片请自行准备并确保有权使用。
