# JoyhouseBot Chrome Web Store 提交清单

## Developer account

- [ ] 开发者 Google 账号已开启两步验证。
- [ ] 开发者名称、公开邮箱和支持邮箱可正常接收外部邮件。
- [ ] 已在 Google Search Console 验证 `joyhousebot.com`，并在 Dashboard 选择为官方 URL。

## Package

- [x] Manifest V3。
- [x] 版本已升级为 `0.4.1`。
- [x] ZIP 根目录直接包含 `manifest.json`。
- [x] 商店版固定连接正式 HTTPS 服务，不提供本地或任意服务器配置。
- [x] 不包含 README、演示密码、源映射、日志或系统垃圾文件。
- [x] 不包含远程脚本、`eval`、`new Function`、远程 WebAssembly 或动态下载的可执行逻辑。
- [x] 128×128 扩展图标已包含在运行包中。

## Store listing

- [x] 中文文案已准备。
- [x] 英文文案已准备。
- [x] 已准备两张 1280×800 商店截图。
- [x] 已准备 440×280 小型宣传图。
- [x] 已准备可选的 1400×560 横幅图。
- [ ] 商店描述、截图和实际功能完全一致，不宣传已移除功能。

## Privacy practices

- [x] 单一用途说明已准备。
- [x] 每项权限的用途说明已准备。
- [x] 数据类别和 Limited Use 填写稿已准备。
- [x] 扩展内首次显著披露和主动同意已实现。
- [x] 中文和英文隐私政策内容已补齐。
- [ ] 确认线上隐私政策已经发布并可匿名访问。

## Reviewer access

- [ ] 创建非管理员专用审核账号。
- [ ] 替换 `TEST_INSTRUCTIONS.md` 中两处 `REPLACE_BEFORE_SUBMISSION`。
- [ ] 使用全新 Chrome Profile 按审核步骤完整走一遍。
- [ ] 测试账号无需验证码、短信或 MFA，且审核期间保持可用。

## Distribution

- [ ] 首次提交选择公开或非公开分发范围。
- [ ] 建议启用“审核通过后暂不自动发布”，通过后人工上线。
- [ ] 提交前确认版本、隐私政策 URL、支持 URL 和审核账号均为最终内容。
