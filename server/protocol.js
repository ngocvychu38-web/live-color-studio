import { gzipSync, gunzipSync } from 'node:zlib'

export function encodeRequest(data, audio = false, last = false) {
  const payload = gzipSync(audio ? data : Buffer.from(JSON.stringify(data)))
  const header = Buffer.from([0x11, (audio ? 0x20 : 0x10) | (last ? 2 : 0), audio ? 0x01 : 0x11, 0])
  const size = Buffer.alloc(4)
  size.writeUInt32BE(payload.length)
  return Buffer.concat([header, size, payload])
}

export function decodeResponse(buffer) {
  if (buffer.length < 8 || buffer[0] >> 4 !== 1) throw new Error('语音服务返回了无效数据包')
  const type = buffer[1] >> 4
  const flags = buffer[1] & 15
  let offset = (buffer[0] & 15) * 4
  if (offset < 4 || offset > buffer.length - 4) throw new Error('语音数据包头部无效')
  let code
  if (type === 15) {
    code = buffer.readUInt32BE(offset)
    offset += 4
  } else if (flags & 1) offset += 4
  if (offset + 4 > buffer.length) throw new Error('语音数据包不完整')
  const size = buffer.readUInt32BE(offset)
  offset += 4
  if (offset + size !== buffer.length) throw new Error('语音数据包长度不匹配')
  let payload = buffer.subarray(offset)
  if ((buffer[2] & 15) === 1) payload = gunzipSync(payload, { maxOutputLength: 2 * 1024 * 1024 })
  if (type === 15) throw new Error(`语音服务错误 ${code}：${payload.toString().slice(0, 240)}`)
  if (type !== 9) throw new Error('未知语音响应类型')
  return { data: JSON.parse(payload.toString()), last: Boolean(flags & 2) }
}

// Track timestamps, not text: saying the same instruction again later is valid.
export class UtteranceTracker {
  seen = new Set()
  consume(data) {
    const result = Array.isArray(data.result) ? data.result.at(-1) : data.result
    const utterances = result?.utterances || []
    const finalized = []
    for (const u of utterances) {
      if (!u.definite || !u.text) continue
      const id = `${u.start_time}:${u.end_time}`
      if (this.seen.has(id)) continue
      this.seen.add(id)
      finalized.push({ id, text: u.text })
    }
    if (this.seen.size > 1000) this.seen = new Set([...this.seen].slice(-500))
    return { text: utterances.at(-1)?.text || result?.text || '', finalized }
  }
}
