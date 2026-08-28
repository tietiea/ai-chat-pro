<template>
  <div class="flex h-screen relative">
    <!-- 移动端：汉堡按钮 -->
    <button
      class="md:hidden fixed top-3 left-3 z-50 w-9 h-9 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-lg shadow"
      @click="showSidebar = !showSidebar"
    >☰</button>
    <!-- 移动端：遮罩 -->
    <div
      v-if="showSidebar"
      class="md:hidden fixed inset-0 bg-black/30 z-30"
      @click="showSidebar = false"
    ></div>
    <!-- 左栏：对话列表（桌面常驻，移动端为抽屉） -->
    <div
      class="w-64 border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex-col shrink-0 fixed inset-y-0 left-0 z-40 transition-transform duration-300 md:static md:z-auto"
      :class="showSidebar ? 'translate-x-0' : '-translate-x-full md:translate-x-0'"
    >
      <div class="p-3 border-b border-gray-200 dark:border-gray-700">
        <el-button type="primary" class="w-full" @click="newConversation">+ 新建对话</el-button>
      </div>
      <div class="flex-1 overflow-y-auto p-2">
        <div
          v-for="c in conversations"
          :key="c.id"
          class="group flex items-center justify-between px-3 py-2 mb-1 rounded-lg cursor-pointer text-sm"
          :class="c.id === currentId ? 'bg-blue-100 dark:bg-blue-900' : 'hover:bg-gray-100 dark:hover:bg-gray-800'"
          @click="switchConversation(c.id)"
        >
          <span class="truncate text-gray-700 dark:text-gray-200">{{ c.title }}</span>
          <button
            class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 ml-2 shrink-0 cursor-pointer"
            @click.stop="deleteConversation(c.id)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <!-- 右栏：聊天区 -->
    <div class="flex-1 flex flex-col items-center pt-8 px-4">
      <!-- 聊天列表 -->
      <div class="h-80 p-4 border border-blue-200 bg-white w-full max-w-3xl flex flex-col gap-2 overflow-y-auto dark:border-gray-600 dark:bg-gray-900">
        <div v-if="currentMessages.length === 0" class="text-gray-300 text-center mt-24 dark:text-gray-500">
          在下方输入消息，和 AI 聊天吧 👇
        </div>
        <TransitionGroup name="msg" tag="div" class="flex flex-col w-full">
          <div
            v-for="(msg, i) in currentMessages"
            :key="i"
            class="flex items-end gap-2 max-w-[85%] mb-3"
            :class="msg.role === 'user' ? 'self-end' : 'self-start'"
          >
            <!-- 头像：用户靠右、AI 靠左 -->
            <div
              class="w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 select-none"
              :class="msg.role === 'user' ? 'bg-blue-100 order-2' : 'bg-purple-100 order-1'"
            >{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
            <!-- 气泡 + 操作 -->
            <div
              class="flex flex-col gap-1 min-w-0"
              :class="msg.role === 'user' ? 'items-end order-1' : 'items-start order-2'"
            >
              <div
                v-if="msg.role === 'user'"
                class="bg-blue-500 text-white rounded-xl rounded-br-sm px-4 py-2 whitespace-pre-wrap break-words"
              >{{ msg.content }}</div>
              <template v-else>
                <div
                  v-if="msg.content"
                  class="bg-gray-100 text-gray-800 rounded-xl rounded-bl-sm px-4 py-2 markdown-body dark:bg-gray-700 dark:text-gray-200 break-words"
                  @click="onBubbleClick"
                  v-html="renderMarkdown(msg.content)"
                ></div>
                <div
                  v-else
                  class="bg-gray-100 text-gray-400 rounded-xl rounded-bl-sm px-4 py-2 dark:bg-gray-700 dark:text-gray-400"
                >思考中<span class="typing-cursor">...</span></div>
                <div v-if="msg.content" class="flex gap-2 text-xs">
                  <button class="text-gray-400 hover:text-blue-500 cursor-pointer" @click="copyReply(msg.content)">📋 复制</button>
                  <button class="text-gray-400 hover:text-blue-500 cursor-pointer" @click="regenerate(msg)">🔄 重新生成</button>
                </div>
              </template>
            </div>
          </div>
        </TransitionGroup>
        <div ref="bottomRef"></div>
      </div>
      <!-- 输入区 -->
      <div class="w-full max-w-3xl mt-4">
        <!-- 模型切换下拉框 -->
        <el-select v-model="model" class="w-56 mb-2" size="small">
          <el-option value="deepseek-ai/DeepSeek-V3" label="DeepSeek-V3" />
          <el-option value="Qwen/Qwen2.5-7B-Instruct" label="Qwen2.5-7B" />
        </el-select>
        <div class="relative">
          <el-input
            v-model="form.in"
            class="w-full"
            :rows="3"
            type="textarea"
            placeholder="请输入"
            @keydown="onKeydown"
          />
          <div class="absolute right-2 bottom-2 flex gap-2">
            <el-button v-if="loading" type="danger" @click="stopGenerate" class="!m-0">
              停止
            </el-button>
            <el-button type="primary" @click="come" :disabled="loading" class="!m-0">
              发送
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { marked } from 'marked'
import { markedHighlight } from 'marked-highlight'
import hljs from 'highlight.js'
import 'highlight.js/styles/github.css'
import { reactive, ref, nextTick, computed } from 'vue'

interface Message {
  role: 'user' | 'assistant'
  content: string
}

interface Conversation {
  id: number
  title: string
  messages: Message[]
}

const form = reactive({
  in: '',
})
const bottomRef = ref<HTMLElement | null>(null)
const loading = ref(false)
const conversations = ref<Conversation[]>([])
const currentId = ref<number | null>(null)
const model = ref('deepseek-ai/DeepSeek-V3')
const controller = ref<AbortController | null>(null)
const showSidebar = ref(false)

// 当前对话的消息（根据 currentId 从 conversations 里找）
const currentMessages = computed(() => {
  const c = conversations.value.find(c => c.id === currentId.value)
  return c ? c.messages : []
})

// 新建对话
function newConversation() {
  const id = Date.now()
  conversations.value.push({ id, title: '新对话', messages: [] })
  currentId.value = id
  showSidebar.value = false // 移动端选完收起抽屉
}

// 切换对话
function switchConversation(id: number) {
  currentId.value = id
  showSidebar.value = false // 移动端选完收起抽屉
}

// 删除对话
function deleteConversation(id: number) {
  if (currentId.value === id) {
    const rest = conversations.value.filter(c => c.id !== id)
    currentId.value = rest[0]?.id ?? null
  }
  conversations.value = conversations.value.filter(c => c.id !== id)
}

// 发送消息（come 和 regenerate 共用：请求 + 流式写入占位消息）
async function sendRequest(conv: Conversation, streamMsg: Message) {
  loading.value = true
  controller.value = new AbortController()
  try {
     const base = import.meta.env.VITE_API_BASE ?? ''
    const res = await fetch(base + '/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      signal: controller.value.signal,
      body: JSON.stringify({
        messages: conv.messages,
        model: model.value,
      }),
    })
    // ═══ 流式读取 ═══
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const jsonStr = line.slice(6)
        if (jsonStr === '[DONE]') break

        try {
          const json = JSON.parse(jsonStr)
          const delta = json.choices[0].delta?.content
          if (delta) {
            streamMsg.content += delta
          }
        } catch {}
      }
    }

    await scrollToBottom()
    console.log('AI:', streamMsg.content)
  } catch (err: any) {
    if (err.name === 'AbortError') {
      // 用户点了停止：保留已生成的部分内容
      if (streamMsg.content) {
        console.log('⏹ 已停止生成，保留部分内容')
      } else {
        // 一个字都还没输出就停了 → 移除空占位，防止卡在"思考中..."
        const idx = conv.messages.indexOf(streamMsg)
        if (idx !== -1) conv.messages.splice(idx, 1)
        console.log('⏹ 已停止生成，尚未输出内容')
      }
    } else {
      console.log('❌', err.message)
      // 出错时移除占位消息
      const idx = conv.messages.indexOf(streamMsg)
      if (idx !== -1) conv.messages.splice(idx, 1)
    }
  } finally {
    controller.value = null
    loading.value = false
  }
}

async function come() {
  if (!currentId.value) newConversation()
  const conv = conversations.value.find(c => c.id === currentId.value)!
  if (!form.in) return
  conv.messages.push({ role: 'user', content: form.in })
  // 第一条消息作为对话标题
  if (conv.title === '新对话') {
    conv.title = form.in.slice(0, 15)
  }
  // 先塞一条空的 assistant 消息占位（流式内容写进它）
  const streamMsg = reactive({ role: 'assistant' as const, content: '' })
  conv.messages.push(streamMsg)
  form.in = ''
  await sendRequest(conv, streamMsg)
}

// 等待某个条件成立（用于等当前生成收尾）
function waitFor(cond: () => boolean) {
  return new Promise<void>((resolve) => {
    if (cond()) return resolve()
    const t = setInterval(() => {
      if (cond()) {
        clearInterval(t)
        resolve()
      }
    }, 50)
  })
}

// 重新生成：删掉该条 AI 回复及之后的内容，重新请求
// 若正在生成中，先中断当前生成，再重新生成（点"重新生成"可中途打断）
async function regenerate(msg: Message) {
  const conv = conversations.value.find(c => c.id === currentId.value)
  if (!conv) return

  // 正在流式输出 → 先停止当前生成，等它收尾
  if (loading.value) {
    controller.value?.abort()
    await waitFor(() => !loading.value)
  }

  // 停止后占位可能被移除（空内容时），重新定位目标位置
  let idx = conv.messages.indexOf(msg)
  if (idx === -1) {
    idx = conv.messages.length // 占位已删：直接追加新占位
  }

  // 截断：删掉这条 AI 消息和它之后的所有消息
  conv.messages.splice(idx)
  // 重新塞占位 + 重新请求
  const streamMsg = reactive({ role: 'assistant' as const, content: '' })
  conv.messages.push(streamMsg)
  await sendRequest(conv, streamMsg)
}

// 复制整条回复
async function copyReply(content: string) {
  await navigator.clipboard.writeText(content)
}

// 停止生成
function stopGenerate() {
  controller.value?.abort()
}

async function scrollToBottom() {
  await nextTick()
  bottomRef.value?.scrollIntoView({ behavior: 'smooth' })
}

function onKeydown(e: KeyboardEvent) {
  if (e.key == 'Enter' && !e.shiftKey) {
    e.preventDefault()
    come()
  }
}

marked.use(
  markedHighlight({
    highlight: (code) => hljs.highlightAuto(code).value,
  })
)

function renderMarkdown(content: string): string {
  const html = marked.parse(content) as string
  return html
    .replace(/<pre>/g, '<div class="code-block"><button class="copy-btn">复制</button><pre>')
    .replace(/<\/pre>/g, '</pre></div>')
}

function onBubbleClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.classList.contains('copy-btn')) return
  const code = target.parentElement?.querySelector('code')?.textContent || ''
  navigator.clipboard.writeText(code)
  target.textContent = '已复制'
  setTimeout(() => (target.textContent = '复制'), 2000)
}
</script>
<style>
.code-block {
  position: relative;
}

.copy-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 1;
  padding: 2px 8px;
  font-size: 12px;
  border: none;
  border-radius: 4px;
  background: #334155;
  color: #e2e8f0;
  cursor: pointer;
}

.copy-btn:hover {
  background: #475569;
}

.msg-enter-active,
.msg-leave-active {
  transition: all 0.3s ease;
}
.msg-enter-from {
  opacity: 0;
  transform: translateY(10px);
}
.msg-leave-to {
  opacity: 0;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
.typing-cursor {
  animation: blink 1s step-end infinite;
  font-weight: bold;
  color: #6b7280;
}
</style>
