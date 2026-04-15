# AI 面试问题手册（完整版）

> 结合你的医疗AI客服助手项目 + 面试公司（AI+数字人）整理
> 热度：🔴必问 🟡高频 🟢可能问
> 难度：⭐入门 ⭐⭐中等 ⭐⭐⭐困难
> 你能答：✅能答 ⚠️需加强

---

## 医疗AI客服助手 · 项目概览

```
用户(前端)
    ↓ SSE流式
React前端 ←→ NestJS后端 ←→ Milvus向量库
                   ↓         ↓
              内部API      LLM大模型
           (订单/报告)    (内网部署)
                   ↓
               Redis
            (会话存储)
```

**简历原文四大功能模块：**
1. 知识库构建与优化（百万级文档 → 分块 → Milvus向量存储 → 按科室分区检索）
2. 多轮对话管理（会话历史 → 阈值触发摘要 → 上下文连贯性）
3. 意图识别与任务分发（分层设计 → 精准分流 → RAG查询/订单API/报告API）
4. 前后端交互设计（SSE流式 → 统一响应格式text/card/action/redirect → Function Call卡片渲染）

---

## 模块一：智能客服对话

> 涵盖：SSE流式输出、多轮对话、打字机效果、Markdown渲染、对话状态管理

### Q1: SSE流式输出是怎么实现的？画出完整前后端链路

🔴热度 | ⭐⭐难度 | ✅能答

**完整链路：**
```
用户输入"头痛吃什么药"
    ↓
前端 POST /api/chat { message: "头痛吃什么药", sessionId: "xxx" }
    ↓
后端 NestJS 接收请求
    ↓
查询上下文（Redis历史 + 检索知识库）
    ↓
调用 LLM 流式API，逐token生成
    ↓
SSE 推送: data: {"type":"text","content":"头"}
               data: {"type":"text","content":"痛"}
               data: {"type":"text","content":"可"}
               ...（打字机效果）
    ↓
前端逐步渲染，同时继续接收
    ↓
data: {"type":"done"}
    ↓
渲染完成
```

**后端 NestJS 实现（基于简历项目）：**

```typescript
// ai.controller.ts
@Sse('stream')
streamChat(@Body() body: ChatDto): Observable<MessageEvent> {
  return this.aiService.getAIStreamResponse(
    body.message,
    body.sessionId,
    body.userId,
    body.turnNumber,
  );
}

// ai.service.ts - 核心流式处理
getAIStreamResponse(
  message: string,
  sessionId: string,
  userId: number,
  turnNumber: number,
): Observable<{ content: string; done?: boolean; error?: string }> {
  const abortController = new AbortController();
  const subscriptionKey = `${sessionId}-${turnNumber}`;
  this.abortControllers.set(subscriptionKey, abortController);

  let fullResponse = "";

  return new Observable(subscriber => {
    (async () => {
      try {
        // 1. 保存用户消息
        await this.saveMessage({ topicId, role: 'user', content: message, turnNumber });

        // 2. 获取对话历史
        const history = await this.getHistoryForAI(topicId);

        // 3. RAG检索：查询知识库获取上下文
        const { context } = await this.getRetrivalByHandleCustomData(
          message,
          'local', // 医疗文档
        );

        // 4. 构建Prompt
        const prompt = ChatPromptTemplate.fromMessages([
          ['system', `你是医疗客服助手，只能基于以下参考资料回答。
如果资料中没有相关信息，请回答"我暂时无法回答这个问题，建议咨询医生"。
参考资料：{context}`],
          ['placeholder', 'history'],  // 对话历史占位
          ['human', '{input}'],
        ]);

        // 5. 流式调用LLM
        const chain = prompt.pipe(this.chatModel);
        const stream = await chain.stream(
          { input: message, history, context },
          { signal: abortController.signal }
        );

        // 6. 逐token SSE推送
        for await (const chunk of stream) {
          if (abortController.signal.aborted) break;
          if (chunk?.content) {
            fullResponse += chunk.content;
            subscriber.next({ content: chunk.content });
          }
        }

        // 7. 保存AI回复
        await this.saveMessage({ topicId, role: 'assistant', content: fullResponse, turnNumber });

        subscriber.next({ content: '', done: true });
        subscriber.complete();
      } catch (err) {
        if (err.name === 'AbortError') {
          // 中断不做错误处理
        } else {
          subscriber.error({ content: '', done: true, error: err.message });
        }
      } finally {
        this.abortControllers.delete(subscriptionKey);
      }
    })();
  });
}
```

**前端 React 实现（基于你的实际代码）：**

```typescript
// streamApi.ts - 封装流式请求
export class StreamApi {
  private controller: AbortController | null = null;

  async streamChat(url, params, callbacks) {
    // 1. 中断之前的请求
    if (this.controller) this.controller.abort();
    this.controller = new AbortController();

    let accumulatedText = '';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'text/event-stream',  // 关键：告诉后端要SSE
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(params),
        signal: this.controller.signal,
      });

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.content) {
                // 累加文本 → 触发UI更新（打字机效果）
                accumulatedText += data.content;
                callbacks.onChunk(data.content);
              }

              if (data.type === 'tool_result') {
                callbacks.onTool(data.tools);
              }

              if (data.done) {
                callbacks.onComplete(accumulatedText);
                callbacks.onTool([]);
                return;
              }
            } catch (e) {
              // 忽略解析失败的单行
            }
          }
        }
      }
    } catch (error) {
      if (error.name !== 'AbortError') {
        callbacks.onError(error);
      }
    }
  }

  // 中断当前流
  abort() {
    this.controller?.abort();
    this.controller = null;
  }
}
```

**前端 React 组件中的调用（StreamChat.tsx）：**

```tsx
const streamApi = new StreamApi();
const [historyList, setHistoryList] = useState<Message[]>([]);
const [isStreaming, setIsStreaming] = useState(false);

const handleSubmit = () => {
  if (isStreaming) {
    // 正在流式传输 → 中断
    interruptCurrentStream();
    return;
  }

  // 1. 先添加一条空消息占位
  const historyItem = { humanMessage: input.value, aiMessage: { text: '', tools: [] } };
  setHistoryList(prev => [...prev, historyItem]);
  setIsStreaming(true);

  streamApi.streamChat(
    '/api/ai/getAIStreamResponse',
    {
      message: input.value,
      sessionId: currentSessionId,
      userId: storeUserInfo.id,
      turn_number: historyList.length + 1,
    },
    {
      // 收到每个token chunk
      onChunk: (chunk) => {
        setHistoryList(prev => {
          const last = prev[prev.length - 1];
          // 不可变更新：替换最后一条消息的text
          return [...prev.slice(0, -1), {
            ...last,
            aiMessage: { ...last.aiMessage, text: (last.aiMessage.text || '') + chunk }
          }];
        });
      },

      // 收到工具调用结果
      onTool: (tools) => {
        setHistoryList(prev => {
          const last = prev[prev.length - 1];
          return [...prev.slice(0, -1), {
            ...last,
            aiMessage: { ...last.aiMessage, tools: [...(last.aiMessage.tools || []), ...tools] }
          }];
        });
      },

      // 流结束
      onComplete: () => {
        setIsStreaming(false);
        input.value = '';
        onStreamComplete?.(true);
      },

      // 出错
      onError: (error) => {
        setIsStreaming(false);
        setHistoryList(prev => prev.slice(0, -1)); // 删掉失败的占位消息
        toast.error(error.message);
      },
    },
  );
};
```

---

### Q2: SSE和WebSocket有什么区别？为什么AI对话用SSE？

🔴热度 | ⭐⭐难度 | ✅能答

| 对比项 | SSE | WebSocket |
|--------|-----|-----------|
| 方向 | 单向（服务端→客户端） | 双向 |
| 协议 | HTTP | 独立ws://协议 |
| 重连 | 自动重连（内置） | 需手动实现 |
| 复杂度 | 简单 | 复杂 |
| 兼容性 | IE不支持 | 所有浏览器 |
| 场景 | 推送/推送为主 | 双向实时交互 |

**为什么SSE适合AI对话：**
- AI对话是服务端推送为主（前端的输入是普通HTTP POST）
- 比WebSocket简单，不需要协议升级
- 自动重连对移动网络友好
- 后端实现用NestJS的`@Sse()`装饰器直接返回Observable即可

```typescript
// SSE：单向，服务端用 @Sse() 装饰器，推送 SSE 格式的 EventStream
@Sse('stream')
stream() { return new Observable(...) } // ✅ 适合AI对话

// WebSocket：双向，需要 ws 模块，需要处理连接管理、心跳
@SubscribeMessage('event')
handleEvent() { return new Observable(...) } // 需要额外配置
```

---

### Q3: 怎么实现打字机效果？

🔴热度 | ⭐难度 | ✅能答

**核心原理**：每次收到SSE的chunk，就用`setState`累加文本，React检测到状态变化后重新渲染，形成逐字显示的效果。

```tsx
// 打字机效果的核心实现
const [displayText, setDisplayText] = useState('');

onChunk: (chunk) => {
  // chunk = 每次收到的一个token，如"头"、"痛"
  setDisplayText(prev => prev + chunk);
  // React重新渲染，displayText多了最后一个字
  // 用户看到的效果：头痛 → 头痛可 → 头痛可以 → ...
}

// 可选：节流优化，防止LLM推送太快导致渲染卡顿
onChunk: (chunk) => {
  setDisplayText(prev => prev + chunk);
  // 也可以用 requestAnimationFrame：
  // requestAnimationFrame(() => setDisplayText(...))
}

// 光标效果：渲染时在末尾加一个闪烁的光标
return (
  <div>
    <MarkdownRenderer content={displayText} />
    {!isDone && <span className="animate-pulse">|</span>}
  </div>
);
```

---

### Q4: Markdown是怎么渲染的？

🟢热度 | ⭐难度 | ✅能答

使用`react-markdown` + `remark-gfm` + `rehype-highlight`：

```tsx
// MarkdownRender.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'highlight.js/styles/github-dark.css';

export const MarkdownRenderer = ({ content }: { content: string }) => {
  return (
    <div className="prose prose-invert max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}       // GitHub风味Markdown（表格、删除线等）
        rehypePlugins={[rehypeHighlight]} // 代码高亮
        components={{
          // 安全处理链接：新窗口打开
          a: ({ node, ...props }) => (
            <a target="_blank" rel="noopener noreferrer" {...props} />
          ),
          // 安全处理代码块
          code: ({ node, ...props }) => (
            <code className="bg-gray-800 px-1 py-0.5 rounded" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

// 使用时直接传入流式累加的文本
<MarkdownRenderer content={message.aiMessage.text} />
```

**安全注意**：绝对不要用`dangerouslySetInnerHTML`，要用`ReactMarkdown`组件。

---

### Q5: 多轮对话是怎么管理的？

🔴热度 | ⭐⭐⭐难度 | ✅能答

**简历原文**：存储会话历史，根据已设阈值，设计历史上下文摘要，自动关联前文，提升多轮对话的连贯性。

**三层设计：**

```
第一层：当前会话（Redis）
    ↓ 轮数超阈值（如10轮）
第二层：摘要压缩（LLM生成摘要）
    ↓ 继续累积
第三层：最早的对话（截断丢弃）
```

**完整实现代码：**

```typescript
// conversation.service.ts
async getHistoryForAI(topicId: number): Promise<ChatMessage[]> {
  const MAX_TURNS = 10;  // 超过10轮触发摘要
  const messages = await prisma.message.findMany({
    where: { topicId },
    orderBy: { createdAt: 'asc' },
    take: 50,  // 最多取50条
  });

  // 如果超过阈值，做摘要压缩
  if (messages.length > MAX_TURNS * 2) {  // user+assistant=1轮
    const oldMessages = messages.slice(0, -MAX_TURNS * 2);
    const recentMessages = messages.slice(-MAX_TURNS * 2);

    // 调用LLM压缩历史
    const summaryPrompt = `请总结以下对话的要点，保留关键信息（患者问题、AI回答结论）：
${oldMessages.map(m => `${m.role}: ${m.content}`).join('\n')}
摘要要求：用100字以内概括对话核心议题和结论。`;

    const summaryResponse = await this.chatModel.invoke(summaryPrompt);
    const summary = summaryResponse.content;

    // 返回：摘要 + 最近对话
    return [
      { role: 'system', content: `【对话摘要】${summary}` },
      ...recentMessages,
    ];
  }

  return messages;
}
```

**Redis会话存储结构：**

```typescript
// 用 sessionId 作为key，存储在Redis
// key: "chat:session:{sessionId}"
// value: [{role: 'user'|'assistant', content: '...'}, ...]

class RedisChatMessageHistory {
  async getMessages(sessionId: string): Promise<BaseMessage[]> {
    const key = `chat:session:${sessionId}`;
    const data = await redis.lrange(key, 0, -1);
    return data.map(d => JSON.parse(d));
  }

  async addMessage(sessionId: string, message: BaseMessage) {
    const key = `chat:session:${sessionId}`;
    await redis.rpush(key, JSON.stringify(message));
    // 最多保留20条
    await redis.ltrim(key, -20, -1);
  }
}
```

---

### Q6: 流式传输中怎么实现中断（用户点"中止"）？

🔴热度 | ⭐⭐难度 | ✅能答

**核心：AbortController**——JavaScript原生提供的API，可以取消任何支持signal的异步操作。

```typescript
// 后端：用 Map 存储所有活跃请求的 AbortController
private abortControllers = new Map<string, AbortController>();

// 启动流时创建controller并存储
getAIStreamResponse(message, sessionId, turnNumber): Observable {
  const subscriptionKey = `${sessionId}-${turnNumber}`;
  const abortController = new AbortController();
  this.abortControllers.set(subscriptionKey, abortController);

  return new Observable(subscriber => {
    (async () => {
      const stream = await chain.stream(
        { input: message },
        { signal: abortController.signal }  // 🔑 绑定到LLM请求
      );
      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;  // 🔑 被中断时退出循环
        subscriber.next({ content: chunk.content });
      }
    })();
  });
}

// 中断接口
@Post('interrupt')
interruptStream(@Body() body: { sessionId: string; turnNumber: number }) {
  const key = `${body.sessionId}-${body.turnNumber}`;
  const controller = this.abortControllers.get(key);
  if (controller) {
    controller.abort();        // 中断LLM请求
    this.abortControllers.delete(key);
    return { success: true };
  }
  return { success: false };
}
```

```tsx
// 前端：点"中止"按钮时调用
const interruptCurrentStream = async () => {
  if (currentStreamId) {
    await interruptStream({ sessionId: currentStreamId, turnNumber });
    setIsStreaming(false);
    toast.info('AI回复已中断');
  }
};

// UI：流式进行中显示"中止"按钮
<Button onClick={isStreaming ? interruptCurrentStream : handleSubmit}>
  {isStreaming ? (
    <><Loader2 className="animate-spin" />中止</>
  ) : (
    <span>发送</span>
  )}
</Button>
```

---

### Q7: SSE断开重连怎么处理？

🟡热度 | ⭐⭐难度 | ⚠️需准备

```tsx
// fetch + ReadableStream 手动实现重连
async function streamWithRetry(url, params, callbacks, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, { method: 'POST', body: JSON.stringify(params) });
      const reader = response.body.getReader();
      // ... 读取逻辑（同Q1）
      return; // 成功则返回
    } catch (error) {
      if (i === maxRetries - 1) {
        callbacks.onError?.(new Error('连接失败，请检查网络'));
        return;
      }
      // 等待1秒后重试
      await new Promise(r => setTimeout(r, 1000));
      callbacks.onRetry?.(`正在重连... (${i + 1}/${maxRetries})`);
    }
  }
}

// 前端UI：显示重连状态
const [retryMsg, setRetryMsg] = useState('');
onRetry: (msg) => setRetryMsg(msg),

return (
  <div>
    {retryMsg && <div className="text-yellow-500">{retryMsg}</div>}
    <MessageList messages={historyList} />
  </div>
);
```

---

## 模块二：知识库检索

> 涵盖：RAG流程、知识库构建、向量分区、检索策略、Embedding、缓存

### Q8: RAG系统的完整流程是什么？

🔴热度 | ⭐⭐难度 | ✅能答

**简历原文**：根据医院提供的百万级医疗资料（药品说明书、诊疗指南、科室介绍等），使用LangChainJS进行文本分块，并通过Milvus存储向量及元数据，设计内网RAG系统。

```
知识库构建阶段（离线）：
  文档PDF/Word → LangChain文档加载器 → 文本分块
    → 调用Embedding服务转向量 → 存入Milvus（带元数据）
    ↑ 执行一次，长期复用

查询阶段（在线，每次请求）：
  用户提问 → 问题Embedding → Milvus相似度搜索
    → 取出Top-K文档片段 → 拼接Prompt → LLM生成 → 返回
```

**LangChain RAG 核心代码（基于简历项目）：**

```typescript
// 1. 文档加载（LangChain支持多种格式）
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

// 2. 文本分块（RecursiveCharacterTextSplitter是LangChain推荐）
const splitter = new RecursiveCharacterTextSplitter({
  chunkSize: 500,      // 每块500字符
  chunkOverlap: 100,   // 相邻块重叠100字符，保证上下文连续
});

const docs = await splitter.splitDocuments(rawDocuments);

// 3. 调用内部Embedding服务向量化
const embeddings = new LocalEmbeddings(); // 内部Embedding服务
// LocalEmbeddings内部调用：
// POST http://embedding-server:8001/embed
// Body: { texts: ["文本块1", "文本块2", ...] }
// 返回: { embeddings: [[0.123, -0.456, ...], ...] }

// 4. 存入Milvus（带元数据）
import { Milvus } from '@langchain/community/vectorstores/milvus';

const vectorStore = await Milvus.fromDocuments(docs, embeddings, {
  collectionName: 'medical_knowledge',
  partitionName: 'department_internal',  // 按科室
  metadataField: 'metadata',             // 元数据字段
});

// 5. 查询时：先向量搜索，再拼接Prompt
async function queryWithRAG(userQuestion: string) {
  // 向量搜索（带元数据过滤）
  const results = await vectorStore.similaritySearch(userQuestion, 5, {
    filter: { department: 'internal' },  // 只查内科
  });

  // 拼接上下文
  const context = results.map(r => r.pageContent).join('\n\n');

  // 构建Prompt
  const prompt = `你是医疗客服助手，只能基于以下参考资料回答。
如果资料中没有相关信息，请回答"我暂时无法回答，建议咨询医生"。

参考资料：
${context}

用户问题：${userQuestion}`;

  // 调用LLM
  const response = await chatModel.invoke(prompt);
  return response.content;
}
```

---

### Q9: 知识库分区是怎么做的？按科室分区检索的伪代码

🔴热度 | ⭐⭐难度 | ✅能答（简历描述）

**简历原文**：设计Milvus分区策略（按科室分区），确保百万级向量检索平均延迟<150ms。

**分区设计思路：**

```
Milvus Collection: medical_knowledge
├── Partition: department_internal    (内科)
├── Partition: department_surgery     (外科)
├── Partition: department_pediatric   (儿科)
├── Partition: department_cardiology  (心内科)
└── ...

或者按文档类型分区：
├── Partition: doctype_medicine       (药品说明书)
├── Partition: doctype_guideline      (诊疗指南)
└── Partition: doctype_intro          (科室介绍)
```

**分区创建伪代码（Milvus SDK）：**

```typescript
// Milvus 分区管理 - 初始化时执行一次

// 1. 创建Collection（定义字段和分区键）
await milvusClient.createCollection({
  collection_name: 'medical_knowledge',
  fields: [
    { name: 'id', type: DataType.Int64, is_primary_key: true, auto_id: true },
    { name: 'vector', type: DataType.FloatVector, dim: 1024 },  // Embedding维度
    { name: 'text', type: DataType.VarChar, max_length: 5000 },  // 原始文本
    { name: 'department', type: DataType.VarChar, max_length: 64 },  // 科室（分区键）
    { name: 'doc_type', type: DataType.VarChar, max_length: 32 },   // 文档类型
    { name: 'created_at', type: DataType.Timestamp },
  ],
  enable_dynamic_field: false,
});

// 2. 创建分区（科室分区）
const departments = [
  { name: 'internal', desc: '内科' },
  { name: 'surgery', desc: '外科' },
  { name: 'pediatric', desc: '儿科' },
  { name: 'cardiology', desc: '心内科' },
  { name: 'neurology', desc: '神经科' },
  { name: 'oncology', desc: '肿瘤科' },
];

for (const dept of departments) {
  await milvusClient.createPartition({
    collection_name: 'medical_knowledge',
    partition_name: `dept_${dept.name}`,
    description: dept.desc,
  });
}

// 3. 批量导入数据时自动落入对应分区
// 存储时指定partition
await milvusClient.insert({
  collection_name: 'medical_knowledge',
  partition_name: 'dept_internal',  // 药品说明书落入对应分区
  data: [{
    vector: embeddingResult,
    text: chunkContent,
    department: 'internal',
    doc_type: 'medicine',
    created_at: Date.now(),
  }],
});

// 4. 查询时指定分区（关键！减少扫描范围）
async function searchByDepartment(question: string, department: string) {
  // 4a. 问题向量化
  const questionEmbedding = await embedText(question);  // 调用内部Embedding服务

  // 4b. 在指定分区中搜索
  const results = await milvusClient.search({
    collection_name: 'medical_knowledge',
    partition_names: [`dept_${department}`],  // 🔑 只扫描该分区，不是全表
    vector: questionEmbedding,
    limit: 5,
    output_fields: ['text', 'department', 'doc_type'],
    params: { nprobe: 32 },  // IVF_FLAT索引的搜索参数
  });

  return results.results;  // [{id, distance, text, department}, ...]
}

// 5. 如果不确定科室，先做意图推断再查分区
async function searchWithIntent(question: string) {
  // 推断问题属于哪个科室
  const dept = await inferDepartment(question);
  // 如："血压高怎么办" → infer → "cardiology"

  return searchByDepartment(question, dept);
}
```

---

### Q10: 向量检索的原理是什么？相似度怎么算的？

🟡热度 | ⭐⭐难度 | ⚠️需准备

**核心：余弦相似度（Cosine Similarity）**

```
向量表示：两个高维空间中的箭头
向量A: [0.1, 0.3, -0.2, ...]  ("头痛怎么治")
向量B: [0.1, 0.28, -0.21, ...] ("头疼治疗方法")

相似度 = cos(两个向量的夹角)
        = (A·B) / (|A| × |B|)
        = 越接近1表示越相似
```

**Milvus查询示例：**

```typescript
// Milvus 支持的相似度算法：
// - IP (Inner Product): 内积，适合归一化向量
// - L2 (欧氏距离): 适合距离度量
// - COSINE (余弦相似度): 最常用

await milvusClient.search({
  collection_name: 'medical_knowledge',
  vector: questionEmbedding,
  limit: 5,
  metric_type: 'COSINE',  // 使用余弦相似度
  params: { nprobe: 32 },  // 搜索精度vs速度的平衡参数
  output_fields: ['text', 'department'],
});

// 返回结果示例：
// {
//   results: [
//     { score: 0.94, text: "头痛可用布洛芬缓解...", department: "internal" },
//     { score: 0.87, text: "偏头痛的常见原因...", department: "neurology" },
//     { score: 0.72, text: "头部CT检查适应症...", department: "radiology" },
//   ]
// }
```

---

### Q10.5: 知识库初始化与分区策略（扩展）

> 这一节是 Q9（知识库分区）的深入补充，解答：海量文档怎么入库、分区怎么设计、自动分区怎么做、要不要摘要。

#### 一、初始化向量数据库的标准操作流程

```
第一步：数据分析（离线一次性）—— 摸清文档"家底"
    ↓
第二步：分区设计（离线一次性）—— 决定分几个区、怎么分
    ↓
第三步：文档处理流水线（可定时/可增量）—— 分类 → 摘要 → 分块
    ↓
第四步：批量向量化入库 + 建索引
    ↓
第五步：验证检索质量（抽样测试）
```

**第一步：数据分析**——先摸清文档分布，决定分区策略：

```typescript
// 分析原始文档，了解数据分布（一次性执行）
async function analyzeDocumentCorpus(docsPath: string) {
  const stats = { totalCount: 0, byDepartment: {}, byDocType: {} };

  for (const file of await fs.readdir(docsPath)) {
    const content = await fs.readFile(file, 'utf-8');
    stats.totalCount++;

    // 从文件路径中提取科室/文档类型
    // 例如：/内科学/药品说明书/布洛芬.pdf → department=internal, docType=medicine
    const meta = extractMetaFromPath(file);
    stats.byDepartment[meta.department] = (stats.byDepartment[meta.department] || 0) + 1;
    stats.byDocType[meta.docType] = (stats.byDocType[meta.docType] || 0) + 1;
  }

  console.log('文档分布统计：', stats);
  // 输出示例：{ totalCount: 120000, byDepartment: { internal: 35000, surgery: 28000, ... } }

  return stats;
}
```

---

#### 二、分区策略三种方案

**方案A：按科室分区（最常用，科室边界清晰时）**

```typescript
const DEPARTMENTS = {
  internal:    { name: '内科',     desc: '内科疾病、药品' },
  surgery:     { name: '外科',     desc: '外科手术、住院' },
  pediatric:   { name: '儿科',     desc: '儿童疾病、疫苗' },
  cardiology:  { name: '心内科',   desc: '心血管疾病' },
  neurology:   { name: '神经科',   desc: '脑部、神经疾病' },
  oncology:    { name: '肿瘤科',   desc: '癌症治疗' },
  emergency:   { name: '急诊',     desc: '急诊流程、应急' },
  pharmacy:    { name: '药房',     desc: '药品库存、用药指导' },
};

// 创建 Collection + 分区
await milvusClient.createCollection({
  collection_name: 'medical_knowledge',
  fields: [
    { name: 'id', type: DataType.Int64, is_primary_key: true, auto_id: true },
    { name: 'vector', type: DataType.FloatVector, dim: 1024 },
    { name: 'text', type: DataType.VarChar, max_length: 5000 },
    { name: 'department', type: DataType.VarChar, max_length: 64 },   // 科室（分区键）
    { name: 'doc_type', type: DataType.VarChar, max_length: 32 },    // 文档类型
    { name: 'source_file', type: DataType.VarChar, max_length: 255 },
    { name: 'created_at', type: DataType.Timestamp },
  ],
});

for (const [key, val] of Object.entries(DEPARTMENTS)) {
  await milvusClient.createPartition({
    collection_name: 'medical_knowledge',
    partition_name: `dept_${key}`,
    description: val.desc,
  });
}
```

**方案B：按文档类型分区（跨科室通用内容多时）**

```typescript
const DOC_TYPES = {
  medicine:     { name: '药品说明书' },
  guideline:    { name: '诊疗指南' },
  procedure:    { name: '操作规程' },
  equipment:    { name: '设备说明' },
  announcement: { name: '通知公告' },
};
// 适合：科室边界模糊，但文档类型稳定
```

**方案C：二级分区（百万级以上，科室×文档类型）**

```typescript
// Collection = 按科室，Partition = 按文档类型
// 相当于：medical_internal / medical_surgery / ...
// 每个科室内再按文档类型分 partition
//   medical_internal_medicine
//   medical_internal_guideline
//   medical_internal_procedure

async function createTwoLevelPartitioning() {
  for (const dept of DEPARTMENTS) {
    await milvusClient.createCollection({
      collection_name: `medical_${dept}`,
      fields: [...],
    });

    for (const docType of DOC_TYPES) {
      await milvusClient.createPartition({
        collection_name: `medical_${dept}`,
        partition_name: `dtype_${docType}`,
      });
    }
  }
}
```

**分区决策树**：

```
文档规模 < 10万  → 一级分区（按科室）
文档规模 10-50万 → 一级分区 + 索引优化
文档规模 > 50万  → 二级分区（Collection×Partition）
```

---

#### 三、海量文档怎么自动判断分区

**方法1：从文件路径提取（最快，优先用）**

```typescript
// 医院文档命名规则通常是：科室_文档类型_文件名
function extractMetaFromPath(filePath: string): Meta {
  const parts = filePath.split('/');
  // 例如："内科学/药品说明书/布洛芬胶囊.pdf"

  const deptMapping = {
    '内科学': 'internal', '外科': 'surgery', '儿科学': 'pediatric',
    '心内科': 'cardiology', '神经科': 'neurology',
  };
  const docTypeMapping = {
    '药品': 'medicine', '指南': 'guideline', '手册': 'manual',
    '流程': 'procedure', '设备': 'equipment', '通知': 'announcement',
  };

  return {
    department: deptMapping[parts[0]] || 'unknown',
    docType: docTypeMapping[parts[1]] || 'other',
  };
}
```

**方法2：关键词匹配（次快，路径没有信息时）**

```typescript
// 比LLM快10-100倍，适合结构清晰的文档
function classifyByKeywords(content: string): { department: string; confidence: number } {
  const deptKeywords = {
    internal:    ['血压', '血糖', '头痛', '发热', '咳嗽', '胃肠'],
    cardiology:  ['心电图', '心率', '血压', '心肌', '冠心病', '心衰'],
    pediatric:   ['儿童', '小儿', '疫苗', '发烧', '腹泻', '生长发育'],
    surgery:     ['手术', '切口', '术后', '麻醉', '住院', '拆线'],
    neurology:   ['头晕', '头痛', '偏瘫', '癫痫', '脑部', '神经'],
    oncology:    ['化疗', '放疗', '肿瘤', '癌症', '转移', '晚期'],
  };

  let bestDept = 'internal';
  let bestScore = 0;

  for (const [dept, keywords] of Object.entries(deptKeywords)) {
    let score = 0;
    for (const kw of keywords) {
      if (content.includes(kw)) score++;
    }
    if (score > bestScore) { bestScore = score; bestDept = dept; }
  }

  return { department: bestDept, confidence: bestScore / deptKeywords[bestDept].length };
}
```

**方法3：LLM自动分类（最准但最慢，规则无法判断时）**

```typescript
// 兜底方案：路径提取和关键词都判断不了，再用LLM
async function classifyByLLM(content: string): Promise<Meta> {
  const prompt = `根据以下文档内容，判断它属于哪个科室。

科室选项：internal, surgery, pediatric, cardiology, neurology, oncology, emergency

文档前200字：
${content.slice(0, 200)}

返回JSON：{"department": "科室", "confidence": 0.95}`;

  const response = await chatModel.invoke(prompt);
  return JSON.parse(response.content);
}
```

**方法4：规则 + 关键词 + LLM 混合（生产环境最常用）**

```typescript
function classifyWithFallback(content: string, path: string): Meta {
  // 第一层：路径提取（O(1)，最快）
  const pathMeta = extractMetaFromPath(path);
  if (pathMeta.department !== 'unknown') {
    return { ...pathMeta, method: 'path' };
  }

  // 第二层：关键词匹配（毫秒级）
  const keywordMeta = classifyByKeywords(content);
  if (keywordMeta.confidence > 0.7) {
    return { ...keywordMeta, method: 'keyword' };
  }

  // 第三层：LLM兜底（秒级，但最准）
  return { ...(await classifyByLLM(content)), method: 'llm' };
}
```

---

#### 四、要不要做摘要？流程会不会很长？

**答案：长文档（>3000字）先做摘要再分块，不是所有文档都摘要。**

**为什么要摘要？**

```
原文5000字 → 直接分块 → 10个块 → 10个向量
问题：相邻块可能主题跳跃，检索时召回碎片化内容

先摘要500字 → 分块 → 1个块 → 1个向量
优点：每个块都是有意义的上下文，检索质量更高
```

**什么文档需要摘要，什么不需要？**

```typescript
function shouldSummarize(doc: Document): boolean {
  const length = doc.pageContent.length;

  // 需要摘要：长文档 + 结构化文档
  if (length > 3000) return true;
  if (isStructuredDocument(doc.metadata.source)) return true;  // 手册、指南

  // 不需要：短文档、简单通知
  return false;
}

async function summarizeIfNeeded(doc: Document): Promise<Document[]> {
  if (!shouldSummarize(doc)) return [doc];  // 直接返回，后续分块

  // 调用LLM生成摘要
  const prompt = `将以下文档总结为300字以内的摘要，保留核心信息：
${doc.pageContent}`;

  const summary = (await chatModel.invoke(prompt)).content;
  return [{ ...doc, pageContent: summary, metadata: { ...doc.metadata, isSummary: true } }];
}
```

**完整入库流水线（含摘要判断）**

```typescript
async function ingestDocuments(docsPath: string) {
  // 阶段1：加载文档（IO，可并行）
  const rawDocs = await loadAllDocuments(docsPath);
  console.log(`加载了 ${rawDocs.length} 个文档`);

  // 阶段2：自动分类（获取 department/docType 元数据）
  const classifiedDocs = await Promise.all(
    rawDocs.map(doc => autoClassifyWithFallback(doc))
  );
  console.log('分类完成');

  // 阶段3：摘要处理（只对长文档/结构化文档）
  const summarizedDocs = [];
  for (const doc of classifiedDocs) {
    const processed = await summarizeIfNeeded(doc);
    summarizedDocs.push(...processed);
  }
  console.log(`摘要后文档数：${summarizedDocs.length}`);

  // 阶段4：分块（RecursiveCharacterTextSplitter）
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 500,
    chunkOverlap: 50,
  });
  const chunks = await splitter.splitDocuments(summarizedDocs);
  console.log(`分块后：${chunks.length} 个块`);

  // 阶段5：批量向量化入库（分批，控制内存和API限流）
  const BATCH_SIZE = 500;
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    await embedAndStore(batch);  // 向量化 + 写入Milvus指定分区
    console.log(`进度：${i + BATCH_SIZE}/${chunks.length}`);
  }

  // 阶段6：建索引（IVF_FLAT 或 HNSW）
  await milvusClient.createIndex({
    collection_name: 'medical_knowledge',
    field_name: 'vector',
    index_params: { type: 'IVF_FLAT', nprobe: 32 },
  });

  // 阶段7：抽样验证检索质量
  await validateRetrievalQuality();

  console.log('入库完成！');
}
```

**全流程时间估算（10万文档，平均2000字/文档）**

```
阶段          | 时间预估      | 说明
-------------|--------------|----------------------
文档加载      | 5-10 分钟     | IO密集，可并行
自动分类      | 30-60 分钟    | LLM调用，慢
摘要处理      | 20-40 分钟    | 只处理长文档
分块          | 2-5 分钟      | 本地计算，快
向量化入库    | 40-80 分钟    | Embedding服务是瓶颈
建索引        | 10-20 分钟    | Milvus

总计：约 2-3 小时（一次性，后续增量）
```

**实际上不需要等全部跑完才能测试**——前几千条入库后就可以开始验证检索质量，边跑边调。

---

#### 五、分区决策树（总结）

```
文档入库前判断：

① 文档来源路径是否包含科室信息？
   → 有 → 直接从路径提取 department 元数据 ✅ 最优
   → 没有 ↓

② 关键词匹配能否判断？
   → 能 → 使用关键词分类 ✅ 快速
   → 不能 ↓

③ LLM 分类 ✅ 兜底

④ 文档长度 > 3000字？
   → 是 → 先摘要再分块
   → 否 → 直接分块

⑤ 文档规模：
   → < 10万   → 一级分区（按科室）
   → 10-50万  → 一级分区 + IVF_FLAT 索引优化
   → > 50万   → 二级分区（Collection×Partition）
```

---

### Q11: 高频问题怎么缓存？Redis缓存策略

🟡热度 | ⭐⭐难度 | ⚠️需准备

**简历原文**：对高频问题（如"门诊时间"）使用缓存完整回答并注入上下文，降低重复计算。

```typescript
// 缓存策略：问题Embedding → 缓存Key → Redis存储

// 1. 高频问题识别（启动时或定期统计）
const HIGH_FREQ_QUESTIONS = [
  '门诊时间',
  '挂号流程',
  '急诊电话',
  '住院须知',
];

// 2. 预热缓存（启动时）
for (const q of HIGH_FREQ_QUESTIONS) {
  const answer = await generateAnswer(q);  // 一次性生成完整回答
  const cacheKey = `cache:qa:${hash(q)}`;
  await redis.setex(cacheKey, 3600, JSON.stringify({  // 1小时过期
    answer,
    createdAt: Date.now(),
  }));
}

// 3. 查询时优先查缓存
async function queryWithCache(question: string) {
  const cacheKey = `cache:qa:${hash(question)}`;

  // 先查Redis
  const cached = await redis.get(cacheKey);
  if (cached) {
    return JSON.parse(cached).answer;  // 直接返回缓存
  }

  // 缓存未命中，走正常RAG流程
  const answer = await generateAnswerViaRAG(question);

  // 存入缓存（1小时后过期）
  await redis.setex(cacheKey, 3600, JSON.stringify({ answer }));

  return answer;
}

// 4. 缓存失效策略
// - 知识库更新时，清空相关分区缓存
// - 设置TTL自然过期
// - 主动刷新：定时任务重新生成高频问题答案
```

---

## 模块三：任务执行

> 涵盖：意图识别、Function Calling、工具调用、任务分发、工具卡片渲染

### Q12: 意图识别是怎么做的？

🔴热度 | ⭐⭐⭐难度 | ⚠️需准备

**简历原文**：采用分层设计，先识别用户意图及关键词提取。再进行任务分发（如知识库查询、订单、报告API调用）。

**分层设计思路：**

```
用户输入："帮我查一下ORD12345的挂号订单"
    ↓
第一层：意图分类
  - 知识库查询 → RAG处理
  - 订单查询   → 调用订单API
  - 报告查询   → 调用报告API
  - 转人工     → 触发转人工流程
  - 闲聊       → 通用对话
    ↓
第二层：参数提取
  - 从输入中提取关键参数（订单号ORD12345、患者姓名等）
    ↓
第三层：任务分发
  → Router根据意图分发到对应Handler
```

**简化实现（LLM做意图分类）：**

```typescript
// 意图分类 - 用LLM快速判断
async function classifyIntent(message: string): Promise<IntentResult> {
  const prompt = `你是一个意图分类器。请分析用户消息，返回对应的意图类型。

意图类型：
- knowledge: 知识库查询（药品、诊疗、科室等）
- order: 订单查询
- report: 检验报告查询
- transfer_human: 转人工
- chat: 闲聊

用户消息：${message}

返回JSON格式：{"intent": "类型", "params": {"key": "value"}}`;

  const response = await chatModel.invoke(prompt);
  return JSON.parse(response.content);
}

// 任务分发路由
async function handleMessage(message: string, sessionId: string) {
  const { intent, params } = await classifyIntent(message);

  switch (intent) {
    case 'knowledge':
      return await handleRAGQuery(message);

    case 'order':
      return await handleOrderQuery(params.orderId);
      // params = { orderId: 'ORD12345' }

    case 'report':
      return await handleReportQuery(params.reportId);

    case 'transfer_human':
      return await handleTransferToHuman(sessionId);

    case 'chat':
      return await handleGeneralChat(message);

    default:
      return { type: 'text', content: '抱歉，我无法理解您的问题' };
  }
}
```

---

### Q13: Function Calling 在项目中是怎么用的？

🔴热度 | ⭐⭐⭐难度 | ⚠️需准备

**简历原文**：实现function_call，对接内部订单、报告API，根据用户查询参数（如订单号、患者姓名）获取实时数据，并渲染结构化卡片信息。

**完整Function Calling链路：**

```
用户："帮我查一下ORD12345的挂号订单"
    ↓
LLM识别意图 + 提取参数
    ↓
LLM返回结构化指令：
  {
    tool_name: 'query_order',
    tool_args: { order_id: 'ORD12345' }
  }
    ↓
后端执行对应API
    ↓
API返回真实数据
    ↓
拼接Prompt让LLM生成自然语言 + 结构化数据
    ↓
前端收到：
  {
    type: 'card',
    data: {
      orderId: 'ORD12345',
      patientName: '张三',
      department: '内科',
      status: '已确认',
      time: '2026-04-10 09:00'
    }
  }
    ↓
前端渲染 <OrderCard data={data} />
```

**后端实现（LangChain Tool Binding）：**

```typescript
// 定义订单查询工具
const orderTool = new DynamicStructuredTool({
  name: 'query_order',
  description: '根据订单号查询挂号订单信息',
  schema: z.object({
    orderId: z.string().describe('订单号，如ORD12345'),
  }),
  func: async ({ orderId }) => {
    // 调用内部订单API
    const response = await fetch(`${INTERNAL_API}/orders/${orderId}`);
    return await response.json();
  },
});

// 定义报告查询工具
const reportTool = new DynamicStructuredTool({
  name: 'query_report',
  description: '根据报告ID查询检验报告',
  schema: z.object({
    reportId: z.string(),
    patientName: z.string().optional(),
  }),
  func: async ({ reportId, patientName }) => {
    const response = await fetch(`${INTERNAL_API}/reports/${reportId}`);
    return await response.json();
  },
});

// 绑定工具到模型
const agent = chatModel.bindTools([orderTool, reportTool]);

// Agent推理循环
async function agentLoop(message: string, history: ChatMessage[]) {
  const response = await agent.invoke([
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: 'user', content: message },
  ]);

  // LLM返回了工具调用
  if (response.tool_calls && response.tool_calls.length > 0) {
    const toolCall = response.tool_calls[0];

    // 执行工具
    let toolResult;
    if (toolCall.name === 'query_order') {
      toolResult = await orderTool.invoke(toolCall.args);
    } else if (toolCall.name === 'query_report') {
      toolResult = await reportTool.invoke(toolCall.args);
    }

    // 把结果返回给LLM，让它生成最终回答
    const finalResponse = await chatModel.invoke([
      { role: 'user', content: message },
      { role: 'assistant', content: response.content },
      { role: 'user', content: `工具返回结果：${JSON.stringify(toolResult)}` },
    ]);

    return {
      text: finalResponse.content,
      toolResult,  // 同时返回工具结果，供前端渲染卡片
    };
  }

  // 没有工具调用，直接返回文本
  return { text: response.content };
}
```

---

### Q14: 工具调用结果在前端是怎么渲染的？

🔴热度 | ⭐⭐难度 | ✅能答（实际做过WeatherCard）

**你的实际代码（WeatherCard.tsx）：**

```tsx
// WeatherCard.tsx - 工具卡片的渲染方式
const WeatherCard = ({ data }: { data: WeatherData }) => {
  return (
    <Card className="w-80 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{data.city}--{data.condition}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-4xl font-bold mb-2">{data.temperature}</div>
        <div className="text-sm text-gray-500 mb-4 capitalize">
          {data.condition}
        </div>
        <div className="flex justify-end mb-4">
          <Wind className="w-5 h-5 mr-2 text-gray-500" />
          <span>{data.wind_speed}</span>
        </div>
        <div className="text-sm text-gray-500">{data.update_time}</div>
      </CardContent>
    </Card>
  );
};
```

**通用的消息分发渲染器（MessageRenderer）：**

```tsx
// 统一消息渲染器 - 根据type渲染不同UI
function MessageRenderer({ message }: { message: Message }) {
  switch (message.type) {
    case 'text':
      return <MarkdownRenderer content={message.content} />;

    case 'card':
      return <InfoCard data={message.data} />;

    case 'tool_result':
      // 工具调用结果卡片
      return message.tools?.map((tool, i) => {
        if (tool.tool_name === 'get_current_weather') {
          return <WeatherCard key={i} data={tool.tool_result} />;
        }
        if (tool.tool_name === 'query_order') {
          return <OrderCard key={i} data={tool.tool_result} />;
        }
        if (tool.tool_name === 'query_report') {
          return <ReportCard key={i} data={tool.tool_result} />;
        }
        return null;
      });

    case 'action':
      return (
        <div className="flex gap-2">
          {message.actions?.map((action, i) => (
            <Button key={i} onClick={() => handleAction(action)}>
              {action.label}
            </Button>
          ))}
        </div>
      );

    case 'redirect':
      return (
        <div onClick={() => navigateTo(message.url)}>
          {message.content}
        </div>
      );
  }
}
```

**后端返回的工具数据结构：**

```typescript
// 后端流式返回多条消息类型
subscriber.next({ type: 'text', content: '您的订单信息如下：' });  // 文本
subscriber.next({
  type: 'tool_result',
  tool_name: 'query_order',
  tools: {
    tool_name: 'query_order',
    tool_result: {
      orderId: 'ORD12345',
      patientName: '张三',
      department: '内科',
      status: '已确认',
      time: '2026-04-10 09:00',
    }
  }
});  // 工具结果
subscriber.next({ type: 'done' });  // 结束
```

---

### Q15: 转人工是怎么实现的？

🟢热度 | ⭐难度 | ⚠️需准备

```typescript
// 1. 检测转人工意图
async function handleTransferToHuman(sessionId: string) {
  // 意图识别到 'transfer_human'
  const topic = await prisma.topic.findUnique({ where: { sessionId } });
  const recentMessages = await prisma.message.findMany({
    where: { topicId: topic.id },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  // 2. 加入人工客服排队队列（可以是Redis队列）
  await redis.rpush('human_queue', JSON.stringify({
    sessionId,
    userId: topic.userId,
    queuedAt: Date.now(),
    conversationHistory: recentMessages,  // 附带AI对话历史
  }));

  // 3. 返回转人工消息
  return {
    type: 'text',
    content: '正在为您转接人工客服，请稍候...',
  };
}

// 2. 人工客服端获取队列消息
async function getNextHumanCustomer() {
  const data = await redis.lpop('human_queue');
  return data ? JSON.parse(data) : null;
}
```

---

## 模块四：工程化与AI前端集成

> 涵盖：AI对话前端架构、性能优化、数字人集成、其他追问

### Q16: 如果让你设计一个AI对话系统的前端，怎么设计？

🔴热度 | ⭐⭐⭐难度 | ⚠️需准备

**完整前端组件架构：**

```
ChatApp
├── ChatContainer           # 对话容器
│   ├── Sidebar             # 侧边栏（对话历史列表）
│   │   ├── TopicList       # 话题列表
│   │   ├── NewChatButton   # 新建对话
│   │   └── UserMenu        # 用户信息
│   │
│   ├── MessageArea         # 消息区域
│   │   ├── MessageList     # 消息列表（虚拟滚动）
│   │   │   └── MessageRenderer  # 消息渲染器
│   │   │       ├── TextMessage       # 纯文本
│   │   │       ├── MarkdownMessage    # Markdown
│   │   │       ├── ToolResultCard     # 工具卡片
│   │   │       ├── ActionMessage      # 操作按钮
│   │   │       └── ImageMessage       # 图片（多模态）
│   │   │
│   │   ├── TypingIndicator # AI正在输入指示器
│   │   └── MessagesEndRef  # 自动滚动锚点
│   │
│   └── InputArea           # 输入区域
│       ├── TextInput       # 多行输入框
│       ├── AgentToggle     # Agent模式开关
│       ├── VoiceInput      # 语音输入（可选）
│       └── SendButton      # 发送/中止按钮
│
├── StreamManager           # 流式管理（非组件，单独模块）
│   ├── StreamApi           # SSE请求封装
│   ├── AbortController     # 中断控制
│   └── RetryLogic         # 重试逻辑
│
└── Dialogs
    ├── LoginDialog         # 登录对话框
    ├── SettingsDialog      # 设置对话框
    └── TopicRenameDialog   # 话题重命名
```

**状态管理（Zustand）：**

```typescript
// userStore.ts - 用户状态
interface UserStore {
  storeUserInfo: UserInfo | null;
  isLoggedIn: boolean;
  handleLogin: (user: UserInfo) => void;
  handleLogout: () => void;
}

// chatStore.ts - 对话状态（可新建）
interface ChatStore {
  // 当前会话
  currentTopicId: string | null;
  currentMessages: Message[];

  // 流式状态
  isStreaming: boolean;
  streamingText: string;    // 正在流式生成的文本
  activeStreamId: string | null;

  // 操作
  addMessage: (msg: Message) => void;
  appendChunk: (chunk: string) => void;      // 流式追加
  completeStream: (fullText: string) => void;
  interruptStream: () => void;
  switchTopic: (topicId: string) => void;
  clearMessages: () => void;
}
```

---

### Q16.5: 消息组件需要做缓存吗？怎么实现？

> 这是 Q16（AI对话前端架构设计）的性能优化子专题。

#### 一、为什么需要消息组件缓存？

**问题根源：父组件重渲染会牵连所有子组件**

```
场景：50条已完成的对话，第51条正在流式输入

第51条收到 chunk1
    ↓
setHistoryList(prev => [...prev, newMsg])  // historyList 引用变了
    ↓
ChatContainer 重渲染（状态变了）
    ↓
MessageList 重渲染 → 每个 MessageItem 都重走一遍渲染
    ↓
50个已完成的消息组件全部重渲染，即使数据完全没变
```

**React 默认行为**：父组件重渲染时，递归重渲染所有子组件（不管 props 有没有变），除非子组件用了 `React.memo` / `PureComponent` / `shouldComponentUpdate`。

#### 二、缓存粒度选择

```
ChatContainer           # 父容器，不需要 memo
├── MessageList        # 虚拟列表，靠 key 管理，不需要 memo
│   ├── MessageItem[0]  ← memo ✅ 已完成，不重渲染
│   ├── MessageItem[1]  ← memo ✅ 已完成，不重渲染
│   ├── ...
│   └── MessageItem[n-1] ← ❌ 不 memo，最后一条流式中的消息在变化
└── InputArea          # memo ✅ 不依赖消息列表
```

**结论**：
- 已完成的消息 Item → **memo 化**（props 不变就不重渲染）
- 流式中正在生成的最后一条 → **不要 memo**（text 每次 chunk 都变）
- 虚拟列表容器 → **靠 key 管理**，不需要 memo

#### 三、三种实现方案

**方案1：MessageItem 组件级 memo（最基础，最常用）**

```tsx
import { memo } from 'react';

// ✅ 已完成的消息 Item：memo 化，props 不变就不重渲染
export const MessageItem = memo(function MessageItem({
  message,
  index,
}: {
  message: ChatMessage;
  index: number;
}) {
  return (
    <div className="message-wrapper" data-index={index}>
      <div className="human-message">{message.humanMessage}</div>
      <div className="ai-message">
        <MessageRenderer message={message} />
      </div>
    </div>
  );
});

// ✅ MessageRenderer：按类型分发，memo 化
const MessageRenderer = memo(function MessageRenderer({ message }: { message: Message }) {
  switch (message.type) {
    case 'text':
      return <MarkdownRenderer content={message.content} />;
    case 'tool_result':
      return message.tools?.map((tool, i) => (
        <ToolResultCard key={i} toolName={tool.tool_name} result={tool.tool_result} />
      ));
    case 'card':
      return <InfoCard data={message.data} />;
    case 'action':
      return <ActionButtons actions={message.actions} />;
    default:
      return null;
  }
});
```

**方案2：自定义比较函数的精细化 memo**

```tsx
// ✅ 带自定义比较函数：精确控制缓存时机
const MessageItem = memo(
  function MessageItem({ message, version }: { message: Message; version: number }) {
    return (
      <div className="border-2 border-red-400 mb-4 p-4">
        <div className="text-right mb-5">
          <span className="text-red-500">Human：</span>
          {message.humanMessage}
        </div>
        <div className="text-left">
          <span className="text-blue-500">肥仔AI</span>
          <MessageRenderer message={message.aiMessage} />
          {message.aiMessage.tools?.map((tool: any, i: number) => (
            tool.tool_name === 'get_current_weather'
              ? <WeatherCard key={i} data={tool.tool_result} />
              : null
          ))}
        </div>
      </div>
    );
  },
  // 🔑 自定义比较函数：只有 id 或 version 变化才重渲染
  (prevProps, nextProps) => {
    return (
      prevProps.message.id === nextProps.message.id &&
      prevProps.version === nextProps.version
    );
  }
);
```

**方案3：流式中 vs 已完成消息的分离处理**

```tsx
function MessageList({ messages }: { messages: Message[] }) {
  const listRef = useRef();

  return (
    <div ref={chatContainerRef} className="overflow-auto">
      {messages.map((item, index) => {
        const isLastOne = index === messages.length - 1;

        return (
          <div key={item.id || index}>
            {isLastOne ? (
              // ❌ 最后一个（流式中的消息）：不 memo，因为它还在变化
              <StreamingMessageItem message={item} />
            ) : (
              // ✅ 已完成的消息：memo 化
              <MessageItem message={item} index={index} />
            )}
          </div>
        );
      })}
      <div ref={messagesEndRef} />
    </div>
  );
}

// ❌ 流式中的消息组件：不 memo，但也不属于 historyList 的不变部分
function StreamingMessageItem({ message }: { message: Message }) {
  const [text, setText] = useState(message.aiMessage.text || '');

  // 监听 props 变化（来自父组件的节流更新）
  useEffect(() => {
    setText(message.aiMessage.text || '');
  }, [message.aiMessage.text]);

  return (
    <div>
      <div>{message.humanMessage}</div>
      <MarkdownRenderer content={text} />
    </div>
  );
}
```

#### 四、结合你的项目改造示例

```tsx
// ✅ 已完成的消息 Item：memo 化
const MessageItem = memo(function MessageItem({ message }: { message: Message }) {
  return (
    <div className="border-2 border-red-400 mb-4 p-4">
      <div className="text-right mb-5">
        <span className="text-red-500">Human：</span>
        {message.humanMessage}
      </div>
      <div className="text-left">
        <span className="text-blue-500 flex">
          <span className="mr-2">肥仔AI</span>
          {/* 只在流式中显示动画 */}
          {message.isStreaming && <JumpingIcon />}
        </span>
        <MarkdownRenderer content={message?.aiMessage?.text || ''} />
        <div className="text-right">
          {message?.aiMessage?.tools?.map((i: any) => {
            if (i.tool_name === 'get_current_weather') {
              return <WeatherCard key={i.tool_name} data={i?.tool_result || {}} />;
            }
            return null;
          })}
        </div>
      </div>
    </div>
  );
}, (prevProps, nextProps) => {
  // ✅ 已完成消息的 aiMessage.text 和 tools 永远不会变
  // 只有 id 相等就认为不需要重渲染
  return prevProps.message.id === nextProps.message.id;
});

// ✅ MessageList：稳定 key 管理
function MessageList({ messages }: { messages: Message[] }) {
  return (
    <div ref={chatContainerRef} className="overflow-auto mb-5">
      {messages.map((item, index) => (
        <MessageItem
          key={item.id || index}  // 🔑 稳定唯一 key
          message={item}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}

// ✅ InputArea：memo 化，不依赖消息列表
const InputArea = memo(function InputArea({
  inputRef,
  isStreaming,
  onSubmit,
  onKeyDown,
}: InputAreaProps) {
  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        onKeyDown={onKeyDown}
        disabled={isStreaming}
        className="border-2 border-blue-400 p-2 w-300 h-50"
      />
      <Button onClick={onSubmit} className="absolute w-25 right-2 bottom-5 bg-blue-500">
        {isStreaming ? (
          <div className="flex justify-end items-center">
            <Loader2 className="animate-spin" />中止
          </div>
        ) : (
          <span>发送</span>
        )}
      </Button>
    </div>
  );
});
```

#### 五、机制对比表

| 机制 | 原理 | 触发条件 |
|------|------|---------|
| `React.memo` | 浅比较 props，决定是否跳过重渲染 | props 引用不变就不重渲染 |
| `useMemo` | 缓存计算结果，依赖不变就不重新计算 | 依赖数组变化 |
| `key` 稳定 | React 靠 key 判断元素是否需要销毁重建 | key 保持稳定就不重建 |
| 自定义比较函数 | `memo((prev,next)=>bool)` 精确控制 | 返回 true 表示"相同，不重渲染" |

**核心原理**：已完成的聊天消息，其 `aiMessage.text` 和 `tools` 永远不会变化。通过 `memo` 包裹后，即使父组件 `setHistoryList` 触发了重渲染，这些组件也会因为 props 引用没变而跳过渲染。

---

### Q17: AI对话前端和传统CRUD前端有什么区别？

🔴热度 | ⭐⭐难度 | ✅能答

| 维度 | 传统CRUD前端 | AI对话前端 |
|------|-------------|-----------|
| 数据流 | 请求→响应→展示（一次性） | 持续推送，边生成边展示 |
| 状态 | 静态数据，setState后直接渲染 | 增量渲染，流式状态管理 |
| 错误 | 请求失败→提示错误 | 流可能中途断开，需重试/中断机制 |
| 性能 | 列表虚拟滚动即可 | 流式渲染+虚拟滚动双重优化 |
| 输入 | 用户→服务端→返回完整结果 | 用户→服务端流式→逐步渲染 |
| 组件 | 表格、表单、详情页 | 消息渲染器、Markdown、工具卡片 |

**最大的技术挑战**：
- 流式状态管理：不能用简单的`setState`，需要增量更新
- 中断机制：用户随时可以点"中止"，需要AbortController
- 长对话内存：50轮对话的DOM节点可能上千，需要虚拟滚动

---

### Q18: AI对话系统最大的技术挑战是什么？

🔴热度 | ⭐⭐⭐难度 | ⚠️需准备

**建议回答（选2-3个你最熟的）：**

1. **RAG检索质量**：检索到的内容如果不相关，LLM回答就跑偏。医疗场景尤其严重——如果检索到错误的药品信息，后果不堪设想。

2. **上下文管理**：多轮对话越来越长，token消耗越来越多。要在保证对话连贯性的同时，控制上下文长度。摘要压缩策略是核心。

3. **流式状态一致性**：SSE推送的chunk可能被乱序接收（尤其在弱网下），要确保消息按顺序渲染。

4. **意图理解的边界**：用户表达模糊时，意图识别可能出错。设计兜底策略（走通用对话或转人工）。

5. **多工具协调**：如果一个问题需要调用多个工具（如先查订单→再查物流→再查签收），多工具的协调和状态管理很复杂。

---

### Q19: 如果要在对话中加入数字人，前端怎么集成？

🟡热度 | ⭐⭐⭐难度 | ⚠️需准备（这家公司做数字人，可能问）

```
对话层 ←→ 数字人层（独立渲染）
   ↓
文本 → TTS语音合成 → 口型同步
   ↓
WebGL/Three.js 渲染数字人形象
```

**前端集成思路：**

```typescript
// 方案1：服务端渲染视频流（更简单）
// 数字人在服务端渲染好，用RTMP推流
// 前端用 <video> 标签播放，控制播放/暂停/跳转

// 方案2：WebGL前端渲染（更灵活）
// Three.js + 数字人模型
// 前端拿到LLM回答文本后：
// 1. 发给TTS服务 → 获取语音流
// 2. 驱动数字人口型动画（唇形同步）
// 3. 同时渲染对话文字

// 口型同步核心代码（伪代码）
async function synthesizeAndAnimate(text: string) {
  // 1. TTS语音合成
  const audioResponse = await fetch('/api/tts', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  const audioBlob = await audioResponse.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);

  // 2. 音频驱动口型动画
  const audioContext = new AudioContext();
  const source = audioContext.createMediaElementSource(audio);
  const analyser = audioContext.createAnalyser();
  source.connect(analyser);

  // 3. 渲染循环：分析音频数据 → 驱动口型
  function animate() {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    // 根据音频频率数据驱动口型（比如用低频控制下巴开合）
    const mouthOpen = dataArray.slice(0, 10).reduce((a, b) => a + b) / 10;
    digitalHuman.setMouthOpen(mouthOpen / 255);

    requestAnimationFrame(animate);
  }
  animate();
  audio.play();
}

// 布局：对话区域 + 数字人区域
return (
  <div className="flex">
    <div className="w-2/3">
      <MessageList messages={messages} />
      <InputArea />
    </div>
    <div className="w-1/3">
      <DigitalHumanCanvas model={model} />  {/* Three.js 渲染 */}
    </div>
  </div>
);
```

---

### Q20: Agent和普通LLM对话有什么区别？

🔴热度 | ⭐⭐难度 | ⚠️需准备

| 对比 | 普通对话 | Agent |
|------|---------|-------|
| 本质 | 生成文本 | 生成"行动指令" |
| 工具调用 | 无 | 可以调用工具（查API/读文件等） |
| 多步推理 | 单轮生成 | 可以Thought-Action-Observation循环 |
| 记忆 | 上下文窗口 | 短期+长期记忆 |
| 执行 | 只返回文本 | 能真正完成任务（订票、查询等） |

**ReAct循环（Agent的核心模式）：**

```
用户："北京今天适合出门吗？"

Thought: 我需要先查北京的天气
Action: call get_current_weather(city="北京")
Observation: 北京今天25°C，晴，微风
Thought: 25°C晴天适合出门
Answer: 今天北京天气很好，适合出门！
```

**你的项目**：医疗客服是简化版的Agent——意图识别 → 任务分发 → RAG/API → 返回，本身就是ReAct的思路。

---

### Q21: LangChain的LCEL是什么？怎么用的？

🟡热度 | ⭐⭐难度 | ✅能答

**LCEL = LangChain Expression Language**——用`|`操作符串联各个处理步骤。

```typescript
// 基础LCEL链：Prompt → Model → Output
const chain = prompt.pipe(chatModel);
// 或者
const chain = ChatPromptTemplate.fromMessages([...]).pipe(chatModel);

// 带RAG的完整链
const chain = ChatPromptTemplate.fromMessages([
  ['system', '你是医疗助手，参考：{context}'],
  ['placeholder', 'history'],
  ['human', '{input}'],
]).pipe(chatModel);

// 带工具调用的Agent链
const agent = prompt.pipe(chatModel.bindTools([weatherTool, orderTool]));
// 效果：chatModel会根据输入判断是否需要调用工具

// 流式调用
const stream = await chain.stream({ input: '问题', context: '上下文' });
for await (const chunk of stream) {
  console.log(chunk.content);  // 逐token输出
}
```

---

### Q22: MCP是什么？和Function Calling有什么区别？

🟡热度 | ⭐⭐难度 | ⚠️需准备

**MCP = Model Context Protocol**（Anthropic提出的标准）

**Function Calling**：模型输出JSON指令，你执行后把结果喂回去——每个LLM的Function Calling格式不同（OpenAI用`tool_calls`，Anthropic用`tool_use`）。

**MCP**：统一的协议层，任何AI应用用MCP都能调用任何外部工具。类似于USB接口——不管接鼠标、键盘、U盘，都是同一个USB协议。

```
MCP架构：
┌─────────────┐      MCP       ┌──────────────────┐
│ AI应用      │ ←────────────→ │ MCP Server        │
│ (你的前端)   │               │ (连接数据库的)    │
└─────────────┘               └──────────────────┘
              ↕ MCP
        ┌──────────────────┐
        │ MCP Server        │
        │ (连接文件系统的)   │
        └──────────────────┘
```

**你的项目中的MCP**（ai-learn项目的真实代码）：

```typescript
// agent.service.ts - MCP初始化
import { MultiServerMCPClient } from '@langchain/mcp-adapters';

async initMCP() {
  this.mcpClient = new MultiServerMCPClient({
    mcpServers: {
      filesystem: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-filesystem', process.cwd()],
      },
    },
  });

  // 获取MCP服务器提供的所有工具
  const mcpTools = await this.mcpClient.getTools();
  // 现在mcpTools里包含了文件系统工具（读文件、写文件等）

  // 传给Agent
  this.autoAgent = await createAgent({
    model: chatModel,
    tools: [getWeatherTool, ...mcpTools],  // MCP工具+自定义工具
  });
}
```

---

### Q23: LangGraph和LangChain Agent的区别是什么？

🟢热度 | ⭐⭐⭐难度 | ❌不会（了解概念）

- **LangChain Agent**：线性的工具调用链——输入 → 判断用哪个工具 → 调用 → 返回结果，一轮结束
- **LangGraph**：用**有向图**表示Agent工作流，支持**循环**和**分支**

```typescript
// LangGraph思路（了解即可）
const graph = new StateGraph({
  nodes: {
    // 图节点：LLM判断、工具执行、条件分支、结束
    'model': (state) => { /* LLM决定下一步 */ },
    'tool': (state) => { /* 执行工具 */ },
    'shouldContinue': (state) => state.tool_calls?.length > 0 ? 'tool' : 'end',
  },
  edges: [
    ['model', 'shouldContinue'],
    ['tool', 'model'],  // 工具执行完回到LLM（循环！）
    ['shouldContinue', 'end'],  // 没有更多工具调用就结束
  ],
});

// 适用场景：
// - 多步骤有条件分支的复杂Agent（如客服场景：查→判断→退/换→结束）
// - 需要多轮"思考-行动"循环的ReAct
// - 多Agent协作（一个Agent处理医疗，另一个处理财务，最后合并）
```

---

## 五、核心概念速查

> 面试前快速过一遍，确保每个概念能说清楚。

| 概念 | 一句话解释 | 🔴🟡🟢 | 你的掌握 |
|------|-----------|--------|---------|
| RAG | 先检索真实文档，再让LLM基于文档回答 | 🔴 | ✅ |
| ReAct | Thought(思考)→Action(行动)→Observation(观察)循环 | 🔴 | ⚠️ |
| Function Calling | LLM输出结构化指令，调用外部API | 🔴 | ⚠️ |
| AI Agent | LLM + Tools + Memory + Planning，能自主完成任务 | 🔴 | ⚠️ |
| Embedding | 把文字变成高维向量，语义相近的向量距离近 | 🔴 | ⚠️ |
| SSE | 服务端向客户端单向推送，基于HTTP，流式输出 | 🔴 | ✅ |
| Streaming | LLM生成一个token就推送一个token | 🔴 | ✅ |
| Chunking | 把长文档切成小块，每块分别做向量检索 | 🟡 | ✅ |
| Milvus分区 | 按科室/文档类型分区存储，查询时指定分区减少扫描 | 🟡 | ✅ |
| MCP | Anthropic提出的AI工具调用标准协议（类似USB） | 🟡 | ⚠️ |
| LangChain | 把LLM、工具、记忆、检索串联起来的开发框架 | 🟡 | ✅ |
| LangGraph | 用有向图构建复杂Agent工作流，支持循环分支 | 🟢 | ❌ |
| Hallucination | LLM编造不存在的信息，RAG可缓解 | 🟡 | ⚠️ |
| Token/Context | LLM处理文本的基本单位，有最大限制 | 🟢 | ⚠️ |
| Multi-modal | 能处理文本+图片+语音+视频的AI | 🟢 | ⚠️ |
| AIGC | AI生成内容（文本/图片/音视频） | 🟢 | ✅ |

---

## 六、突击清单（按优先级）

### 🔴 明天面试前必须掌握

1. **SSE完整前后端实现**（Q1）——代码要能默写出来
2. **RAG流程**（Q8）——能画架构图，从文档→分块→Embedding→向量库→检索→LLM
3. **知识库分区策略**（Q9）——Milvus按科室分区，查询时指定分区
4. **Function Calling链路**（Q13）——用户提问→意图识别→工具调用→卡片渲染
5. **消息类型分发**（Q14）——text/card/action/redirect四种类型的前端渲染
6. **多轮对话管理**（Q5）——历史+摘要压缩

### ⚠️ 尽量掌握

7. 流式中断机制（Q6）
8. 意图识别分层设计（Q12）
9. ReAct vs Agent vs Function Calling区别（Q20）
10. Embedding原理（Q10）
11. LangChain LCEL写法（Q21）
12. 高频问题缓存（Q11）
13. MCP概念（Q22）

### 🟢 了解即可

14. LangGraph有向图（Q23）
15. 数字人前端集成思路（Q19）
16. 高级RAG策略（HyDE、Re-ranking）
17. 向量索引类型（HNSW、IVF_FLAT）
18. TTS口型同步原理（Q19）

---

## 七、SSE流式渲染性能优化

> SSE每个token都触发React重渲染，LLM每秒可能推几十个token，高频setState会造成性能问题。以下是市面上常见的3种优化方案。

### 问题根源

```
LLM每秒生成 20-50 个token
    ↓
SSE每收到1个token就推送一个 chunk
    ↓
前端每收到1个chunk就 setState
    ↓
React每秒重渲染 20-50 次
    ↓
如果每条消息几百字 = 几十次完整组件树重渲染
    ↓
CPU占用高，页面卡顿
```

---

### 方案1：节流（Throttle）+ RAF

不每收到一个token就setState，而是攒一段时间（如16ms，一帧）再批量更新。人眼对50ms内的更新无感知。

```tsx
// 节流：每50ms最多刷新一次渲染
const [displayText, setDisplayText] = useState('');
const pendingRef = useRef('');  // 累积buffer，不触发渲染
let lastFlush = 0;
const THROTTLE_MS = 50;

onChunk: (chunk) => {
  pendingRef.current += chunk;  // 只累积，不setState

  const now = Date.now();
  if (now - lastFlush >= THROTTLE_MS) {
    lastFlush = now;
    setDisplayText(prev => prev + pendingRef.current);  // 一次性更新
    pendingRef.current = '';
  }
},

// 或者用 requestAnimationFrame 做最终同步
onFlush: () => {
  requestAnimationFrame(() => {
    setDisplayText(prev => prev + pendingRef.current);
    pendingRef.current = '';
  });
},
```

**效果**：每秒最多20次渲染，而不是20-50次。实现简单，效果明显。

#### 方案1实战：结合你的项目改造 StreamChat.tsx

你的项目当前 `StreamChat.tsx`（line 213-230）的写法是**每个chunk都直接setState**，LLM每秒推几十个token就重渲染几十次：

```tsx
// ❌ 改造前：每个chunk都触发一次重渲染（性能问题）
onChunk: (chunk: any) => {
  setHistoryList((prev) => {
    if (prev.length === 0) return prev;
    const lastItem = prev[prev.length - 1];
    return [...prev.slice(0, -1), {
      ...lastItem,
      aiMessage: {
        text: (lastItem.aiMessage?.text || "") + chunk,  // 每次拼接都重新创建整个数组
        tools: lastItem.aiMessage?.tools || [],
      },
    }];
  });
},
```

**改造后：节流 + ref累积**

```tsx
// ✅ 改造后：先累积到 ref，50ms 批量一次更新

// 1. 新增节流相关的 ref 和配置
const THROTTLE_MS = 50;
const pendingChunkRef = useRef('');   // 累积的文本 buffer，不触发渲染
const lastFlushRef = useRef(Date.now());
const rafIdRef = useRef<number | null>(null);

// 2. flush 函数：把累积的文本一次性推给 React state
const flushPendingChunk = useCallback(() => {
  if (!pendingChunkRef.current) return;

  const pendingText = pendingChunkRef.current;
  pendingChunkRef.current = '';

  setHistoryList(prev => {
    if (prev.length === 0) return prev;
    const lastItem = prev[prev.length - 1];
    return [...prev.slice(0, -1), {
      ...lastItem,
      aiMessage: {
        text: (lastItem.aiMessage?.text || '') + pendingText,
        tools: lastItem.aiMessage?.tools || [],
      },
    }];
  });

  lastFlushRef.current = Date.now();
}, []);

// 3. 节流版本的 onChunk
const handleThrottledChunk = useCallback((chunk: string) => {
  pendingChunkRef.current += chunk;

  const now = Date.now();
  if (now - lastFlushRef.current >= THROTTLE_MS) {
    // 超过50ms阈值，立即 flush
    flushPendingChunk();
  } else {
    // 否则等下一帧（16ms），避免过于频繁
    if (!rafIdRef.current) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        flushPendingChunk();
      });
    }
  }
}, [flushPendingChunk]);

// 4. 流结束时的处理：先把剩余 pending 文本 flush 掉
const handleStreamComplete = useCallback(async () => {
  flushPendingChunk();
  if (rafIdRef.current) {
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
  }
  setIsStreaming(false);
  setCurrentStreamId(null);
  input.value = '';
  onStreamComplete?.(true);
}, [flushPendingChunk, input, onStreamComplete]);

// 5. 中断时的清理：取消 RAF + 清空 buffer
const interruptCurrentStream = useCallback(async () => {
  if (rafIdRef.current) {
    cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
  }
  pendingChunkRef.current = '';  // 清空累积buffer

  if (currentStreamId) {
    await interruptStream({ sessionId: currentStreamId, turn_number: historyList.length });
    setIsStreaming(false);
    setCurrentStreamId(null);
    toast.info('AI回复已中断');
  }
}, [currentStreamId, historyList.length]);

// 6. 调用时替换原来的 onChunk
streamApi.streamChat(url, params, {
  onChunk: handleThrottledChunk,   // ⭐ 替换这里
  onTool: (tool) => { /* 工具结果不需要节流，直接处理 */ },
  onComplete: handleStreamComplete,
  onError: (error) => { /* 清理逻辑 */ },
});
```

**streamApi.ts 保持不变**：它是通用 HTTP 层，只负责 SSE 解析和回调触发，节流逻辑属于 React 组件层的展示优化。

**改造前后对比**：

| | 改造前 | 改造后 |
|--|--------|--------|
| 每个 chunk | 直接 `setHistoryList` | 累积到 `pendingChunkRef` |
| 渲染频率 | 每秒 20-50 次 | 每秒最多 20 次 |
| 文本拼接 | 在 setState 回调里拼接 | 在 ref 里拼接，setState 一次完成 |
| RAF 节流等待 | 无 | 距上次 <50ms 时等下一帧（~16ms） |

**数据流对比**：

```
改造前：
chunk1 → setHistoryList → 重渲染
chunk2 → setHistoryList → 重渲染
chunk3 → setHistoryList → 重渲染
... (每秒 30 次重渲染，CPU 繁忙)

改造后：
chunk1 → 累积到 ref
chunk2 → 累积到 ref
chunk3 → 累积到 ref
         → 50ms到 → setHistoryList(一次) → 重渲染
chunk4 → 累积到 ref
...
```

用户感知无差异（50ms 内拼接用户看不出），但 React 重渲染次数从每秒 30+ 次降至 20 次，CPU 占用显著下降。

---

### 方案2：ref做增量累加，state只做快照

React ref 更新不触发重渲染，state 更新才触发。把流式文本存在 ref 里，用一个独立组件靠 RAF 驱动渲染。

```tsx
const confirmedTextRef = useRef('');   // 已确认文本快照（触发渲染）
const streamingRef = useRef('');       // 当前流式文本（不触发渲染）

// StreamApi 的 onChunk
onChunk: (chunk) => {
  streamingRef.current += chunk;  // 只写ref，不setState → 不重渲染
},

// 子组件：StreamingText 自己驱动渲染，对父组件无影响
function StreamingText({ textRef }) {
  const [display, setDisplay] = useState('');

  useEffect(() => {
    let rafId;
    const sync = () => {
      setDisplay(textRef.current);  // 手动同步
      rafId = requestAnimationFrame(sync);  // 持续同步
    };
    rafId = requestAnimationFrame(sync);
    return () => cancelAnimationFrame(rafId);
  }, [textRef]);

  // 组件内部靠 RAF 60fps 驱动，父组件的 historyList state 不会被频繁触发
  return <MarkdownRenderer content={display} />;
}

// 父组件
const [historyList, setHistoryList] = useState([]);
// historyList 只在消息完整生成后才更新，不受流式影响
onComplete: (fullText) => {
  setHistoryList(prev => [...prev.slice(0, -1), { ...prev[prev.length-1], aiMessage: fullText }]);
},
```

**效果**：流式过程中父组件不会频繁重渲染，只有消息完成后才触发一次状态更新。

---

### 方案3：虚拟列表（长对话优化）

对话超过50条后DOM节点成百上千，用`react-window`只渲染可见区域。

```tsx
import { VariableSizeList as List } from 'react-window';

const MessageList = ({ messages, listRef }) => {
  return (
    <List
      ref={listRef}
      height={600}
      itemCount={messages.length}
      itemSize={(index) => messages[index].cachedHeight || 100}  // 动态高度
      width="100%"
      overscanCount={3}  // 视口外多渲染3条，减少白屏
    >
      {({ index, style }) => (
        <div style={style}>
          <MessageRenderer message={messages[index]} />
        </div>
      )}
    </List>
  );
};

// 消息高度缓存，避免每次都计算
const heightCache = new Map();
function getMessageHeight(msg) {
  if (heightCache.has(msg.id)) return heightCache.get(msg.id);
  // 估算高度后缓存
  const h = estimateHeight(msg);
  heightCache.set(msg.id, h);
  return h;
}
```

**注意**：虚拟列表和流式渲染结合时，流式中的"正在输入"消息高度会动态变化，需要调用 `listRef.current.resetAfterIndex(index)` 通知虚拟列表重新计算。

---

### 三个方案对比

| 方案 | 适用场景 | 复杂度 | 效果 |
|------|---------|--------|------|
| Throttle + RAF | 大部分场景，LLM每秒几十个token时 | 低 | 每秒20次渲染 vs 50次 |
| ref增量 + RAF | 需要实时打字效果，又不想父组件频繁重渲染 | 中 | 父组件几乎不重渲染 |
| 虚拟列表 | 对话超过50条，DOM节点成百上千时 | 中 | 只渲染可见区域~20条 |

**生产级方案**（如ChatGPT、Claude界面）：方案1是基础，大多数产品用 RAF 节流就足够了。方案2适合对渲染性能要求更高的场景。方案3是大后期优化，对话很长时才需要。

---

## 八、后端并发控制与错误处理

> 涵盖：并发控制方案（Semaphore/用户限流/优先级队列）、错误分类与处理、自有模型 vs OpenAI 差别

### 一、为什么AI服务并发控制比普通API难？

```
普通API：请求 → CPU处理 → 返回（毫秒级）
        100并发 → 100个请求同时处理

AI对话API：请求 → GPU推理 → 返回（几秒到几十秒）
           100并发 → 100个请求同时抢GPU → GPU OOM → 全部崩溃
```

### 二、自有模型 vs OpenAI 的核心差别

| 对比项 | OpenAI/Claude API | 自有模型（Qwen/Llama） |
|--------|------------------|----------------------|
| 限速来源 | API平台强制限制（qpm/tpm） | GPU显存+内存限制，**必须自己实现** |
| 请求队列 | 不需要，API自己消化 | **必须自己实现** |
| 超时处理 | API侧控制 | 需自己设定 timeout |
| 降级方案 | 换一个模型/等恢复 | 切备用实例/降级轻量模型 |
| 数据安全 | 数据可能出境（有合规风险） | 内网部署，数据不离场 ✅ |
| 成本模型 | 按token计费 | 固定GPU折旧+电费，无单次费用 ✅ |
| 监控 | 平台提供 | 自己搭建（Prometheus+Grafana） |
| 错误分类 | API返回固定错误码 | 区分：超时/OOM/推理异常/中断 |

### 三、并发控制方案（NestJS + 自有模型）

#### 方案1：Semaphore 信号量（最常用）

```typescript
import { Semaphore } from 'async-mutex';

@Injectable()
export class AiService {
  // 🔑 控制同时只有 N 个请求使用GPU
  private gpuSemaphore = new Semaphore(3);  // 根据GPU显存调整（A100 80G可支持3-5并发）
  private requestTimeoutMs = 60 * 1000;      // 60秒超时

  async getAIStreamResponse(message, sessionId, userId, turnNumber): Observable {
    return new Observable(subscriber => {
      (async () => {
        // 第一步：获取信号量许可证（排队等待，最多等30秒）
        const [license, release] = await this.gpuSemaphore.acquire();

        // 第二步：设置超时保护
        const timeoutId = setTimeout(() => {
          subscriber.error({ code: 'TIMEOUT', message: '请求超时，请稍后重试' });
          release();
        }, this.requestTimeoutMs);

        try {
          const stream = await this.chain.stream({ input: message });

          for await (const chunk of stream) {
            if (abortController.signal.aborted) break;
            subscriber.next({ content: chunk.content });
          }

          subscriber.next({ done: true });
          subscriber.complete();
        } catch (err) {
          subscriber.error({ code: 'LLM_ERROR', message: err.message });
        } finally {
          clearTimeout(timeoutId);
          release();  // 🔑 无论成功失败，必须释放许可证
        }
      })();
    });
  }
}
```

#### 方案2：Per-User 用户维度限流

```typescript
@Injectable()
export class RateLimiterService {
  constructor(@Inject('REDIS') private redis: Redis) {}

  // 用户维度限流：每分钟最多N个请求
  async checkUserRateLimit(userId: number): Promise<{ allowed: boolean; retryAfter?: number }> {
    const key = `ratelimit:user:${userId}`;
    const limit = 10;       // 每分钟10个请求
    const window = 60;     // 60秒窗口

    const multi = this.redis.multi();
    multi.incr(key);
    multi.expire(key, window);
    const results = await multi.exec();

    const count = results[0][1] as number;

    if (count > limit) {
      const ttl = await this.redis.ttl(key);
      return { allowed: false, retryAfter: ttl };
    }

    return { allowed: true };
  }
}

// Controller层使用
@Post('stream')
async stream(@Body() body, @Request() req) {
  const { allowed, retryAfter } = await this.rateLimiter.checkUserRateLimit(req.user.id);

  if (!allowed) {
    throw new HttpException(
      `请求过于频繁，请 ${retryAfter} 秒后重试`,
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  return this.aiService.getAIStreamResponse(body);
}
```

#### 方案3：请求优先级队列

```typescript
enum Priority { LOW = 0, NORMAL = 1, HIGH = 2, CRITICAL = 3 }

@Injectable()
export class PriorityQueueService {
  private queues = new Map<Priority, QueuedRequest[]>();
  private activeCount = 0;
  private maxActive = 3;

  async enqueue<T>(priority: Priority, task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = { id: nanoid(), priority, resolve, reject, createdAt: new Date() };

      if (!this.queues.has(priority)) this.queues.set(priority, []);
      this.queues.get(priority).push(request);

      this.processNext();
    });
  }

  private async processNext() {
    if (this.activeCount >= this.maxActive) return;  // GPU已满，等待

    for (let p = Priority.CRITICAL; p >= Priority.LOW; p--) {
      const queue = this.queues.get(p) || [];
      if (queue.length > 0) {
        const req = queue.shift();
        this.activeCount++;
        try {
          const result = await req.resolve(await this.executeTask(req));
          req.resolve(result);
        } finally {
          this.activeCount--;
          this.processNext();  // 继续处理下一个
        }
        return;
      }
    }
  }

  private async executeTask(req: QueuedRequest) {
    // 实际执行任务
  }
}
```

### 四、错误分类与处理

#### AI系统的三层错误分类

```
LLM层错误：
  - timeout：GPU推理慢，超过60秒
  - OOM：GPU显存不够（最危险，可能导致进程崩溃）
  - model_load_failed：模型文件损坏/加载失败
  - inference_error：推理过程中触发模型bug

RAG层错误：
  - embedding_timeout：Embedding服务挂掉
  - milvus_connection_failed：向量库连接超时
  - retrieval_empty：能连接但查不到（≠ 知识库里没有，而是查不出来）

业务层错误：
  - session_not_found：会话不存在
  - unauthorized：用户未登录
  - permission_denied：权限不足
```

#### Service层：结构化错误返回

```typescript
// ai.service.ts
getAIStreamResponse(message, sessionId, userId, turnNumber): Observable {
  return new Observable(subscriber => {
    (async () => {
      try {
        const stream = await this.chain.stream({ input: message });

        for await (const chunk of stream) {
          if (abortController.signal.aborted) break;
          subscriber.next({ content: chunk.content });
        }

        subscriber.next({ done: true });
        subscriber.complete();

      } catch (err) {
        // 分类处理，返回结构化错误码
        if (err.message.includes('timeout') || err.message.includes('ETIMEDOUT')) {
          subscriber.error({ code: 'TIMEOUT', message: '请求超时，请稍后重试' });
        } else if (err.message.includes('out of memory') || err.message.includes('OOM')) {
          subscriber.error({ code: 'GPU_OOM', message: '服务繁忙，请稍后重试' });
        } else if (err.name === 'AbortError') {
          // 用户主动中断，不算错误，直接结束
          subscriber.complete();
        } else {
          subscriber.error({ code: 'LLM_ERROR', message: 'AI服务异常，请稍后重试' });
        }
      }
    })();
  });
}
```

#### 全局Exception Filter：统一返回格式

```typescript
// all-exceptions.filter.ts
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务异常';
    let code = 'UNKNOWN';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse() as any;
      message = resp.message || exception.message;
      code = resp.code || 'HTTP_ERROR';
    } else if (exception instanceof Error) {
      const err = exception as any;
      if (err.code === 'TIMEOUT')      { status = 504; message = '请求超时'; code = 'TIMEOUT'; }
      else if (err.code === 'GPU_OOM') { status = 503; message = '服务繁忙'; code = 'GPU_OOM'; }
      else if (err.code === 'LLM_ERROR') { status = 502; message = 'AI服务异常'; code = 'LLM_ERROR'; }
    }

    response.status(status).json({
      success: false,
      code,
      message,
      timestamp: Date.now(),
    });
  }
}
```

#### 前端错误处理（streamApi.ts）

```typescript
onError: (error: any) => {
  if (error?.code === 'TIMEOUT') {
    toast.error('请求超时，请重试');
  } else if (error?.code === 'GPU_OOM') {
    toast.error('服务繁忙，请稍后重试');
  } else if (error?.code === 'LLM_ERROR') {
    toast.error('AI服务异常，请联系技术支持');
  } else {
    toast.error(error?.message || '网络异常');
  }
};
```

### 五、流式中断的边界问题（最容易忽略）

```
问题场景：
1. 用户点了"中止"
2. 后端 AbortController.abort() 触发
3. 但前端已经收到了一部分文本
4. 后端没有保存这部分文本到数据库
5. 前端显示了一半的回答，刷新后就没了

✅ 解决：中断时保存已有内容
```

```typescript
// ai.service.ts - interruptStream
async interruptStream(sessionId: string, turnNumber: number) {
  const key = `${sessionId}-${turnNumber}`;
  const controller = this.abortControllers.get(key);

  if (controller) {
    controller.abort();  // 中断GPU推理

    // 🔑 关键：保存已有部分，不要丢弃
    const partialText = await this.getPartialResponse(sessionId, turnNumber);
    if (partialText) {
      await this.saveMessage({
        topicId,
        role: 'assistant',
        content: partialText,  // 保存已有的部分
        turnNumber,
      });
    }

    this.abortControllers.delete(key);
  }
}
```

### 六、自有模型特有的处理

#### GPU显存管理

```typescript
// 模型显存占用估算（A100 80G）
// Qwen-72B ≈ 150GB → 需要多卡，不适合单卡
// Qwen-14B ≈ 30GB  → 单卡支持 2-3 并发
// Qwen-7B  ≈ 16GB   → 单卡支持 4-5 并发

const MODEL_CONFIG = {
  maxConcurrentRequests: 3,      // 根据GPU和模型大小调整
  maxQueueLength: 20,           // 排队队列上限，超限直接拒绝
  requestTimeoutMs: 60000,      // 单请求超时
};

async getAIStreamResponse(...) {
  if (this.pendingRequests >= MODEL_CONFIG.maxConcurrentRequests) {
    if (this.requestQueue.length >= MODEL_CONFIG.maxQueueLength) {
      throw new HttpException('队列已满，请稍后重试', 503);
    }
    return this.enqueueRequest(message);  // 进入排队
  }
}
```

#### 优雅降级

```typescript
// 降级策略：主模型不可用时，降级到轻量模型
@Injectable()
export class ModelFallbackService {
  async chat(prompt: string): Promise<string> {
    const strategies = [
      () => this.primaryModel.chat(prompt),    // Qwen-14B
      () => this.secondaryModel.chat(prompt), // Qwen-7B
      () => this.localModel.chat(prompt),     // 备用轻量模型
    ];

    for (const strategy of strategies) {
      try {
        return await this.withTimeout(strategy(), 30000);
      } catch (err) {
        console.warn(`模型不可用，尝试下一个：${err.message}`);
        continue;
      }
    }

    throw new ServiceUnavailableException('AI服务暂时不可用');
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms)),
    ]);
  }
}
```

#### 监控指标（自有模型必须自己搭）

```typescript
const metrics = {
  requestTotal: counter('ai_request_total'),           // 总请求数
  requestActive: gauge('ai_request_active'),         // 当前活跃请求
  requestDuration: histogram('ai_request_duration'),  // 请求耗时

  gpuMemoryUsed: gauge('gpu_memory_used_bytes'),    // GPU显存使用
  gpuUtilization: gauge('gpu_utilization_percent'), // GPU利用率

  errorTotal: counter('ai_error_total', ['type']),   // 错误计数（按类型）
  timeoutTotal: counter('ai_timeout_total'),         // 超时计数
  oomTotal: counter('ai_oom_total'),                 // OOM计数

  queueLength: gauge('ai_queue_length'),             // 当前排队长度
};
```

### 七、总结对比

| 维度 | OpenAI API | 自有模型 |
|------|-----------|---------|
| 并发控制 | API Key 限流，外部保障 | **必须自己实现** Semaphore + 队列 |
| 限流维度 | Key/IP/组织 | 用户维度 + GPU并发数 |
| 超时处理 | API侧控制 | 自己设置 timeout + AbortController |
| 错误分类 | API返回固定错误码 | 区分：超时/OOM/推理异常/中断 |
| 降级方案 | 平台自动切 | 切备用GPU实例 / 降级轻量模型 |
| 监控 | 平台提供 | 自己搭（Prometheus+Grafana） |
| 数据安全 | 数据可能出境（有合规风险） | 内网部署，数据不离场 ✅ |
| 成本 | 按token计费 | 固定GPU折旧+电费，无单次费用 ✅ |

---

## 九、针对中小并发项目的推荐方案

> 本节针对"并发量不高、医院内部/企业级使用"场景，给出实际推荐的简化方案。

### 一、为什么先别上队列？

队列虽好，但带来了额外的复杂度：

```
没队列：请求 → 等GPU → 直接返回
有队列：请求 → 入队 → 前端轮询状态 → 等轮到 → 开始SSE → 返回
                                      ↑ 这里前端要做很多配合工作
```

有队列时前端需要额外处理的问题：

| 问题 | 说明 | 解决方案 |
|------|------|---------|
| **排队位置** | 用户不知道前面还有几个人 | 前端轮询 `/api/queue/position` |
| **排队超时** | 排了60秒还没轮到 | 前端设计器，超时提示"队列超时" |
| **SSE连接复用** | 排队期间连接要保持 | WebSocket或短轮询 |
| **队列中取消** | 用户等不及点取消了 | 前端调 `/api/queue/cancel` |
| **页面跳转** | 用户切走再回来还在排吗 | 队列跟session绑定 |

**对于中小并发项目，这些工作是不必要的复杂度。**

### 二、推荐：Semaphore + 模型降级，足够了

```
阶段1：Semaphore 单一并发控制（⭐ 5行代码，零前端改动）
    ↓ 遇到问题
阶段2：Semaphore + 模型降级（⭐⭐ 加个try-catch兜底）
    ↓ 真正扛不住
阶段3：Semaphore + 完整队列（⭐⭐⭐⭐ 前端要配合轮询）
```

### 三、阶段1：Semaphore（最简化实现）

```typescript
// ai.service.ts
import { Semaphore } from 'async-mutex';

@Injectable()
export class AiService {
  // 控制同时只有 N 个请求使用GPU（根据GPU显存调整）
  private gpuSemaphore = new Semaphore(3);
  private requestTimeoutMs = 60 * 1000;

  async getAIStreamResponse(
    message: string,
    sessionId: string,
    userId: number,
    turnNumber: number,
  ): Observable<{ content: string; done?: boolean; error?: string }> {
    const abortController = new AbortController();
    const subscriptionKey = `${sessionId}-${turnNumber}`;
    this.abortControllers.set(subscriptionKey, abortController);

    let fullResponse = '';

    return new Observable(subscriber => {
      (async () => {
        // 🔑 获取信号量许可证（最多等30秒）
        const [license, release] = await this.gpuSemaphore.acquire();

        // 🔑 超时保护
        const timeoutId = setTimeout(() => {
          subscriber.error({ code: 'TIMEOUT', message: '请求超时，请稍后重试' });
          release();
        }, this.requestTimeoutMs);

        try {
          // 保存用户消息
          const topic = await this.conversationService.findOrCreateTopic(sessionId, userId, message);
          await this.conversationService.saveMessage({
            topicId: topic!.id, role: 'user', content: message, turnNumber,
          });

          // RAG检索
          const { context } = await this.getRetrievalByHandleCustomData(message, 'local');

          // 构建Prompt
          const prompt = ChatPromptTemplate.fromMessages([
            ['system', `你是医疗客服助手，只能基于以下参考资料回答。
如果资料中没有相关信息，请回答"我暂时无法回答，建议咨询医生"。
参考资料：{context}`],
            ['human', '{input}'],
          ]);

          // 流式调用LLM
          const chain = prompt.pipe(this.chatModel);
          const stream = await chain.stream(
            { input: message },
            { signal: abortController.signal },
          );

          for await (const chunk of stream) {
            if (abortController.signal.aborted) break;
            if (chunk?.content) {
              fullResponse += chunk.content;
              subscriber.next({ content: chunk.content });
            }
          }

          // 保存AI回复
          await this.conversationService.saveMessage({
            topicId: topic!.id, role: 'assistant', content: fullResponse, turnNumber,
          });

          subscriber.next({ done: true });
          subscriber.complete();
        } catch (err) {
          if (err.name === 'AbortError') {
            subscriber.complete();
          } else {
            subscriber.error({ code: 'LLM_ERROR', message: err.message });
          }
        } finally {
          clearTimeout(timeoutId);
          release(); // 🔑 无论成功失败，必须在finally里释放
          this.abortControllers.delete(subscriptionKey);
        }
      })();
    });
  }
}
```

**效果**：
- 第4个请求来 → 等前面某个完成（Semaphore排队）→ 有空位了再执行
- 前端零改动，跟之前一样订阅SSE
- 最多等多久？取决于GPU推理速度，一般10-30秒

### 四、阶段2：加模型降级（加个兜底）

```typescript
// ai.service.ts - 新增 chatWithFallback 方法

// 模型配置
private modelConfigs = {
  primary:   { name: 'qwen14b', maxConcurrent: 3 },   // 主模型，精度高
  fallback: { name: 'qwen7b',  maxConcurrent: 6 },   // 降级模型，显存小，支持更高并发
};

@Injectable()
export class AiService {
  private primarySemaphore = new Semaphore(3);
  private fallbackSemaphore = new Semaphore(6);

  // 🔑 带降级的聊天方法
  private async chatWithFallback(prompt: Prompt): Promise<string> {
    try {
      // 第一步：尝试主模型（14B）
      return await this.chatWithModel(prompt, 'primary');
    } catch (err) {
      console.warn(`主模型不可用，尝试降级：${err.message}`);

      try {
        // 第二步：降级到7B模型
        return await this.chatWithModel(prompt, 'fallback');
      } catch (fallbackErr) {
        console.error(`降级模型也失败：${fallbackErr.message}`);
        throw new Error('AI服务暂时不可用，请稍后重试');
      }
    }
  }

  private async chatWithModel(prompt: Prompt, tier: 'primary' | 'fallback'): Promise<string> {
    const config = this.modelConfigs[tier];
    const semaphore = tier === 'primary' ? this.primarySemaphore : this.fallbackSemaphore;

    const [license, release] = await semaphore.acquire();

    try {
      // 根据 tier 选择不同的模型实例
      const model = tier === 'primary' ? this.qwen14bModel : this.qwen7bModel;
      return await model.invoke(prompt);
    } finally {
      release();
    }
  }
}
```

**降级触发条件**：
- 主模型 OOM（显存不够）
- 主模型加载失败
- 主模型推理超时

**7B降级的好处**：
- 显存占用小（~16GB vs ~30GB）
- 支持更高并发（6个 vs 3个）
- 虽然精度略低，但能返回结果总比报错强

### 五、什么时候才需要上队列？

Semaphore + 降级扛不住的特征（满足任意一条再考虑加队列）：

```
□ 同时访问用户 > 10人
□ GPU利用率经常 > 80%
□ 开始出现 GPU OOM 报错
□ 用户反馈"经常等很久"
□ 排队等待时间经常 > 60秒
```

**判断方法**：加一个简单的队列长度监控：

```typescript
// ai.service.ts
private queueWaitCount = 0; // 拿不到信号量的次数统计

async getAIStreamResponse(...) {
  // 尝试获取信号量
  const [license, release] = await this.gpuSemaphore.tryAcquire();

  if (!license) {
    // 没拿到，说明队列在积压
    this.queueWaitCount++;
    console.warn(`队列积压：当前等待数 ${this.queueWaitCount}`);

    // 如果经常 > 5，说明需要上完整队列了
    if (this.queueWaitCount > 5) {
      console.error('队列积压严重，建议接入完整队列方案');
    }

    // 继续等待（Semaphore会自动排队）
    return this.waitForGpuSlot(message, sessionId, userId, turnNumber);
  }

  // 正常处理...
}
```

### 六、总结对比

| 阶段 | 方案 | 前端改动 | 复杂度 | 适用场景 |
|------|------|---------|--------|---------|
| 现在 | Semaphore | 零改动 | ⭐ | 3-5并发够用 |
| 遇到问题 | Semaphore + 降级 | 零改动 | ⭐⭐ | GPU OOM时自动降7B |
| 扛不住 | Semaphore + 完整队列 | 前端轮询排队状态 | ⭐⭐⭐⭐ | >10并发，真正需要 |

**结论**：直接上阶段1（Semaphore），加个阶段2（降级）作为兜底。有队列的复杂度是Semaphore的5倍以上，但对于你描述的并发量，Semaphore + 降级完全够用了。

---

## 十、多实例部署下的并发控制

> 本节针对"多实例部署、GPU共享或独立"场景，讨论跨实例的并发协调方案。

### 一、问题：本地Semaphore无法跨实例协调

```
每个实例有自己的Semaphore（3并发）：
Instance 1 (Semaphore 3) ←── LB随机分发 ──→ 用户A, B, C
Instance 2 (Semaphore 3) ←── LB随机分发 ──→ 用户D, E, F
Instance 3 (Semaphore 3) ←── LB随机分发 ──→ 用户G, H, I

问题：
- 如果3个实例共享同一个GPU集群 → 实际9个并发，GPU可能扛不住
- 如果每个实例独立GPU → 无需协调，各自管各自的
```

**关键判断：你的GPU是每实例独立，还是共享集群？**

```
GPU独立（每台机器有自己GPU）→ 方案3（只靠LB）就够了
GPU共享（集群模式）→ 方案1（Redis分布式锁）
```

---

### 二、方案对比

| 方案 | 复杂度 | 适用场景 |
|------|--------|---------|
| **方案1：Redis分布式信号量** | ⭐⭐ | GPU共享，多实例共用锁 |
| **方案2：消息队列BullMQ** | ⭐⭐⭐ | 高吞吐，异步处理，>10实例 |
| **方案3：只靠LB分发** | ⭐ | GPU每台独立，不共享 |
| **方案4：Redis+本地混合** | ⭐⭐⭐ | 本地快速判断+全局协调 |

---

### 三、方案1：Redis分布式信号量（最常见）

#### 原理

```
不用实例本地的Semaphore，改用Redis做全局锁

Instance 1 想处理请求 → Redis SETnx("gpu_slot", "locked") → 成功 → 处理
Instance 2 想处理请求 → Redis SETnx("gpu_slot", "locked") → 失败（已被锁）→ 等
Instance 1 处理完      → Redis DEL("gpu_slot")          → 锁释放
Instance 2 → 拿到锁了 → 开始处理
```

#### 完整实现

```typescript
// distributed-semaphore.service.ts
import Redis from 'ioredis';

@Injectable()
export class DistributedSemaphore {
  private redis: Redis;
  private slotKey = 'ai:gpu_slot';
  private slotCount = 3;          // 全局只有3个GPU槽位（所有实例共用）
  private lockTimeout = 120 * 1000;  // 锁超时120秒（防止实例崩溃没释放）

  constructor(@Inject('REDIS') redis: Redis) {
    this.redis = redis;
  }

  // 🔑 获取全局锁（所有实例共用）
  async acquire(timeoutMs = 30000): Promise<{ granted: boolean; ticketId?: string }> {
    const ticketId = nanoid();
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      // Lua脚本保证原子性：检查槽位是否可用
      const script = `
        local count = redis.call('GET', KEYS[1]) or '0'
        if tonumber(count) < tonumber(ARGV[1]) then
          redis.call('INCR', KEYS[1])
          redis.call('EXPIRE', KEYS[1], ARGV[2])
          return '1'
        end
        return '0'
      `;

      const result = await this.redis.eval(
        script,
        1,
        this.slotKey,
        this.slotCount,
        Math.floor(this.lockTimeout / 1000),
      );

      if (result === '1') {
        return { granted: true, ticketId };
      }

      // 没拿到，等200ms再试（避免疯狂轮询）
      await new Promise(r => setTimeout(r, 200));
    }

    return { granted: false };  // 超时了
  }

  // 🔑 释放全局锁
  async release(ticketId: string): Promise<void> {
    const script = `
      local count = redis.call('GET', KEYS[1]) or '0'
      if tonumber(count) > 0 then
        redis.call('DECR', KEYS[1])
      end
      return '1'
    `;
    await this.redis.eval(script, 1, this.slotKey);
  }
}
```

#### 在AiService中使用

```typescript
@Injectable()
export class AiService {
  constructor(
    private distributedSemaphore: DistributedSemaphore,
  ) {}

  async getAIStreamResponse(...): Observable {
    return new Observable(subscriber => {
      (async () => {
        // 🔑 从全局锁获取GPU槽位（所有实例共用）
        const { granted } = await this.distributedSemaphore.acquire(30000);

        if (!granted) {
          subscriber.error({
            code: 'QUEUE_FULL',
            message: '当前请求过多，请稍后重试'
          });
          return;
        }

        try {
          const stream = await this.chain.stream({ input: message });
          // ... 正常处理
        } finally {
          // 🔑 释放全局锁
          await this.distributedSemaphore.release(ticketId);
        }
      })();
    });
  }
}
```

#### 效果

```
Instance 1 (请求A) → Redis锁+1 → 正在处理
Instance 1 (请求B) → Redis锁+1 → 正在处理
Instance 1 (请求C) → Redis锁+1 → 正在处理
Instance 2 (请求D) → Redis锁已满(3) → 等200ms → 再试...
Instance 3 (请求E) → Redis锁已满(3) → 等200ms → 再试...
Instance 1 请求A完成 → Redis锁-1
Instance 2 请求D → 拿到锁了 → 开始处理

任意实例拿到就算，全局不超过3个并发
```

---

### 四、方案2：消息队列BullMQ（高吞吐场景）

```typescript
// main.ts - 启动Worker
import { Worker } from 'bullmq';

const worker = new Worker('ai-chat', async (job) => {
  const { message, sessionId, userId, turnNumber } = job.data;

  // BullMQ内部控制全局并发（通过Redis协调）
  const stream = await aiService.getAIStreamResponse(message, sessionId, userId, turnNumber);

  return new Promise((resolve, reject) => {
    stream.subscribe({
      next: (chunk) => job.updateProgress(chunk),
      complete: () => resolve('done'),
      error: (err) => reject(err),
    });
  });
}, {
  connection: redis,
  concurrency: 3,  // 🔑 BullMQ自己控制全局并发
});

// Controller只负责把请求扔进队列
@Post('chat')
async chat(@Body() body) {
  const job = await queue.add('chat', {
    message: body.message,
    sessionId: body.sessionId,
    userId: body.userId,
    turnNumber: body.turnNumber,
  });

  return { jobId: job.id, status: 'queued' };  // 前端轮询状态
}

// 前端轮询接口
@Get('job/:id')
async getJobStatus(@Param('id') jobId: string) {
  const job = await queue.getJob(jobId);
  const state = await job.getState();

  return { status: state, progress: job.progress };
}
```

**BullMQ的好处**：
- Redis自动协调跨实例并发
- 请求持久化（实例挂了也不丢）
- 有重试机制
- 前端轮询状态

---

### 五、方案3：只靠LB分发（GPU每台独立）

```
实例1 (Semaphore 3) ← LB随机分发
实例2 (Semaphore 3) ← LB随机分发
实例3 (Semaphore 3) ← LB随机分发

实际效果：共9个并发分散到3台机器
每台机器各自管自己的3并发
```

**前提**：
- GPU是每台实例独立的，不是共享集群
- 实例间没有共享资源竞争
- LB能比较均匀地分发请求

**如果GPU是共享的集群，这个方案不行。**

---

### 六、方案4：Redis+本地混合模式

```typescript
// hybrid模式：本地Semaphore做快速判断，Redis做全局协调

@Injectable()
export class HybridConcurrencyService {
  private localSemaphore = new Semaphore(3);  // 本地快速判断
  private redis: Redis;
  private globalKey = 'ai:global_slots';
  private globalLimit = 3;

  async acquire(): Promise<boolean> {
    // 第一步：本地快速判断（毫秒级）
    const [localOk, localRelease] = await this.localSemaphore.tryAcquire();
    if (!localOk) {
      // 本地满了，走Redis全局锁
      return await this.acquireRedisLock();
    }

    // 第二步：本地拿到了，再拿Redis全局锁（确保跨实例协调）
    const redisOk = await this.tryAcquireRedisLock();
    if (!redisOk) {
      localRelease();  // Redis没拿到，本地也释放
      return await this.acquireRedisLock();
    }

    return true;  // 两边都拿到了
  }

  private async tryAcquireRedisLock(): Promise<boolean> {
    const result = await this.redis.eval(`
      local count = redis.call('GET', KEYS[1]) or '0'
      if tonumber(count) < tonumber(ARGV[1]) then
        redis.call('INCR', KEYS[1])
        return '1'
      end
      return '0'
    `, 1, this.globalKey, this.globalLimit);

    return result === '1';
  }
}
```

**适用场景**：本地先快速判断（毫秒级），Redis做最终兜底，减少Redis请求次数。

---

### 七、GPU独立 vs 共享的判断

```
场景1：每台服务器有独立GPU（推荐）
  → 方案3（只靠LB）就够了，各自管各自

场景2：GPU集群共享（多实例连同一个GPU服务器）
  → 方案1（Redis分布式锁）必须上

场景3：GPU集群 + 高吞吐（>10实例）
  → 方案2（BullMQ）
```

---

### 八、总结对比

| 维度 | 方案1（Redis分布式锁） | 方案2（BullMQ） | 方案3（只靠LB） | 方案4（混合） |
|------|----------------------|----------------|----------------|--------------|
| 复杂度 | ⭐⭐ | ⭐⭐⭐ | ⭐ | ⭐⭐⭐ |
| GPU协调 | ✅ 全局 | ✅ 全局 | ❌ 独立 | ✅ 全局 |
| 前端改动 | 零改动 | 需轮询 | 零改动 | 零改动 |
| 请求持久化 | ❌ | ✅ | ❌ | ❌ |
| 适用规模 | 中等 | 高吞吐 | 小规模 | 中等 |
| 医院/企业内 | ✅ 推荐 | 视情况 | ✅（GPU独立时） | 视情况 |

**结论**：
- GPU每台独立 → 方案3（只靠LB，最简单）
- GPU共享集群 → 方案1（Redis分布式锁）
- 高吞吐 >10实例 → 方案2（BullMQ）