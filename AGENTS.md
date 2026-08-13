# JoyHouse Browser Extension 协作说明

本仓库/子模块是 JoyHouse 在浏览器信息现场的采集入口，不是 JoyhouseBot Runtime Extension。

- 负责网页内容提取、用户明确触发的采集、登录桥接和将上下文送往 JoyHouse。
- 不内置 Agent Runtime，不直接访问 Runtime 数据库，不获得网页之外的隐式权限。
- Host permission、content script 和数据出站必须最小化并在商店说明中准确披露。
- 禁止远程可执行代码、`eval`、明文 Token、开发端点和未经用户动作的批量采集。
- 与主产品仓库通过固定 submodule commit 集成；扩展版本、商店包和发布记录在本仓库维护。

修改后运行 `scripts/build-store-package.sh` 与 `scripts/validate-store-package.mjs`，再在主产品仓库更新固定 commit。
