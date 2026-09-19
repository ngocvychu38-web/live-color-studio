# 实时视觉接入候选

以下为候选调研，用户尚未选定，不构成实施决定。

## 推荐试用：Banuba Web AR SDK

- 官方 Web SDK 页面明确提供 Hair Color、Hair Segmentation、实时人脸跟踪及直播场景。
- 通过 JavaScript 在浏览器本地处理，不是云端 HTTP 视频处理 API。
- 需要 client token；官方提供 14 天试用，正式授权费用与功能范围需向供应商确认。
- 目标电脑的实时性能、染发效果、头侧字幕所需定位数据及处理画面导出，需要实际集成验证。
- 来源：https://www.banuba.com/webar-sdk
- 接入：https://docs.banuba.com/far-sdk/tutorials/development/basic_integration/index.html?platform=web

## 备选：DeepAR

- 官方产品页列出 Web 支持及直播发色变化能力。
- 具体染发模块、许可和效果资源需进一步核实；不能把 Beauty 模块的许可自动视为染发许可。
- 来源：https://www.deepar.ai/augmented-reality-sdk

## 图片 REST API：Perfect Corp / YouCam

- 接收用户图片及发色参数，返回处理后的图片 URL，支持 HEX 颜色等参数。
- 适合图片试色；所查资料不能证明支持连续直播视频，暂不推荐作为直播染发主处理接口。
- 来源：https://yce.perfectcorp.com/ai-api/products/api-hair-color-changer

若采用非火山视觉 SDK，需用户确认此平台例外；语音识别与指令解析仍计划采用火山引擎。
