/**
 * 整页跳转后接着播放音乐（博客 ↔ 欢迎页、刷新页面）。
 *
 * 博客内部切换页面时，swup 只替换内容区域，播放器一直在，本来就不会中断。
 * 但进出欢迎页、按 F5 刷新都是整页重新加载，播放器会重建。这里在离开页面前
 * 把"第几首、播到哪、是否在播放"存到 sessionStorage，新页面的播放器就绪后再恢复。
 *
 * 播放器是主题自带的（window.__fireflyMusic，见 src/components/features/MusicManager.astro），
 * 本文件不改主题代码，只调用它公开的接口。由 astro.config.mjs 注入到每个页面。
 */

const KEY = 'tz-music-resume'
const MAX_AGE = 30 * 60 * 1000 // 超过 30 分钟就不恢复了

interface Saved {
  index: number
  time: number
  playing: boolean
  at: number
}

function save() {
  const music = window.__fireflyMusic
  if (!music)
    return
  const s = music.getState()
  if (!s.initialized || !s.track)
    return
  const saved: Saved = { index: s.currentIndex, time: s.currentTime, playing: s.isPlaying, at: Date.now() }
  try {
    sessionStorage.setItem(KEY, JSON.stringify(saved))
  }
  catch {
    // 隐私模式等情况下存不了，就不恢复
  }
}

function readSaved(): Saved | null {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || 'null') as Saved | null
    return saved && Date.now() - saved.at < MAX_AGE ? saved : null
  }
  catch {
    return null
  }
}

function restore(saved: Saved) {
  const music = window.__fireflyMusic!
  const s = music.getState()
  if (saved.index >= s.playlist.length)
    return
  // 离开前在播放就接着播；浏览器不允许自动播放时，等访客点播放后再跳到原来的进度
  music.loadTrack(saved.index, saved.playing)
  if (saved.time > 1) {
    const jump = () => {
      if (music.getState().duration > 0) {
        music.seekToTime(saved.time)
        window.removeEventListener('fm:time', jump)
      }
    }
    window.addEventListener('fm:time', jump)
  }
}

function start() {
  const music = window.__fireflyMusic
  if (!music)
    return
  window.addEventListener('pagehide', save)

  const saved = readSaved()
  if (!saved)
    return
  if (music.getState().initialized) {
    restore(saved)
  }
  else {
    // 播放器初始化时会先发 fm:init 再加载第一首，所以晚一拍再恢复，免得被它覆盖
    window.addEventListener('fm:init', () => setTimeout(() => restore(saved), 0), { once: true })
    void music.init()
  }
}

start()
