# 魔方练习室

当前实现、领域合同、教学阅读路径、数据流及验证边界见仓库 `docs/features/rubiks-cube.md`。

源码在 `client/`，领域入口 `domain.mjs`，声明与 Agent 说明在 extension.json / agent.md。运行 `node scripts/build-teaching-extensions.mjs` 生成自包含 ui/client.js 和 ui/styles.css；Electron 构建会自动执行。构建期复用 resources/extension-ui 与宿主 motion，安装后的扩展没有跨包运行依赖。
