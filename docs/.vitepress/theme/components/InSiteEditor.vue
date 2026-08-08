<template>
  <div class="in-site-editor-container">
    <button class="in-site-editor-trigger" @click="openEditor">
      ✏️ Edit / Suggest Change directly on site
    </button>

    <Teleport to="body">
      <div v-if="isOpen" class="editor-modal-backdrop" @click.self="closeEditor">
        <div class="editor-modal-content">
          <div class="editor-header">
            <h3>✏️ Suggest Edit — {{ pageTitle }}</h3>
            <button class="editor-close-btn" @click="closeEditor">&times;</button>
          </div>

          <div class="editor-body">
            <p class="editor-hint">
              Edit the markdown below. Your changes go to the Discord moderation queue before going live.
            </p>

            <div class="editor-meta-row">
              <div class="editor-input-group">
                <label>Your Name / Discord Handle</label>
                <input v-model="author" type="text" placeholder="@PetMaster99 or Anonymous" />
              </div>
              <div class="editor-input-group">
                <label>Brief Description of Change</label>
                <input v-model="summary" type="text" placeholder="e.g. Added Varog trait stacking details" />
              </div>
            </div>

            <div class="editor-input-group editor-content-group">
              <label>Page Markdown</label>
              <textarea v-model="content" class="editor-content-area" spellcheck="false"></textarea>
            </div>

            <div v-if="submitted" class="editor-success">
              🎉 <strong>Thank you!</strong> Your suggestion has been submitted for mod review!
            </div>
          </div>

          <div class="editor-footer">
            <button class="editor-cancel-btn" @click="closeEditor">Cancel</button>
            <button class="editor-submit-btn" :disabled="submitting" @click="submitEdit">
              {{ submitting ? 'Submitting…' : 'Submit for Mod Review' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useData } from 'vitepress'

const { page } = useData()

const isOpen = ref(false)
const submitting = ref(false)
const submitted = ref(false)

const author = ref('')
const summary = ref('')
const content = ref('')

const pageTitle = computed(() => page.value.title || page.value.relativePath)

function openEditor() {
  isOpen.value = true
  submitted.value = false
  content.value = page.value.rawMarkdown || fallback()
}

function fallback() {
  return `# ${pageTitle.value}\n\n[Page content could not be loaded. Write your suggested changes here.]`
}

function closeEditor() {
  isOpen.value = false
}

// Creates a GitHub branch + updates the file + opens a PR.
// Returns the PR URL or null if GitHub is not configured.
async function createGitHubPR() {
  const token = import.meta.env.VITE_GITHUB_TOKEN
  const repo = import.meta.env.VITE_GITHUB_REPO // e.g. "UnuSec/petmasters"
  if (!token || !repo) return null

  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json'
  }
  const api = `https://api.github.com/repos/${repo}`
  const filePath = `docs/${page.value.relativePath}`
  const branch = `suggestion/${Date.now()}`

  // Get default branch and its HEAD SHA
  const { default_branch } = await fetch(api, { headers }).then(r => r.json())
  const { object: { sha: headSha } } = await fetch(
    `${api}/git/refs/heads/${default_branch}`, { headers }
  ).then(r => r.json())

  // Get current file SHA (needed by the GitHub Contents API to update)
  const { sha: fileSha } = await fetch(
    `${api}/contents/${filePath}`, { headers }
  ).then(r => r.json())

  // UTF-8-safe base64 encode
  const bytes = new TextEncoder().encode(content.value)
  const binary = Array.from(bytes, b => String.fromCharCode(b)).join('')
  const encoded = btoa(binary)

  // Create branch, push file, open PR
  await fetch(`${api}/git/refs`, {
    method: 'POST', headers,
    body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: headSha })
  })

  await fetch(`${api}/contents/${filePath}`, {
    method: 'PUT', headers,
    body: JSON.stringify({
      message: `suggestion: ${summary.value}`,
      content: encoded,
      sha: fileSha,
      branch
    })
  })

  const { html_url } = await fetch(`${api}/pulls`, {
    method: 'POST', headers,
    body: JSON.stringify({
      title: `[Wiki Suggestion] ${summary.value}`,
      body: `**Page:** ${pageTitle.value}\n**Suggested by:** ${author.value || 'Anonymous'}\n\n> ${summary.value}`,
      head: branch,
      base: default_branch
    })
  }).then(r => r.json())

  return html_url
}

async function submitEdit() {
  if (!summary.value) {
    alert('Please provide a brief description of your change!')
    return
  }

  const webhookUrl = import.meta.env.VITE_DISCORD_WEBHOOK_URL
  if (!webhookUrl) {
    alert('Submission is not configured yet. Please contact a moderator on Discord.')
    return
  }

  submitting.value = true
  try {
    // 1. Open the GitHub PR first so we can link to it from Discord
    const prUrl = await createGitHubPR().catch(() => null)

    // 2. Build Discord embed
    const fields = [
      { name: '📄 Page', value: pageTitle.value, inline: true },
      { name: '👤 Suggested by', value: author.value || 'Anonymous', inline: true },
      { name: '📋 Change', value: summary.value }
    ]
    if (prUrl) {
      fields.push({ name: '🔗 Pull Request', value: `[Review & Merge on GitHub](${prUrl})` })
    } else {
      fields.push({
        name: '🔧 How to apply',
        value: `Replace \`${page.value.relativePath}\` with the attached file and push to main.`
      })
    }

    const embed = {
      title: '📝 New Edit Suggestion',
      color: 0xe5ad35,
      fields,
      footer: { text: 'PetMasters Wiki — Edit Suggestion' },
      timestamp: new Date().toISOString()
    }

    // 3. Post to Discord — attach the .md file as backup even when a PR exists
    const filename = page.value.relativePath.replace(/\//g, '_')
    const file = new Blob([content.value], { type: 'text/plain' })
    const form = new FormData()
    form.append('payload_json', JSON.stringify({ embeds: [embed] }))
    form.append('files[0]', file, filename)

    const res = await fetch(webhookUrl, { method: 'POST', body: form })
    if (!res.ok) throw new Error(`Discord returned ${res.status}`)

    submitted.value = true
    setTimeout(closeEditor, 2500)
  } catch (err) {
    alert('Failed to submit suggestion. Please try again or contact a moderator.')
    console.error(err)
  } finally {
    submitting.value = false
  }
}
</script>
