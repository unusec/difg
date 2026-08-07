import DefaultTheme from 'vitepress/theme'
import { h } from 'vue'
import { useData } from 'vitepress'
import InSiteEditor from './components/InSiteEditor.vue'
import PortalBackground from './components/PortalBackground.vue'
import './custom.css'
import './conversion.css'

export default {
  extends: DefaultTheme,
  Layout() {
    const { frontmatter } = useData()
    return h(DefaultTheme.Layout, null, {
      'layout-top': () => (frontmatter.value.layout === 'home' ? h(PortalBackground) : null),
      'doc-after': () => h(InSiteEditor)
    })
  }
}