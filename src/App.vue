<script setup>
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'

const role = ref(new URLSearchParams(location.search).get('role') === 'viewer' ? 'viewer' : 'host')
const savedSettings = JSON.parse(localStorage.getItem('映色直播设置') || '{}')
const token = ref(savedSettings.token || '')
const room = ref('')
const status = ref('等待配置')
const transcript = ref('欢迎使用映色直播工作台')
const color = ref(savedSettings.color || 'original')
const customColor = ref(savedSettings.customColor || '#c4574b')
const colorStrength = ref(savedSettings.colorStrength ?? 75)
const live = ref(false)
const stage = ref(null)
const banubaReady = ref(false)
let banubaPlayer
let banubaEffect
const video = ref(null)
const speechOn = ref(false)
let mediaStream
let audioContext
let processor
let speechSocket
let browserRecognition
const colors = [{ id: 'original', label: '原色', hex: '#d8d2c8' }, { id: 'red', label: '红棕', hex: '#c4574b' }, { id: 'blue', label: '冷蓝', hex: '#597a9b' }, { id: 'purple', label: '紫罗兰', hex: '#826a9b' }]
const inviteUrl = computed(() => room.value ? `${location.origin}${location.pathname}?role=viewer&room=${room.value}` : '')

async function openCamera() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true })
    if (video.value) { video.value.srcObject = mediaStream; await video.value.play() }
    await startBanuba()
    live.value = true; status.value = '摄像头已就绪'
  }
  catch { status.value = '无法访问摄像头，请检查浏览器权限' }
}
async function startBanuba() {
  if (!token.value || !stage.value) return
  try {
    const loadBanuba = new Function('url', 'return import(url)')
    const { Player, Module, Effect, Video, Dom } = await loadBanuba('/BanubaSDK.browser.esm.js')
    banubaPlayer = await Player.create({ clientToken: token.value, devicePixelRatio: 1, locateFile: '/' })
    const modules = await Promise.all(['face_tracker', 'hair'].map(name => Module.preload(`/banuba-modules/${name}.zip`)))
    await banubaPlayer.addModule(...modules)
    banubaEffect = await Effect.preload('/effects/Makeup_new_morphs.zip')
    await banubaPlayer.applyEffect(banubaEffect)
    banubaPlayer.use(new Video(mediaStream))
    Dom.render(banubaPlayer, stage.value)
    banubaReady.value = true
    status.value = 'Banuba Web AR 已连接 · 实时头发分割'
  } catch (error) {
    console.warn('Banuba 初始化失败', error)
    status.value = 'Banuba 初始化失败，已使用摄像头画面'
  }
}
function downsample(input, fromRate, toRate) {
  if (fromRate === toRate) return input
  const ratio = fromRate / toRate; const length = Math.round(input.length / ratio); const output = new Int16Array(length)
  for (let i = 0; i < length; i++) { const start = Math.floor(i * ratio); const end = Math.min(Math.floor((i + 1) * ratio), input.length); let sum = 0; for (let j = start; j < end; j++) sum += input[j]; output[i] = Math.max(-1, Math.min(1, sum / Math.max(1, end - start))) * 0x7fff }
  return output
}
async function startSpeech() {
  if (!mediaStream) return
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
  if (SpeechRecognition) {
    browserRecognition = new SpeechRecognition()
    browserRecognition.lang = 'zh-CN'; browserRecognition.continuous = true; browserRecognition.interimResults = true
    browserRecognition.onresult = (event) => { const result = event.results[event.results.length - 1]; const text = result[0]?.transcript?.trim(); if (text) { transcript.value = text; applyFromSpeech(text) } }
    browserRecognition.onerror = () => { /* 火山连接仍可继续 */ }
    browserRecognition.onend = () => { if (speechOn.value && live.value) { try { browserRecognition.start() } catch {} } }
    try { browserRecognition.start(); speechOn.value = true; status.value = '直播中 · 浏览器语音识别已连接' } catch {}
  }
  try {
    await fetch('/api/session')
    const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/speech`)
    speechSocket = socket
    socket.onopen = () => { speechOn.value = true; status.value = '直播中 · 语音识别已连接' }
    socket.onmessage = (event) => { const msg = JSON.parse(event.data); if (msg.type === 'transcript' && msg.text) { transcript.value = msg.text; applyFromSpeech(msg.text) }; if (msg.type === 'error') { status.value = msg.message; speechOn.value = false } }
    socket.onerror = () => { if (!browserRecognition) { status.value = '语音识别连接失败，请配置 ASR Key'; speechOn.value = false } }
    audioContext = new AudioContext()
    const source = audioContext.createMediaStreamSource(mediaStream)
    processor = audioContext.createScriptProcessor(4096, 1, 1)
    processor.onaudioprocess = (event) => { if (socket.readyState !== WebSocket.OPEN) return; socket.send(downsample(event.inputBuffer.getChannelData(0), audioContext.sampleRate, 16000).buffer) }
    source.connect(processor); processor.connect(audioContext.destination)
  } catch { status.value = '语音识别连接失败，请检查 ASR 配置' }
}
async function start() {
  await openCamera()
  if (live.value) { room.value = crypto.randomUUID().slice(0, 8); status.value = '直播中 · 正在连接语音识别'; await startSpeech() }
}
function hexToRgba(hex, strength = colorStrength.value) { const value = hex.replace('#', ''); const n = Number.parseInt(value, 16); return `${((n >> 16) & 255) / 255} ${((n >> 8) & 255) / 255} ${(n & 255) / 255} ${strength / 100}` }
async function applyCustom() { color.value = 'custom'; transcript.value = `造型已切换为 ${customColor.value}`; if (banubaEffect) { try { await banubaEffect.evalJs(`Hair.color("${hexToRgba(customColor.value)}")`) } catch {} } }
async function apply(c) { color.value = c.id; transcript.value = `造型已切换为${c.label}`; if (c.id === 'original') { if (banubaEffect) try { await banubaEffect.evalJs('Hair.color("0 0 0 0")') } catch {}; return } customColor.value = c.hex; await applyCustom() }
function applyFromSpeech(text) { const found = text.includes('红') ? 'red' : text.includes('蓝') ? 'blue' : text.includes('紫') ? 'purple' : text.includes('原') ? 'original' : null; if (found) apply(colors.find(c => c.id === found)) }
watch([token, color, customColor, colorStrength], () => localStorage.setItem('映色直播设置', JSON.stringify({ token: token.value, color: color.value, customColor: customColor.value, colorStrength: colorStrength.value })))
watch([customColor, colorStrength], () => { if (live.value) applyCustom() })
onMounted(() => { if (role.value === 'viewer') status.value = '正在连接主播画面' })
onBeforeUnmount(() => { browserRecognition?.stop(); processor?.disconnect(); audioContext?.close(); speechSocket?.close(); banubaPlayer?.destroy(); mediaStream?.getTracks().forEach(track => track.stop()) })
</script>

<template>
  <div class="app-shell">
    <header class="topbar"><div class="brand"><span class="brand-mark">◉</span><span>映色</span><small>LIVE STUDIO</small></div><div class="top-actions"><span class="live-dot" :class="{on: live}"></span>{{ status }}<button class="ghost" @click="role = role === 'host' ? 'viewer' : 'host'">{{ role === 'host' ? '观众预览' : '主播模式' }}</button></div></header>
    <main class="workspace">
      <section class="stage-wrap">
        <div ref="stage" class="stage" :class="`hair-${color}`"><div class="stage-grid"></div><video ref="video" class="camera-video" muted playsinline></video><div class="hair-tint"></div><div v-if="!live" class="camera-placeholder"><div class="avatar"><div class="hair"></div><div class="face"><span class="eye e1"></span><span class="eye e2"></span><span class="mouth"></span></div><div class="shoulders"></div></div></div><div class="speech-bubble">{{ transcript }}</div><div class="stage-label">{{ role === 'host' ? '主播预览' : '正在观看' }} <span>{{ speechOn ? '语音识别中' : '等待摄像头' }}</span></div></div>
        <div class="stage-footer"><div><span class="signal"></span> 局域网直播 <b v-if="room">· 房间 {{ room }}</b></div><div class="url" v-if="inviteUrl">观看地址：{{ inviteUrl }}</div></div>
      </section>
      <aside class="control-panel" v-if="role === 'host'">
        <div class="panel-head"><span>控制台</span><span class="secure">● 本机配置</span></div>
        <button class="start-btn" :class="{active: live}" @click="start"><span>◉</span>{{ live ? '正在直播' : '开始直播' }}</button>
        <div class="section"><h3>实时造型</h3><p>可选择预设颜色，也可输入任意颜色；Banuba 会把颜色应用到头发分割蒙版。</p><div class="swatches"><button v-for="c in colors" :key="c.id" :class="{selected: color === c.id && customColor === c.hex}" @click="apply(c)"><i :style="{background:c.hex}"></i>{{ c.label }}</button></div><div class="custom-color"><label>任意颜色 <input v-model="customColor" type="color" @input="applyCustom" /></label><input v-model="customColor" class="hex-input" maxlength="7" @change="applyCustom" /><label>染色强度 {{ colorStrength }}%<input v-model.number="colorStrength" type="range" min="10" max="100" step="5" /></label></div></div>
        <div class="section settings"><h3>服务参数</h3><label>Banuba Client Token<input v-model="token" type="password" placeholder="粘贴试用 Token" /></label><label>火山 ASR 资源 ID<input value="volc.bigasr.sauc.duration" /></label><label>方舟模型 / 接入点<input placeholder="ep-xxxxxxxx" /></label></div>
        <div class="hint">Token 仅保存在本机浏览器内存中。正式接入 Banuba 后，发色效果将在主播端实时处理。</div>
      </aside>
      <aside class="control-panel viewer-panel" v-else><div class="panel-head"><span>观看信息</span><span class="secure">● LAN</span></div><div class="viewer-count">01 <small>/ 03</small></div><p>主播正在进行实时造型直播</p><div class="section"><h3>当前字幕</h3><div class="subtitle-card">{{ transcript }}</div></div></aside>
    </main>
    <footer><span>映色工作台 v0.1</span><span>Banuba Web AR · 火山引擎 ASR · WebRTC</span></footer>
  </div>
</template>
