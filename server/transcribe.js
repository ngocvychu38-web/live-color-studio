import { randomUUID } from 'node:crypto'

const ENDPOINT = 'https://openspeech.bytedance.com/api/v3/auc/bigmodel/submit'

export async function submitAudioUrl({ apiKey, resourceId, audioUrl, request = {} }) {
  if (!apiKey) throw new Error('未配置火山 ASR API Key')
  let parsed
  try { parsed = new URL(audioUrl) } catch { throw new Error('音频 URL 无效') }
  if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('音频 URL 必须是 HTTP(S) 地址')
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': apiKey,
      'X-Api-Resource-Id': resourceId || 'volc.seedasr.auc',
      'X-Api-Request-Id': randomUUID(),
      'X-Api-Sequence': '-1',
    },
    body: JSON.stringify({
      user: { uid: '映色直播' },
      audio: { url: audioUrl, format: 'mp3', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
      request: {
        model_name: 'bigmodel', enable_itn: true, enable_punc: false,
        enable_ddc: false, enable_speaker_info: false, enable_channel_split: false,
        show_utterances: false, vad_segment: false, sensitive_words_filter: '', ...request,
      },
    }),
    signal: AbortSignal.timeout(20000),
  })
  const text = await response.text()
  let data
  try { data = JSON.parse(text) } catch { throw new Error(`火山接口返回了非 JSON（HTTP ${response.status}）`) }
  if (!response.ok) throw new Error(`火山语音提交失败（HTTP ${response.status}）：${data.message || data.error || text.slice(0, 160)}`)
  return data
}
