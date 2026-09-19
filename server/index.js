import express from 'express'
import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { randomBytes } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { WebSocketServer } from 'ws'
import { createRooms } from './rooms.js'
import { bridgeSpeech } from './speech.js'
import { submitAudioUrl } from './transcribe.js'

const root = fileURLToPath(new URL('../', import.meta.url))
const port = Number(process.env.PORT || 8080)
const app = express()
const server = createServer(app)
const session = randomBytes(32).toString('hex')
const rooms = createRooms()
const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 })
let speechClient
let config = {
  authMode: 'apiKey', asrKey: '', appId: '', accessToken: '',
  resourceId: 'volc.bigasr.sauc.duration', asrMode: 'bigmodel_async',
  punctuation: true, itn: true, vadMs: 800, arkKey: '', model: '', temperature: 0.1,
}
const local = (req) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
function safeOrigin(req) {
  try {
    const url = new URL(req.headers.origin)
    return ['http:', 'https:'].includes(url.protocol) && url.host === req.headers.host
  } catch { return false }
}
function localhostHost(req) {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(`http://${req.headers.host}`).hostname) }
  catch { return false }
}
const authorized = (req) => local(req) && localhostHost(req) && (req.headers.cookie || '').split(';').some(c => c.trim() === `studio_session=${session}`)
const asrReady = () => config.authMode === 'apiKey' ? Boolean(config.asrKey) : Boolean(config.appId && config.accessToken)
const status = () => ({ asr: asrReady(), ark: Boolean(config.arkKey && config.model) })

app.disable('x-powered-by')
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Frame-Options', 'DENY')
  next()
})
app.use(express.json({ limit: '16kb' }))
app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/session', (req, res) => {
  if (!local(req) || !localhostHost(req)) return res.status(403).json({ error: '主播端请在服务器电脑上通过 localhost 打开' })
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Set-Cookie', `studio_session=${session}; HttpOnly; SameSite=Strict; Path=/`)
  res.json({ status: status() })
})
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  if (!authorized(req)) return res.status(403).json({ error: '只有本机主播可以修改设置，请从 localhost 打开' })
  if (req.method !== 'GET' && !safeOrigin(req)) return res.status(403).json({ error: '请求来源无效' })
  next()
})
app.get('/api/config', (_req, res) => {
  const { asrKey, accessToken, arkKey, ...publicConfig } = config
  res.json({ config: publicConfig, status: status() })
})
app.put('/api/config', (req, res) => {
  if (speechClient) return res.status(409).json({ error: '请先停止字幕识别，再修改语音设置' })
  const b = req.body
  if (!b || !['apiKey', 'legacy'].includes(b.authMode) || !['bigmodel', 'bigmodel_async'].includes(b.asrMode)
      || !/^volc\.(bigasr|seedasr)\.sauc\.(duration|concurrent)$/.test(b.resourceId)
      || !Number.isFinite(b.vadMs) || b.vadMs < 200 || b.vadMs > 3000
      || !Number.isFinite(b.temperature) || b.temperature < 0 || b.temperature > 1) {
    return res.status(400).json({ error: '请检查资源 ID、分句时间和模型参数' })
  }
  config = {
    ...config, authMode: b.authMode, asrMode: b.asrMode, resourceId: b.resourceId,
    vadMs: Math.round(b.vadMs), temperature: b.temperature,
    punctuation: Boolean(b.punctuation), itn: Boolean(b.itn),
    appId: String(b.appId || '').trim().slice(0, 128), model: String(b.model || '').trim().slice(0, 200),
  }
  for (const key of ['asrKey', 'accessToken', 'arkKey']) {
    if (typeof b[key] === 'string' && b[key].trim()) config[key] = b[key].trim().slice(0, 4096)
  }
  res.json({ status: status() })
})
app.delete('/api/config', (_req, res) => {
  if (speechClient) return res.status(409).json({ error: '请先停止字幕识别' })
  config.asrKey = config.accessToken = config.arkKey = config.appId = ''
  res.json({ status: status() })
})
app.get('/api/network', (_req, res) => {
  const addresses = Object.values(networkInterfaces()).flat().filter(n => n?.family === 'IPv4' && !n.internal).map(n => `http://${n.address}:${port}`)
  res.json({ addresses, local: `http://localhost:${port}` })
})
app.post('/api/asr/submit', async (req, res) => {
  if (config.authMode !== 'apiKey' || !config.asrKey) return res.status(409).json({ error: '请先在主播端配置新版 X-Api-Key' })
  if (typeof req.body?.audioUrl !== 'string' || req.body.audioUrl.length > 2048) return res.status(400).json({ error: '请提供有效的音频 URL' })
  try {
    const result = await submitAudioUrl({ apiKey: config.asrKey, resourceId: req.body.resourceId || 'volc.seedasr.auc', audioUrl: req.body.audioUrl })
    res.json({ result })
  } catch (error) { res.status(502).json({ error: error.message }) }
})

// Serve pinned SDK assets locally: no CDN fetch is needed when opening the app.
app.use('/vendor/banuba', express.static(path.join(root, 'node_modules/@banuba/webar/dist'), { maxAge: '1d' }))
if (process.argv.includes('--dev')) {
  const { createServer: createViteServer } = await import('vite')
  const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
  app.use(vite.middlewares)
} else {
  app.use(express.static(path.join(root, 'dist')))
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist/index.html')))
}
app.use((err, _req, res, _next) => res.status(400).json({ error: '请求格式无效' }))

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://localhost')
  if (!['/signal', '/speech'].includes(url.pathname)) return
  const deny = (statusCode = 403) => { socket.write(`HTTP/1.1 ${statusCode} Forbidden\r\nConnection: close\r\n\r\n`); socket.destroy() }
  if (!safeOrigin(req)) return deny()
  const host = url.searchParams.get('role') === 'host'
  if ((host || url.pathname === '/speech') && !authorized(req)) return deny()
  if (url.pathname === '/speech' && (!asrReady() || speechClient)) return deny(409)
  wss.handleUpgrade(req, socket, head, (ws) => {
    if (url.pathname === '/speech') {
      speechClient = ws
      ws.on('close', () => { if (speechClient === ws) speechClient = undefined })
      bridgeSpeech(ws, { ...config })
    } else rooms.connect(ws, { host, invite: url.searchParams.get('room') })
    ws.isAlive = true
    ws.on('pong', () => { ws.isAlive = true })
    wss.emit('connection', ws, req)
  })
})
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue }
    ws.isAlive = false
    ws.ping()
  }
}, 15000)
server.listen(port, '0.0.0.0', () => console.log(`映色直播已启动：http://localhost:${port}`))
const shutdown = () => { clearInterval(heartbeat); rooms.close(); for (const ws of wss.clients) ws.terminate(); server.close(); process.exit(0) }
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
