/**
 * 欢迎页的挂载 / 卸载（由 astro.config.mjs 注入到每个页面）。
 *
 * 欢迎页套在博客的页面框架里，swup 切换页面时只替换内容区域，所以播放器不销毁、音乐不中断。
 * 但这样欢迎页的脚本不会随页面重新执行，于是由这里负责：
 * - 页面里出现 #welcome-root 时：把它移到 <body> 下（避免内容区域的 transform 影响全屏定位），启动动画；
 * - 离开欢迎页时：先淡出，新内容换上后停掉动画、移除欢迎页。
 */

type Cleanup = () => void
let cleanup: Cleanup | null = null

// 从博客切换到欢迎页时的黑色遮罩：切换一开始就盖上，挡住下载等待和横幅收缩；欢迎页铺满窗口后撤掉
function showCover() {
  if (document.getElementById('wl-cover'))
    return
  const cover = document.createElement('div')
  cover.id = 'wl-cover'
  // 博客页面上没有欢迎页的样式表，样式直接写在元素上
  cover.style.cssText = 'position:fixed;inset:0;z-index:9998;background:#000;pointer-events:none'
  document.body.append(cover)
  cover.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150, easing: 'ease' })
}

function hideCover() {
  document.getElementById('wl-cover')?.remove()
}

async function mountIfPresent() {
  const root = document.getElementById('welcome-root')
  if (!root || cleanup)
    return
  document.body.append(root)
  hideCover() // 欢迎页已经铺满窗口（背景不透明），遮罩可以撤了
  cleanup = () => {} // 占位，防止重复挂载
  const { mountWelcome } = await import('./index')
  cleanup = mountWelcome()
}

function unmount() {
  cleanup?.()
  cleanup = null
  document.getElementById('welcome-root')?.remove()
}

type SwupHooks = { on: (name: string, fn: (visit: { to: { url: string } }) => void, opts?: { before?: boolean }) => void }

function hookSwup(swup: { hooks: SwupHooks }) {
  // 离开欢迎页：开始切换时淡出
  swup.hooks.on('visit:start', (visit) => {
    const toWelcome = new URL(visit.to.url, location.href).pathname.startsWith('/welcome')
    const root = document.getElementById('welcome-root')
    if (root && !toWelcome)
      root.classList.add('leaving')
    // 进入欢迎页：先盖上黑色遮罩
    if (!root && toWelcome)
      showCover()
  })
  // 切换结束（包括失败、被打断）时，确保遮罩不会一直留着
  swup.hooks.on('visit:end', hideCover)
  // 新内容换上之后：移除旧的欢迎页；如果新页面就是欢迎页，再挂载
  swup.hooks.on('content:replace', () => {
    const fresh = document.querySelector('#swup-container #welcome-root')
    if (cleanup && !fresh)
      unmount()
    void mountIfPresent()
  })
}

void mountIfPresent()

// swup 是在页面空闲时才初始化的（比这个脚本晚），等它就绪再注册钩子
const w = window as unknown as { swup?: { hooks: SwupHooks } }
let hooked = false
function tryHook() {
  if (hooked || !w.swup?.hooks)
    return false
  hooked = true
  hookSwup(w.swup)
  return true
}
if (!tryHook()) {
  document.addEventListener('swup:enable', tryHook, { once: true })
  const timer = window.setInterval(() => {
    if (tryHook())
      clearInterval(timer)
  }, 200)
  setTimeout(() => clearInterval(timer), 30000)
}
