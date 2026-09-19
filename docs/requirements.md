# 基础版需求访谈记录

## 已确认

- 产品是 Web 直播软件，包含主播端和观众端，观众通过链接观看。
- 保留主播本人形象，第一版聚焦实时发色修改。
- 主播讲话实时显示在头部侧边。
- 语音造型指令采用固定前缀“改变造型”，避免将普通聊天误判为修改请求。
- AI 模型采用火山引擎平台，相关参数通过页面设置。
- 范围控制在上述基础能力。
- 第一版在同一局域网使用，支持 1–3 位观众。
- 主播通过电脑浏览器使用摄像头和麦克风开播。
- 观众照常听到造型指令，并看到其字幕。

## 待确认

- 是否允许浏览器本地视觉模型负责头发分割与头部定位，火山引擎负责语音识别与造型指令解析；这属于对最初 AI 平台要求的例外，尚未获得确认。

## 已核实的接入约束

- 火山引擎流式语音识别可用于实时字幕；豆包文本模型可用于造型指令解析，实际调用需要对应服务的有效凭证。
- 火山智能美化特效提供染发和头发分割，但所查公开技术规格仅列 Android、iOS、Windows、Mac、Linux，未列 Web，不能据此承诺浏览器直接接入。
- PC/Linux 特效 SDK 需要另行申请在线授权，不等同于方舟 API Key。
- 名为 AI 美颜 Live 的 OpenAPI 文档使用图片输入，尚无证据支持将其当作摄像头实时改色视频接口。
- 原始官方文档摘录保存在 `.firecrawl/volcengine-*.md`；未调用付费模型，未验证实际画质或延迟。

参考：

- [流式语音识别](https://www.volcengine.com/docs/6561/1354869)
- [特效技术规格](https://docs.volcengine.com/docs/Intelligentbeautificationeffects/Technicalspecifications?lang=zh)
- [特效授权说明](https://docs.volcengine.com/docs/Intelligentbeautificationeffects/Ontheauthorization?lang=zh)

## 流程状态

正在按用户指定的 grill-with-docs 流程访谈，尚未确认完整方案，未开始应用实现。
