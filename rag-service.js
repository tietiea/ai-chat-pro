import 'dotenv/config'

// ═══ 知识库文档（模拟你的 Vue 学习笔记）═══
export const docs = [
  { id: 1, content: 'ref 用于定义基本类型的响应式数据，使用时需要 .value 获取和修改，模板中自动解包。' },
  { id: 2, content: 'reactive 只能定义对象类型的响应式数据，直接访问属性，不需要 .value，但重新赋值整个对象会丢失响应式。' },
  { id: 3, content: 'computed 是计算属性，依赖的数据变化时自动重新计算，有缓存，只有依赖变化才重算。' },
  { id: 4, content: 'watch 是侦听器，监听某个数据的变化并执行副作用操作，需要主动声明要监听谁。' },
  { id: 5, content: 'v-if 是条件渲染，不满足条件时元素不渲染到 DOM；v-show 只是切换 display 样式，元素始终在 DOM 里。' },
  { id: 6, content: 'v-for 遍历数组渲染列表，必须加 :key 属性，key 用唯一的 id，不能用 index。' },
]

// ═══ Embedding API：文字 → 向量（带重试，应对偶发异常）═══
async function embed(text, retry = 3) {
  for (let i = 0; i < retry; i++) {
    try {
      const res = await fetch('https://api.siliconflow.cn/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.API_KEY}`,
        },
        body: JSON.stringify({
          model: 'BAAI/bge-m3',
          input: text,
        }),
      })
      const json = await res.json()
      if (json.data && json.data[0]) return json.data[0].embedding
      throw new Error('embedding 返回异常: ' + JSON.stringify(json))
    } catch (err) {
      if (i === retry - 1) throw err
      console.log('⚠️ embedding 重试', i + 1, err.message)
      await new Promise(r => setTimeout(r, 1000))
    }
  }
}

// ═══ 余弦相似度 ═══
function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

// ═══ 启动时：所有文档转向量并缓存（真实项目存数据库，这里存内存）═══
const docVectors = []
export async function initDocs() {
  for (const d of docs) {
    docVectors.push(await embed(d.content))
  }
  console.log(`📚 知识库初始化完成：${docs.length} 段文档已转向量`)
}

// ═══ 检索：问题 → 返回最相关的 2 段文档 ═══
async function search(question) {
  const qVector = await embed(question)
  return docs
    .map((d, i) => ({ ...d, score: cosineSimilarity(qVector, docVectors[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
}

// ═══ RAG 问答：问题 → 检索 → 文档+问题发给 AI → 返回回答和引用 ═══
export async function rag(question) {
  const top = await search(question)
  const context = top.map(r => r.content).join('\n')

  const res = await fetch('https://api.siliconflow.cn/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-ai/DeepSeek-V3',
      messages: [
        { role: 'system', content: `你是知识库问答助手。请只根据下面提供的资料回答问题，如果资料里没有答案，就明确说"资料中没有相关内容"。\n\n资料：\n${context}` },
        { role: 'user', content: question },
      ],
    }),
  })
  const json = await res.json()

  return {
    answer: json.choices[0].message.content,
    sources: top.map(r => ({ id: r.id, content: r.content, score: r.score })),
  }
}
