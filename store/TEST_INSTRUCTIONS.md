# Chrome Web Store · Test instructions

> 提交前必须替换所有 `REPLACE_BEFORE_SUBMISSION`。测试账号只能填写在 Developer Dashboard 的 Test instructions，不要放进公开商店介绍或 ZIP。

## Login credentials

- Account: `REPLACE_BEFORE_SUBMISSION`
- Password: `REPLACE_BEFORE_SUBMISSION`
- Multi-factor authentication: `Not enabled for this reviewer account`

## Environment

- Production service: `https://app.joyhouse.chat/`
- Stable Chinese test page: `https://joyhousebot.com/extension/`
- Stable English test page: `https://joyhousebot.com/en/extension/`
- Library: `https://app.joyhouse.chat/clips`

## Reviewer steps

1. Install the extension and click the JoyhouseBot toolbar icon. Chrome opens the extension in the Side Panel.
2. Read the in-extension data disclosure, select the consent checkbox and click “同意并继续” (Agree and continue).
3. Sign in with the reviewer credentials above. No SMS, CAPTCHA or MFA is required for this account.
4. Open `https://joyhousebot.com/en/extension/`, select an English paragraph and click the floating “译” button. A card should show a Chinese translation.
5. In the translation card, click “朗读原文” and “朗读翻译” to test speech. Click “存生词” to save the selection.
6. Open `https://joyhousebot.com/extension/`. In the side panel, click “抓取正文”. The status should report the captured text and images.
7. Click “打开书房”. A private JoyHouse library item created from the test page should open.
8. Return to the test page, right-click the page and choose “JoyhouseBot 整页双语翻译”. Translations should appear under eligible paragraphs. Run the same command again to remove them.
9. Open Settings → Privacy & data to review the privacy policy link and consent status. “撤回同意并退出账号” clears the extension session and disables data-processing features until consent is granted again.

## Notes for review

- The extension requests access to HTTP/HTTPS pages because selection translation, bilingual page mode and article capture are designed to work on arbitrary user-selected web pages.
- Page data is transmitted only after an explicit user action and accepted disclosure.
- Saved items are private by default.
- All executable code is included in the package; no remote code is loaded.
