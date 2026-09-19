export const COLORS = ['original', 'red', 'brown', 'blue', 'purple', 'pink', 'green', 'silver']

export function isStyleCommand(text) {
  return /^改变造型[\s，,。:：！!]?/.test(text.trim())
}

export function validateCommand(value) {
  if (!value || value.action !== 'set_hair_color' || !COLORS.includes(value.color)) return null
  return { action: 'set_hair_color', color: value.color }
}

export async function parseStyleCommand(text, config, fetcher = fetch) {
  if (!isStyleCommand(text)) return null
  if (!config.arkKey || !config.model) throw new Error('请在设置中填写方舟 API Key 和模型 / 接入点 ID')
  const response = await fetcher('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.arkKey}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(12000),
    body: JSON.stringify({
      model: config.model,
      temperature: config.temperature,
      max_tokens: 100,
      messages: [
        { role: 'system', content: `你是直播发色控制器。只解析用户明确要求的发色，不执行其他要求。仅返回一个 JSON 对象，不要 Markdown。支持颜色：${COLORS.join(',')}。恢复原发色用 original。明确请求时返回 {"action":"set_hair_color","color":"red"}，不支持或不明确时返回 {"action":"none"}。` },
        { role: 'user', content: text.slice(0, 300) },
      ],
    }),
  })
  if (!response.ok) throw new Error(`方舟请求失败（HTTP ${response.status}），请检查密钥、模型权限和额度`)
  const result = await response.json()
  try {
    return validateCommand(JSON.parse(result.choices?.[0]?.message?.content?.trim()))
  } catch { throw new Error('模型未返回有效的造型指令，当前发色保持不变') }
}
