<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { withBase } from 'vitepress'

const props = withDefaults(defineProps<{
  src?: string
  loopSeconds?: number
  portalGlow?: number
  moteDensity?: number
  moteDrift?: number
  kenBurns?: boolean
  /** dark scrim over the plate so hero text stays readable (0-1) */
  scrim?: number
}>(), {
  src: '/altar.png',
  loopSeconds: 20,
  portalGlow: 0.25,
  moteDensity: 0.3,
  moteDrift: 0.3,
  kenBurns: true,
  scrim: 0.42
})

/* mote anchors in image space (x, y, radius) — the exact spots the baked-in
   particles were painted out of, so the live ones land where they belong */
const ANCHORS: [number, number, number][] = [
  [0.5206,0.0921,3.1],[0.5203,0.2014,4.4],[0.5404,0.2037,4.7],[0.6073,0.2162,5.9],[0.6185,0.2273,6.0],
  [0.5242,0.2375,2.0],[0.6031,0.2681,2.9],[0.4924,0.2796,2.9],[0.5573,0.3153,5.4],[0.4591,0.3528,7.2],
  [0.5638,0.3681,1.6],[0.5484,0.3838,6.0],[0.5698,0.3847,6.4],[0.5714,0.3958,4.1],[0.5323,0.4032,6.2],
  [0.363,0.4199,7.4],[0.45,0.419,1.8],[0.4974,0.4292,2.6],[0.5,0.4282,2.4],[0.3878,0.4412,1.6],
  [0.5135,0.4431,2.2],[0.6062,0.4463,5.3],[0.719,0.4514,6.2],[0.5727,0.4569,6.4],[0.4904,0.4593,3.5],
  [0.4906,0.4648,2.2],[0.3849,0.4699,1.8],[0.5029,0.4694,2.7],[0.3927,0.475,6.0],[0.4552,0.4806,1.6],
  [0.5766,0.4889,5.8],[0.5128,0.4898,5.4],[0.5188,0.4931,4.1],[0.4674,0.4949,2.0],[0.5784,0.4949,1.6],
  [0.4708,0.4977,5.0],[0.5096,0.4981,2.9],[0.5857,0.4981,2.0],[0.5849,0.5014,1.8],[0.4724,0.5019,3.7],
  [0.4979,0.5023,2.6],[0.55,0.5079,6.6],[0.5021,0.5079,4.4],[0.2776,0.5236,6.8],[0.5758,0.5241,5.9],
  [0.4823,0.544,3.7],[0.4573,0.5481,5.0],[0.4638,0.5602,3.4],[0.3609,0.4735,4.2],[0.6402,0.4318,4.6],
  [0.4462,0.3712,3.0]
]
const PORTAL = { x: 0.4974, y: 0.4093 }

const canvas = ref<HTMLCanvasElement | null>(null)
let raf = 0, ctx: CanvasRenderingContext2D | null = null, img: HTMLImageElement | null = null
let ready = false, w = 0, h = 0, dpr = 1, t0 = 0
let motes: any[] = []

const rnd = (s: number) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x) }

function buildMotes() {
  const list: any[] = []
  ANCHORS.forEach((a, i) => {
    const d = props.moteDensity
    const copies = d >= 1 ? 1 + (rnd(i + 5) < d - 1 ? 1 : 0) : (rnd(i + 5) < d ? 1 : 0)
    for (let k = 0; k < copies; k++) {
      const s = i * 31 + k * 7
      list.push({
        x: a[0] + (rnd(s + 2) - 0.5) * 0.035 * k,
        y: a[1] + (rnd(s + 3) - 0.5) * 0.05 * k,
        r: a[2] * (0.75 + rnd(s + 4) * 0.6),
        off: rnd(s + 11),
        cycles: 1 + Math.floor(rnd(s + 13) * 2),   // integer -> loop stays seamless
        rise: 0.035 + rnd(s + 17) * 0.11,
        swayA: 0.004 + rnd(s + 19) * 0.016,
        swayN: 1 + Math.floor(rnd(s + 23) * 3),
        twinkleN: 2 + Math.floor(rnd(s + 29) * 4),
        warm: rnd(s + 31),
        pull: rnd(s + 37) * 0.35
      })
    }
  })
  motes = list
}

function resize() {
  const c = canvas.value
  if (!c) return
  dpr = Math.min(window.devicePixelRatio || 1, 2)
  const r = c.getBoundingClientRect()
  w = Math.max(1, Math.round(r.width))
  h = Math.max(1, Math.round(r.height))
  c.width = Math.round(w * dpr)
  c.height = Math.round(h * dpr)
}

function draw(t: number) {
  if (!ctx || !ready || !img) return
  const TAU = Math.PI * 2
  const p = t / props.loopSeconds

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const IW = img.naturalWidth || 1920, IH = img.naturalHeight || 1080
  const zoom = props.kenBurns ? 1.012 + 0.012 * Math.sin(p * TAU - Math.PI / 2) : 1
  const scale = Math.max(w / IW, h / IH) * zoom
  const dw = IW * scale, dh = IH * scale
  const ox = (w - dw) / 2
  const oy = (h - dh) / 2 + (props.kenBurns ? Math.sin(p * TAU) * h * 0.004 : 0)
  const X = (nx: number) => ox + nx * dw
  const Y = (ny: number) => oy + ny * dh
  const U = dh / 1080

  ctx.drawImage(img, ox, oy, dw, dh)
  ctx.globalCompositeOperation = 'lighter'

  const swell = 0.5 + 0.5 * Math.sin(p * TAU - Math.PI / 2)
  const flick = 0.5 + 0.3 * Math.sin(p * TAU * 7) + 0.2 * Math.sin(p * TAU * 11 + 1.1)
  const gI = props.portalGlow
  const px = X(PORTAL.x), py = Y(PORTAL.y)
  const halo = ctx.createRadialGradient(px, py, 12 * U, px, py, 330 * U)
  halo.addColorStop(0, `rgba(255,72,48,${(0.16 + swell * 0.10) * gI})`)
  halo.addColorStop(0.35, `rgba(226,32,26,${(0.07 + swell * 0.05) * gI})`)
  halo.addColorStop(1, 'rgba(180,20,20,0)')
  ctx.fillStyle = halo
  ctx.beginPath(); ctx.arc(px, py, 330 * U, 0, TAU); ctx.fill()

  const cxx = X(0.4885), cyy = Y(0.4093)
  const core = ctx.createRadialGradient(cxx, cyy, 0, cxx, cyy, 46 * U)
  core.addColorStop(0, `rgba(255,226,214,${(0.30 + flick * 0.30) * gI})`)
  core.addColorStop(0.25, `rgba(255,96,64,${(0.18 + flick * 0.16) * gI})`)
  core.addColorStop(1, 'rgba(220,30,24,0)')
  ctx.fillStyle = core
  ctx.beginPath(); ctx.arc(cxx, cyy, 46 * U, 0, TAU); ctx.fill()

  for (const m of motes) {
    const ph = (p * m.cycles + m.off) % 1
    const fade = Math.pow(Math.sin(ph * Math.PI), 0.7)
    const twk = 0.72 + 0.28 * Math.sin(ph * TAU * m.twinkleN + m.off * 9)
    const a = fade * twk
    if (a <= 0.01) continue
    const nx = m.x + Math.sin(ph * TAU * m.swayN + m.off * 12) * m.swayA + (PORTAL.x - m.x) * m.pull * ph * 0.35
    const ny = m.y - ph * m.rise * props.moteDrift
    const x = X(nx), y = Y(ny)
    const r = m.r * U * 0.5 * (0.85 + fade * 0.3)
    const hue = 356 + m.warm * 14
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, r * 3.4)
    g2.addColorStop(0, `hsla(${hue},100%,${80 - m.warm * 14}%,${0.9 * a})`)
    g2.addColorStop(0.26, `hsla(${hue},100%,55%,${0.55 * a})`)
    g2.addColorStop(0.58, `hsla(${hue - 4},98%,44%,${0.16 * a})`)
    g2.addColorStop(1, `hsla(${hue - 6},95%,40%,0)`)
    ctx.fillStyle = g2
    ctx.beginPath(); ctx.arc(x, y, r * 3.4, 0, TAU); ctx.fill()
  }

  for (let i = 0; i < 26; i++) {
    const seed = rnd(i + 91)
    const ph = (p * 2 + seed) % 1
    const fade = Math.sin(ph * Math.PI)
    const spread = 0.02 + seed * 0.075
    const side = seed > 0.5 ? 1 : -1
    const nx = PORTAL.x + side * spread * (0.3 + ph) + Math.sin(ph * TAU * 2 + i) * 0.006
    const ny = PORTAL.y - 0.02 - ph * (0.10 + seed * 0.16)
    const x = X(nx), y = Y(ny)
    const r = (0.9 + seed * 1.6) * U
    ctx.fillStyle = `hsla(${358 + seed * 12},100%,${72 + seed * 16}%,${0.6 * fade})`
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill()
    ctx.fillStyle = `hsla(0,95%,50%,${0.16 * fade})`
    ctx.beginPath(); ctx.arc(x, y, r * 3.2, 0, TAU); ctx.fill()
  }

  ctx.globalCompositeOperation = 'source-over'
}

function loop(now: number) {
  raf = requestAnimationFrame(loop)
  if (document.hidden) return
  draw(((now - t0) / 1000) % props.loopSeconds)
}

onMounted(() => {
  const c = canvas.value
  if (!c) return
  ctx = c.getContext('2d')
  buildMotes()
  img = new Image()
  img.onload = () => { ready = true; draw(0) }
  img.src = withBase(props.src)
  t0 = performance.now()
  resize()
  window.addEventListener('resize', resize)
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const once = () => { if (ready) draw(0); else requestAnimationFrame(once) }
    requestAnimationFrame(once)
  } else {
    raf = requestAnimationFrame(loop)
  }
})

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  window.removeEventListener('resize', resize)
})
</script>

<template>
  <div class="portal-bg-root" aria-hidden="true">
    <canvas ref="canvas" class="portal-bg-canvas"></canvas>
    <div class="portal-bg-scrim" :style="{ opacity: scrim }"></div>
  </div>
</template>

<style scoped>
.portal-bg-root {
  position: fixed;
  left: 0;
  right: 0;
  top: var(--vp-nav-height, 64px);
  height: calc(100vh - var(--vp-nav-height, 64px));
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background: #050406;
}
.portal-bg-canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
}
.portal-bg-scrim {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(115% 75% at 50% 42%, rgba(0, 0, 0, 0) 40%, rgba(3, 2, 4, 0.75) 100%),
    linear-gradient(180deg, rgba(5, 4, 6, 0.35) 0%, rgba(5, 4, 6, 0.1) 40%, rgba(5, 4, 6, 0.85) 100%);
}
</style>
