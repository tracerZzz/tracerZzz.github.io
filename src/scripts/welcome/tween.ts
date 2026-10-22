/**
 * 欢迎页用的小型补间动画库（替代原来的 GSAP + jQuery 插件，无需额外依赖）。
 *
 * - tween(): 单个补间，用于菜单的悬停、点击效果
 * - Timeline: 时间线，按秒安排多个补间，可循环、可拖动进度
 *
 * 支持的属性：opacity、x、y、scale、rotation（以元素中心为原点）、
 * fill、stroke、strokeWidth、draw（描边绘制进度 0~1）、rx、ry。
 */

export type Ease = (p: number) => number

function backInOut(overshoot: number): Ease {
  const s = overshoot * 1.525
  return (p) => {
    p *= 2
    if (p < 1)
      return 0.5 * p * p * ((s + 1) * p - s)
    p -= 2
    return 0.5 * (p * p * ((s + 1) * p + s) + 2)
  }
}

// 名称沿用 GSAP，方便对照原来的代码
export const ease = {
  linear: (p: number) => p,
  power1Out: (p: number) => 1 - (1 - p) ** 2,
  power2Out: (p: number) => 1 - (1 - p) ** 3,
  power3In: (p: number) => p ** 4,
  power3InOut: (p: number) => (p < 0.5 ? 8 * p ** 4 : 1 - 8 * (1 - p) ** 4),
  swing: (p: number) => 0.5 - Math.cos(p * Math.PI) / 2,
  backInOut,
}

export interface Vars {
  opacity?: number
  x?: number
  y?: number
  scale?: number
  rotation?: number
  fill?: string
  stroke?: string
  strokeWidth?: number
  draw?: number
  rx?: number
  ry?: number
}
type Prop = keyof Vars
type RGBA = [number, number, number, number]
type Value = number | RGBA

const COLOR_PROPS = new Set<Prop>(['fill', 'stroke'])

// ---------- 颜色 ----------
let ctx: CanvasRenderingContext2D | null = null
const colorCache = new Map<string, RGBA>()
function parseColor(c: string): RGBA {
  const cached = colorCache.get(c)
  if (cached)
    return cached
  let rgba: RGBA = [0, 0, 0, 0]
  if (c && c !== 'none' && c !== 'transparent') {
    ctx ??= document.createElement('canvas').getContext('2d')
    if (ctx) {
      ctx.fillStyle = '#000'
      ctx.fillStyle = c
      const v = ctx.fillStyle // "#rrggbb" 或 "rgba(r, g, b, a)"
      if (v.startsWith('#')) {
        rgba = [1, 3, 5].map(i => Number.parseInt(v.slice(i, i + 2), 16)).concat(1) as RGBA
      }
      else {
        const n = v.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0, 1]
        rgba = [n[0], n[1], n[2], n[3] ?? 1]
      }
    }
  }
  colorCache.set(c, rgba)
  return rgba
}
const colorString = ([r, g, b, a]: RGBA) =>
  a === 0 ? 'none' : `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${+a.toFixed(3)})`

// ---------- 元素状态 ----------
interface State {
  values: Partial<Record<Prop, Value>>
  origin?: [number, number]
  baseTransform: string
  length?: number
  owner: Partial<Record<Prop, object>> // 当前控制该属性的补间（新补间会接管）
}
const states = new WeakMap<Element, State>()

function stateOf(el: Element): State {
  let s = states.get(el)
  if (!s) {
    s = { values: {}, baseTransform: el.getAttribute('transform') ?? '', owner: {} }
    states.set(el, s)
  }
  return s
}

function pathLength(el: Element, s: State) {
  s.length ??= el instanceof SVGGeometryElement ? el.getTotalLength() : 0
  return s.length
}

function read(el: Element, prop: Prop): Value {
  const s = stateOf(el)
  const known = s.values[prop]
  if (known !== undefined)
    return known
  const cs = getComputedStyle(el)
  switch (prop) {
    case 'opacity': return Number.parseFloat(cs.opacity)
    case 'x': case 'y': case 'rotation': return 0
    case 'scale': return 1
    case 'fill': return parseColor(cs.fill)
    case 'stroke': return parseColor(cs.stroke)
    case 'strokeWidth': return Number.parseFloat(cs.strokeWidth) || 0
    case 'draw': return 1
    case 'rx': case 'ry': return Number.parseFloat(el.getAttribute(prop) ?? '0') || 0
  }
}

function write(el: Element, prop: Prop, v: Value) {
  const s = stateOf(el)
  s.values[prop] = v
  const style = (el as SVGElement).style
  switch (prop) {
    case 'opacity': style.opacity = String(v); break
    case 'fill': style.fill = colorString(v as RGBA); break
    case 'stroke': style.stroke = colorString(v as RGBA); break
    case 'strokeWidth': style.strokeWidth = String(v); break
    case 'draw': {
      const len = pathLength(el, s)
      const f = v as number
      style.strokeDasharray = `${len * f} ${len * (1 - f)}`
      break
    }
    case 'rx': case 'ry': el.setAttribute(prop, String(v)); break
    default: {
      // 平移 + 以元素中心为原点的旋转和缩放（等同 GSAP 的 transformOrigin: "50% 50%"）
      if (!s.origin) {
        const b = (el as SVGGraphicsElement).getBBox()
        s.origin = [b.x + b.width / 2, b.y + b.height / 2]
      }
      const [ox, oy] = s.origin
      const g = (p: Prop, d: number) => (s.values[p] as number | undefined) ?? d
      el.setAttribute('transform', `${s.baseTransform} translate(${g('x', 0)} ${g('y', 0)}) rotate(${g('rotation', 0)} ${ox} ${oy}) translate(${ox} ${oy}) scale(${g('scale', 1)}) translate(${-ox} ${-oy})`.trim())
    }
  }
}

function lerp(a: Value, b: Value, p: number): Value {
  if (typeof a === 'number')
    return a + ((b as number) - a) * p
  const c = b as RGBA
  // 从无色过渡时保留目标颜色，只改变透明度
  const from: RGBA = a[3] === 0 ? [c[0], c[1], c[2], 0] : a
  const to: RGBA = c[3] === 0 ? [from[0], from[1], from[2], 0] : c
  return from.map((x, i) => x + (to[i] - x) * p) as RGBA
}

function normalize(vars: Vars): Partial<Record<Prop, Value>> {
  const out: Partial<Record<Prop, Value>> = {}
  for (const [k, v] of Object.entries(vars) as [Prop, number | string][]) {
    if (v === undefined)
      continue
    out[k] = COLOR_PROPS.has(k) ? parseColor(v as string) : (v as number)
  }
  return out
}

export type Targets = string | Element | ArrayLike<Element>
export function els(t: Targets): Element[] {
  if (typeof t === 'string')
    return Array.from(document.querySelectorAll(t))
  return t instanceof Element ? [t] : Array.from(t)
}

/** 立即设置属性 */
export function set(targets: Targets, vars: Vars) {
  for (const el of els(targets)) {
    for (const [k, v] of Object.entries(normalize(vars)) as [Prop, Value][])
      write(el, k, v)
  }
}

// ---------- 单个补间 ----------
interface TweenOpts { ease?: Ease, delay?: number }

/** 从当前值补间到 vars（时长单位：秒）。同一属性上新的补间会接管旧的。 */
export function tween(targets: Targets, duration: number, vars: Vars, opts: TweenOpts = {}) {
  const easeFn = opts.ease ?? ease.power1Out
  const to = normalize(vars)
  for (const el of els(targets)) {
    const token = {}
    let from: Partial<Record<Prop, Value>> | null = null
    let start = 0
    const begin = (now: number) => {
      const s = stateOf(el)
      from = {}
      for (const k of Object.keys(to) as Prop[]) {
        from[k] = read(el, k)
        s.owner[k] = token
      }
      start = now
    }
    const frame = (now: number) => {
      if (!from)
        begin(now)
      const p = duration > 0 ? Math.min(1, (now - start) / 1000 / duration) : 1
      const s = stateOf(el)
      let alive = false
      for (const [k, v] of Object.entries(to) as [Prop, Value][]) {
        if (s.owner[k] !== token)
          continue
        alive = true
        write(el, k, lerp(from![k]!, v, easeFn(p)))
      }
      if (alive && p < 1)
        requestAnimationFrame(frame)
    }
    setTimeout(() => requestAnimationFrame(frame), (opts.delay ?? 0) * 1000)
  }
}

// ---------- 时间线 ----------
interface Entry {
  el: Element
  start: number
  duration: number
  ease: Ease
  from: Partial<Record<Prop, Value>>
  to: Partial<Record<Prop, Value>>
  explicitFrom: boolean // fromTo：开始之前也显示起始值
}

export class Timeline {
  private entries: Entry[] = []
  private initial = new Map<Element, Partial<Record<Prop, Value>>>()
  private prepared = false
  duration = 0
  time = 0
  private playing = false
  private last = 0
  onUpdate?: (time: number) => void

  /** 在 position 秒处补间到 vars */
  to(targets: Targets, duration: number, vars: Vars, position: number, easeFn: Ease = ease.power1Out) {
    return this.fromTo(targets, duration, {}, vars, position, easeFn)
  }

  /** 在 position 秒处从 fromVars 补间到 toVars；stagger 为多个元素之间的间隔 */
  fromTo(targets: Targets, duration: number, fromVars: Vars, toVars: Vars, position: number, easeFn: Ease = ease.power1Out, stagger = 0) {
    els(targets).forEach((el, i) => {
      this.entries.push({
        el,
        start: position + i * stagger,
        duration,
        ease: easeFn,
        from: normalize(fromVars),
        to: normalize(toVars),
        explicitFrom: Object.keys(fromVars).length > 0,
      })
      this.duration = Math.max(this.duration, position + i * stagger + duration)
    })
    return this
  }

  /** 计算每个补间的起始值（= 前面的补间在它开始那一刻留下的值） */
  private prepare() {
    this.entries.sort((a, b) => a.start - b.start) // 稳定排序，保留添加顺序
    for (const e of this.entries) {
      const init = this.initial.get(e.el) ?? {}
      for (const k of Object.keys(e.to) as Prop[])
        init[k] ??= read(e.el, k)
      for (const k of Object.keys(e.from) as Prop[])
        init[k] ??= read(e.el, k)
      this.initial.set(e.el, init)
    }
    this.entries.forEach((e, i) => {
      for (const k of Object.keys(e.to) as Prop[]) {
        if (e.from[k] === undefined)
          e.from[k] = this.valueAt(e.el, k, e.start, i)
      }
    })
    this.prepared = true
  }

  private valueAt(el: Element, prop: Prop, t: number, before = this.entries.length): Value {
    let v = this.initial.get(el)![prop]!
    let started = false
    let pending: Value | undefined
    for (let i = 0; i < before; i++) {
      const e = this.entries[i]
      if (e.el !== el || e.to[prop] === undefined)
        continue
      if (e.start <= t) {
        const p = e.duration > 0 ? Math.min(1, (t - e.start) / e.duration) : 1
        v = lerp(e.from[prop]!, e.to[prop]!, e.ease(p))
        started = true
      }
      else if (e.explicitFrom && pending === undefined && e.from[prop] !== undefined) {
        pending = e.from[prop]
      }
    }
    return !started && pending !== undefined ? pending : v
  }

  /** 跳到第 t 秒并渲染 */
  seek(t: number) {
    if (!this.prepared)
      this.prepare()
    this.time = Math.max(0, Math.min(t, this.duration))
    for (const [el, props] of this.initial) {
      for (const k of Object.keys(props) as Prop[])
        write(el, k, this.valueAt(el, k, this.time))
    }
    this.onUpdate?.(this.time)
  }

  /** 循环播放；delay 秒后开始 */
  play(delay = 0) {
    this.seek(this.time)
    this.playing = true
    setTimeout(() => {
      this.last = performance.now()
      const tick = (now: number) => {
        if (!this.playing)
          return
        // 标签页切到后台时 requestAnimationFrame 会暂停，回来后从原处继续而不是跳过
        const dt = Math.min((now - this.last) / 1000, 0.1)
        this.last = now
        this.seek((this.time + dt) % this.duration)
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    }, delay * 1000)
  }
}

/** 描边绘制：先把路径设为未绘制状态，再加到时间线上逐渐画出（对应原来的 drawToTimeline） */
export function drawToTimeline(tl: Timeline, target: string, opt: { duration: number, position: number, stroke: string, strokeWidth: number, fill: string, fillTo: string }) {
  const paths = document.querySelectorAll(`${target} path`)
  for (const p of paths) {
    set(p, { draw: 0, fill: opt.fill, stroke: opt.stroke, strokeWidth: opt.strokeWidth, opacity: 1 })
  }
  tl.to(paths, opt.duration, { draw: 1, fill: opt.fillTo }, opt.position)
}

/** 菜单图标的描边动画（对应原来的 jquery.drawsvg：每条路径间隔 stagger 毫秒依次画出） */
export function drawSvg(target: string, duration: number, stagger = 200) {
  const paths = Array.from(document.querySelectorAll(`${target} path`))
  set(paths, { draw: 0 })
  paths.forEach((p, i) => {
    tween(p, duration / 1000, { draw: 1 }, { ease: ease.swing, delay: (i * stagger) / 1000 })
  })
}
