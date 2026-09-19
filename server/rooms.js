import { randomBytes, randomUUID } from 'node:crypto'
import WebSocket from 'ws'

export function createRooms() {
  let room
  const send = (ws, type, value = {}) => {
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...value }))
  }
  const counts = () => send(room?.host, 'viewers', { count: room?.viewers.size || 0 })
  function connect(ws, { host, invite }) {
    if (host) {
      if (room) { send(ws, 'error', { message: '已有主播正在直播，请先结束原直播' }); ws.close(); return }
      room = { id: randomBytes(18).toString('hex'), host: ws, viewers: new Map() }
      send(ws, 'room', { id: room.id })
      ws.on('close', () => {
        if (room?.host !== ws) return
        for (const viewer of room.viewers.values()) { send(viewer, 'ended'); viewer.close() }
        room = undefined
      })
    } else {
      if (!room || invite !== room.id) { send(ws, 'error', { message: '直播已结束或观看链接无效' }); ws.close(); return }
      if (room.viewers.size >= 3) { send(ws, 'error', { message: '观看人数已满（最多 3 人）' }); ws.close(); return }
      ws.peerId = randomUUID()
      room.viewers.set(ws.peerId, ws)
      send(ws, 'joined', { id: ws.peerId })
      send(room.host, 'viewer-joined', { id: ws.peerId })
      counts()
      ws.on('close', () => {
        if (!room?.viewers.delete(ws.peerId)) return
        send(room.host, 'viewer-left', { id: ws.peerId })
        counts()
      })
    }
    ws.on('message', (buffer, binary) => {
      if (binary || !room) return
      try {
        const msg = JSON.parse(buffer.toString())
        if (!['offer', 'answer', 'ice', 'disconnect'].includes(msg.type)) return
        if (host) {
          const viewer = room.viewers.get(msg.to)
          if (msg.type === 'disconnect') { viewer?.close(); return }
          if (!['offer', 'ice'].includes(msg.type)) return
          send(viewer, msg.type, { data: msg.data })
        } else {
          if (!['answer', 'ice'].includes(msg.type)) return
          send(room.host, msg.type, { from: ws.peerId, data: msg.data })
        }
      } catch { send(ws, 'error', { message: '直播连接消息无效' }) }
    })
    ws.on('error', () => ws.close())
  }
  return { connect, close() { room?.host.close(); for (const v of room?.viewers.values() || []) v.close() } }
}
