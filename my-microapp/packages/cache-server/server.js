import express from 'express'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── 配置（通过环境变量覆盖） ───────────────────────────
const PORT = Number(process.env.CACHE_PORT || 4000)
const CACHE_DIR = process.env.CACHE_DIR || path.join(__dirname, '.cache')
const AUTH_TOKEN = process.env.CACHE_TOKEN // 必须设置，用于鉴权

if (!AUTH_TOKEN) {
  console.error('ERROR: CACHE_TOKEN environment variable is required')
  console.error('Usage: CACHE_TOKEN=your-secret-token node server.js')
  process.exit(1)
}

// ─── 初始化缓存目录 ────────────────────────────────────
fs.mkdirSync(CACHE_DIR, { recursive: true })

const app = express()

// Turborepo 会发送较大的 artifact（构建产物打包后的 tar）
app.use(express.raw({ type: '*/*', limit: '500mb' }))

// ─── 鉴权中间件 ──────────────────────────────────────
function authenticate(req, res, next) {
  const auth = req.headers.authorization
  if (!auth || auth !== `Bearer ${AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}

// ─── PUT /v8/artifacts/:hash ─ 上传缓存 ────────────────
app.put('/v8/artifacts/:hash', authenticate, (req, res) => {
  const { hash } = req.params

  // 防止路径遍历
  if (!/^[a-zA-Z0-9]+$/.test(hash)) {
    return res.status(400).json({ error: 'Invalid hash' })
  }

  const filePath = path.join(CACHE_DIR, `${hash}.artifact`)
  fs.writeFile(filePath, req.body, (err) => {
    if (err) {
      console.error(`[PUT] Failed to write ${hash}:`, err.message)
      return res.status(500).json({ error: 'Write failed' })
    }
    console.log(`[PUT] ${hash} (${(req.body.length / 1024).toFixed(1)} KB)`)
    res.json({ status: 'ok' })
  })
})

// ─── GET /v8/artifacts/:hash ─ 下载缓存 ────────────────
app.get('/v8/artifacts/:hash', authenticate, (req, res) => {
  const { hash } = req.params

  if (!/^[a-zA-Z0-9]+$/.test(hash)) {
    return res.status(400).json({ error: 'Invalid hash' })
  }

  const filePath = path.join(CACHE_DIR, `${hash}.artifact`)

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found' })
  }

  const stat = fs.statSync(filePath)
  console.log(`[GET] ${hash} (${(stat.size / 1024).toFixed(1)} KB)`)
  res.sendFile(filePath)
})

// ─── HEAD /v8/artifacts/:hash ─ 检查缓存是否存在 ────────
app.head('/v8/artifacts/:hash', authenticate, (req, res) => {
  const { hash } = req.params

  if (!/^[a-zA-Z0-9]+$/.test(hash)) {
    return res.status(400).end()
  }

  const filePath = path.join(CACHE_DIR, `${hash}.artifact`)
  res.status(fs.existsSync(filePath) ? 200 : 404).end()
})

// ─── 健康检查 ──────────────────────────────────────────
app.get('/health', (req, res) => {
  const files = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.artifact'))
  const totalSize = files.reduce((sum, f) => {
    return sum + fs.statSync(path.join(CACHE_DIR, f)).size
  }, 0)
  res.json({
    status: 'ok',
    artifacts: files.length,
    totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
  })
})

// ─── 启动 ──────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Turborepo Remote Cache running on http://0.0.0.0:${PORT}`)
  console.log(`Cache directory: ${CACHE_DIR}`)
  console.log(`Health check: http://localhost:${PORT}/health`)
})
