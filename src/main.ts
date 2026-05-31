import { createApp } from "vue"
import { createPinia } from "pinia"
import router from "./router"
import App from "./App.vue"

/* Font Awesome 7 */
import "@fortawesome/fontawesome-free/css/all.css"

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)
app.mount("#app")

// ========== Deep Link 统一登录回调处理 ==========
async function setupDeepLink() {
  try {
    const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link')

    // 处理应用启动时通过 deep link 唤起的情况
    const currentUrls = await getCurrent()
    if (currentUrls) {
      handleDeepLinkUrls(currentUrls)
    }

    // 监听应用运行时的 deep link
    await onOpenUrl((urls) => {
      handleDeepLinkUrls(urls)
    })
  } catch {
    // 非 Tauri 环境，忽略
  }
}

function handleDeepLinkUrls(urls: string[]) {
  for (const url of urls) {
    if (url.includes('login/callback') || url.includes('token=') || url.includes('code=')) {
      const params = parseDeepLinkParams(url)
      const token = params.token || params.code
      if (token) {
        const userInfo = {
          name: '统一登录用户',
          avatar: 'U',
          phone: '',
          plan: 'Pro plus 方案',
          loginAt: Date.now()
        }
        localStorage.setItem('aipcowork_auth', JSON.stringify(userInfo))
        router.replace('/new-task')
      }
    }
  }
}

function parseDeepLinkParams(url: string): Record<string, string> {
  try {
    const queryIndex = url.indexOf('?')
    if (queryIndex === -1) return {}
    const search = url.slice(queryIndex + 1)
    const params = new URLSearchParams(search)
    const result: Record<string, string> = {}
    for (const [key, value] of params) {
      result[key] = value
    }
    return result
  } catch {
    return {}
  }
}

setupDeepLink()
