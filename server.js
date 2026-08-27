import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { Readable } from 'node:stream'
import { docs, initDocs, rag } from './rag-service.js'

// ═══ 简单限流：每个 IP 每 60 秒最多 10 次 ═══
const RATE_LIMIT = 10
const RATE_WINDOW = 60 * 1000
const hits = new Map() // ip -> { count, resetAt }

function rateLimit(req, res, next) {
  const ip = req.ip || req.socket.remoteAddress
  const now = Date.now()
  const rec = hits.get(ip)
  if (!rec || now > rec.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_WINDOW })
    return next()
  }
  rec.count++
  if (rec.count > RATE_LIMIT) {
    res.status(429).json({ error: '请求太频繁，请稍后再试' })
    return
  }
  next()
}

const app = express()
app.use(cors())
app.use(express.json())
app.use(rateLimit) // 注册为全局中间件，每个请求先过它

// ═══ 代理路由：前端调这里，后端转发到 AI API ═══
app.post('/api/chat', async (req, res) => {
  try {
    // 1. 转发请求到真实的 AI API（API Key 只在后端，前端看不到！）
    const response = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.API_KEY}`,
      },
      body: JSON.stringify({
        model: req.body.model || 'deepseek-ai/DeepSeek-V3',
        messages: req.body.messages,  // ← 前端传来的对话历史
        stream: true,
      }),
    })

    if (!response.ok) {
      res.status(response.status).json({ error: 'AI API 调用失败' })
      return
    }

    // 2. 设置 SSE 响应头，告诉浏览器"这是流式数据"
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')

    // 3. Web 流 → Node 流 → 管道透传到前端
    Readable.fromWeb(response.body).pipe(res)
  } catch (err) {
    console.error('代理出错:', err.message)
    res.status(500).json({ error: '服务器内部错误' })
  }
})

// ═══ 知识库接口：返回文档列表 ═══
app.get('/api/docs', (req, res) => {
  res.json({ code: 200, data: docs })
})

// ═══ RAG 接口：提问 → 检索 → 文档+问题发给 AI → 返回回答和引用 ═══
app.post('/api/rag', async (req, res) => {
  try {
    const { question } = req.body
    const result = await rag(question)
    res.json({ code: 200, data: result })
  } catch (err) {
    console.error('RAG 出错:', err.message)
    res.status(500).json({ code: 500, error: '服务器内部错误' })
  }
})

const PORT = process.env.PORT || 3000
initDocs().then(() => {
  app.listen(PORT, () => {
    console.log(`🚀 后端代理已启动：http://localhost:${PORT}`)
  })
})
