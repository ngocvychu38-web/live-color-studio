import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { encodeRequest, decodeResponse, UtteranceTracker } from './protocol.js'
import { parseStyleCommand, isStyleCommand } from './commands.js'

export function bridgeSpeech(client, config) {
  const send = (type, value = {}) => {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify({ type, ...value }))
  }
  const headers = {
    'X-Api-Resource-Id': config.resourceId,
    'X-Api-Connect-Id': randomUUID(),
  }
  if (config.authMode === 'apiKey') headers['X-Api-Key'] = config.asrKey
  else {
    headers['X-Api-App-Key'] = config.appId
    headers['X-Api-Access-Key'] = config.accessToken
  }
  const upstream = new WebSocket(`wss://openspeech.bytedance.com/api/v3/sauc/${config.asrMode}`, {
    headers, handshakeTimeout: 12000, maxPayload: 2 * 1024 * 1024,
  })
  let active = true
  let stopped = false
  let closeTimer
  let commandQueue = Promise.resolve()
  const tracker = new UtteranceTracker()
  const fail = (message) => {
    send('error', { message })
    upstream.close()
    client.close()
  }
  upstream.on('open', () => {
    upstream.send(encodeRequest({
      user: { uid: randomUUID() },
      audio: { format: 'pcm', codec: 'raw', rate: 16000, bits: 16, channel: 1 },
      request: {
        model_name: 'bigmodel', enable_itn: config.itn, enable_punc: config.punctuation,
        show_utterances: true, result_type: 'full', end_window_size: config.vadMs,
      },
    }))
    send('ready')
  })
  client.on('message', (data, binary) => {
    if (upstream.readyState !== WebSocket.OPEN || stopped) return
    if (binary) {
      if (data.length > 32000 || data.length % 2) return fail('音频数据格式错误')
      if (upstream.bufferedAmount > 256000) return fail('语音上传拥堵，请停止字幕后重试')
      upstream.send(encodeRequest(data, true))
    } else {
      try {
        if (JSON.parse(data).type === 'stop') {
          stopped = true
          upstream.send(encodeRequest(Buffer.alloc(0), true, true))
          closeTimer = setTimeout(() => upstream.close(), 3000)
        }
      } catch { fail('无效语音控制消息') }
    }
  })
  upstream.on('message', (data) => {
    try {
      const response = decodeResponse(data)
      const { text, finalized } = tracker.consume(response.data)
      if (text) send('transcript', { text, final: false })
      for (const item of finalized) {
        send('transcript', { ...item, final: true })
        if (!isStyleCommand(item.text)) continue
        commandQueue = commandQueue.then(async () => {
          if (!active) return
          send('command-pending', { text: item.text })
          try {
            const command = await parseStyleCommand(item.text, config)
            if (active) send('command', { command, text: item.text })
          } catch (e) { if (active) send('command-error', { message: e.message }) }
        })
      }
      if (response.last) upstream.close()
    } catch (e) { fail(e.message) }
  })
  upstream.on('unexpected-response', (_req, res) => {
    res.resume()
    fail(`语音服务鉴权失败（HTTP ${res.statusCode}），请检查语音凭证和资源 ID`)
  })
  upstream.on('error', () => fail('无法连接火山语音服务，请检查网络及凭证'))
  upstream.on('close', () => { clearTimeout(closeTimer); send('closed'); client.close() })
  client.on('close', () => { active = false; clearTimeout(closeTimer); upstream.close() })
  client.on('error', () => upstream.close())
}
