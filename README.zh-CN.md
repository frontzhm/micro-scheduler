# micro-scheduler

一个轻量级、高性能的微任务调度器，用于在浏览器和 Node.js 环境中管理批量任务执行。

## 特性

- 🚀 **批量任务执行**：自动批量管理任务，统一在微任务队列中执行
- 🔄 **自动去重**：使用 `Set` 自动去重，避免重复执行相同任务
- ⚡ **异步和同步刷新**：支持异步和同步两种任务执行方式
- 🎯 **生命周期钩子**：提供 `onBeforeFlush` 和 `onAfterFlush` 回调
- 🛡️ **错误隔离**：单个任务错误不会影响其他任务执行
- 📦 **通用性**：同时支持浏览器和 Node.js 环境
- 💪 **TypeScript**：完整的 TypeScript 支持和类型定义

## 安装

### npm / pnpm / yarn

```bash
npm install micro-scheduler
# 或
pnpm add micro-scheduler
# 或
yarn add micro-scheduler
```

### CDN

你也可以通过 CDN 直接使用：

**unpkg:**

```html
<!-- ESM -->
<script type="module">
  import { MicroScheduler } from 'https://unpkg.com/micro-scheduler@latest/dist/index.mjs';
</script>

<!-- UMD (浏览器全局变量) -->
<script src="https://unpkg.com/micro-scheduler@latest/dist/index.js"></script>
```

**jsDelivr:**

```html
<!-- ESM -->
<script type="module">
  import { MicroScheduler } from 'https://cdn.jsdelivr.net/npm/micro-scheduler@latest/dist/index.mjs';
</script>

<!-- UMD (浏览器全局变量) -->
<script src="https://cdn.jsdelivr.net/npm/micro-scheduler@latest/dist/index.js"></script>
```

## 使用方法

### 浏览器环境

#### 使用 ES 模块（推荐）

```html
<script type="module">
  import { MicroScheduler } from 'https://unpkg.com/micro-scheduler@latest/dist/index.mjs';
  // 或
  // import { MicroScheduler } from 'https://cdn.jsdelivr.net/npm/micro-scheduler@latest/dist/index.mjs';

  const scheduler = new MicroScheduler();

  scheduler.enqueue(() => {
    console.log('任务 1');
  });

  scheduler.enqueue(() => {
    console.log('任务 2');
  });

  // 任务将在微任务队列中执行
  await scheduler.tick;
  // 输出: 任务 1, 任务 2
</script>
```

#### 使用 npm 包

```html
<script type="module">
  import { MicroScheduler } from './node_modules/micro-scheduler/dist/index.mjs';

  const scheduler = new MicroScheduler();
  // ...
</script>
```

### Node.js 环境

```javascript
// ESM
import { MicroScheduler } from 'micro-scheduler';

// CommonJS
const { MicroScheduler } = require('micro-scheduler');

const scheduler = new MicroScheduler();

scheduler.enqueue(() => {
  console.log('任务已执行');
});

await scheduler.tick;
```

### TypeScript

```typescript
import { MicroScheduler } from 'micro-scheduler';

const scheduler = new MicroScheduler();

scheduler.enqueue(() => {
  console.log('类型安全的任务');
});
```

## API 文档

### `MicroScheduler`

#### 构造函数

```typescript
const scheduler = new MicroScheduler();
```

创建一个新的调度器实例。

#### 方法

##### `enqueue(task: () => void): void`

将任务添加到队列并调度执行。任务会自动去重。

```typescript
scheduler.enqueue(() => {
  console.log('任务 1');
});

scheduler.enqueue(() => {
  console.log('任务 2');
});
```

##### `flush(): void`

异步触发批量执行所有队列中的任务（调度到微任务队列）。

```typescript
scheduler.enqueue(task1);
scheduler.enqueue(task2);
scheduler.flush(); // 任务将在微任务队列中执行
```

##### `flushSync(): void`

同步立即执行所有队列中的任务（不等待微任务）。

```typescript
scheduler.enqueue(task1);
scheduler.enqueue(task2);
scheduler.flushSync(); // 任务立即执行
```

##### `onBeforeFlush(callback: () => void): Unsubscribe`

注册一个在任务执行前调用的回调函数。返回取消订阅的函数。

```typescript
const unsubscribe = scheduler.onBeforeFlush(() => {
  console.log('执行前');
});

scheduler.enqueue(() => console.log('任务'));

// 稍后，移除回调：
unsubscribe();
```

##### `onAfterFlush(callback: () => void): Unsubscribe`

注册一个在任务执行后调用的回调函数。返回取消订阅的函数。

```typescript
const unsubscribe = scheduler.onAfterFlush(() => {
  console.log('执行后');
});

scheduler.enqueue(() => console.log('任务'));
```

#### 属性

##### `tick: Promise<void>`

一个 Promise，在微任务队列刷新时解析。用于等待任务完成。

```typescript
scheduler.enqueue(() => console.log('任务'));
await scheduler.tick; // 等待任务完成
```

## 实现思路

### 核心设计

1. **任务队列**：使用 `Set` 数据结构自动去重相同的任务
2. **微任务调度**：利用 `queueMicrotask` API（对旧环境提供降级方案）
3. **批量执行**：所有任务在单个微任务中一起执行，提高性能
4. **状态管理**：使用标志位（`isFlushing`、`isFlushScheduled`）防止重复调度

### 关键技术点

#### 1. 自动去重机制

任务存储在 `Set` 中，因此相同的函数引用会自动去重：

```typescript
const task = () => console.log('任务');
scheduler.enqueue(task);
scheduler.enqueue(task); // 重复，不会执行两次
scheduler.enqueue(task); // 重复，不会执行两次
```

#### 2. 微任务队列

任务被调度到微任务队列中执行，确保它们：

- 在当前同步代码之后执行
- 在下一次事件循环之前执行
- 按照入队顺序执行

#### 3. 错误隔离

每个任务的错误都会被单独捕获，防止一个失败的任务影响其他任务：

```typescript
scheduler.enqueue(() => {
  throw new Error('任务 1 失败');
});

scheduler.enqueue(() => {
  console.log('任务 2 仍会执行');
});

// 即使任务 1 抛出错误，任务 2 仍会执行
```

#### 4. 生命周期钩子

调度器提供执行前后的钩子，可用于：

- 日志记录和调试
- 性能监控
- 状态管理

### 性能优化

- **批量处理**：多个任务在单个微任务中执行，减少开销
- **去重机制**：防止不必要的重复执行
- **延迟调度**：仅在需要时才调度任务
- **内存高效**：使用 `Set` 实现 O(1) 查找和去重

### 实现细节

#### 任务调度流程

1. **入队阶段**：调用 `enqueue()` 将任务添加到 `Set` 队列
2. **调度阶段**：检查是否已调度，如未调度则调用 `scheduleFlush()`
3. **微任务阶段**：将执行逻辑放入微任务队列
4. **执行阶段**：
   - 执行 `onBeforeFlush` 回调
   - 遍历任务队列执行所有任务
   - 执行 `onAfterFlush` 回调
5. **清理阶段**：重置状态标志，准备下一轮调度

#### 防重复调度机制

使用两个标志位防止重复调度：

- `isFlushScheduled`：标记是否已将 flush 调度到微任务队列
- `isFlushing`：标记是否正在执行任务

这确保了即使多次调用 `enqueue()` 或 `flush()`，也只会触发一次微任务。

#### 兼容性处理

对于不支持 `queueMicrotask` 的环境，使用 Promise 降级方案：

```typescript
this.queueMicrotaskFn =
  typeof queueMicrotask !== 'undefined' ? queueMicrotask : (cb) => this.microtaskPromise.then(cb);
```

## 使用示例

### 基础用法

```typescript
import { MicroScheduler } from 'micro-scheduler';

const scheduler = new MicroScheduler();

// 添加任务
scheduler.enqueue(() => updateUI());
scheduler.enqueue(() => logEvent());
scheduler.enqueue(() => sendAnalytics());

// 等待所有任务完成
await scheduler.tick;
```

### 使用生命周期钩子

```typescript
const scheduler = new MicroScheduler();

// 执行前记录日志
scheduler.onBeforeFlush(() => {
  console.log('开始批量执行');
});

// 执行后记录日志
scheduler.onAfterFlush(() => {
  console.log('批量执行完成');
});

scheduler.enqueue(() => console.log('任务'));
await scheduler.tick;
// 输出:
// 开始批量执行
// 任务
// 批量执行完成
```

### 错误处理

```typescript
const scheduler = new MicroScheduler();

scheduler.enqueue(() => {
  throw new Error('这个错误会被捕获');
});

scheduler.enqueue(() => {
  console.log('这个任务仍会执行');
});

await scheduler.tick;
// 输出: 这个任务仍会执行
// 错误会被记录但不会停止执行
```

### 同步执行

```typescript
const scheduler = new MicroScheduler();

scheduler.enqueue(() => console.log('任务 1'));
scheduler.enqueue(() => console.log('任务 2'));

// 立即执行（同步）
scheduler.flushSync();
// 输出: 任务 1, 任务 2 (立即)
```

## 许可证

MIT

## 贡献

欢迎贡献！请随时提交 Pull Request。
