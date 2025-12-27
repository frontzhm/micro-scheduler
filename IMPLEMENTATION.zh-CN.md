# 从0到1实现通用微任务调度器：理解前端异步调度核心

微任务（Microtask）是前端异步编程的核心概念，广泛应用于Vue/react的更新、Promise回调、事件循环优化等场景。手动实现一个通用的微任务调度器，不仅能加深对事件循环的理解，还能解决「批量执行异步任务、统一控制执行时机」的实际开发需求。

本文将从「最小可用版」到「生产级优化版」，一步步拆解微任务调度器的实现思路，最终给出可直接复用的完整代码。

## 一、核心需求与设计思路

### 1. 要解决的问题

在前端开发中，频繁触发的异步任务（如多次更新DOM、批量数据处理）如果直接执行，会导致多次微任务创建，增加性能开销。我们需要：

- 批量管理任务，去重且统一在微任务队列执行；

- 支持任务执行前/后的回调（如初始化/清理逻辑）；

- 外部可通过`await`等待所有任务执行完成；

- 兼容浏览器/Node.js环境（处理`queueMicrotask` API兼容性）。

### 2. 核心设计原则

- **去重执行**：用`Set`存储任务，避免重复添加；

- **防重复调度**：标记是否已将执行逻辑放入微任务队列，避免多次触发；

- **状态隔离**：用私有属性封装内部状态（如`isFlushing`），对外暴露可控的API；

- **兼容降级**：无`queueMicrotask`时，用`Promise.resolve().then()`兜底。

## 二、Step 1：实现最小可用版调度器

先搭建核心骨架，完成「添加任务、批量执行」的基础能力，暂不处理回调、异常、兼容等细节。

### 1. 定义基础类型

先明确核心类型，让代码语义更清晰：

```typescript
// 待执行的任务类型（无参无返回值函数）
export type TaskToQueue = () => void;

// 取消回调的函数类型
export type Unsubscribe = () => void;
```

### 2. 核心类实现（最小版）

```typescript
/**
 * 最小可用版微任务调度器
 * 核心能力：添加任务、批量在微任务执行、防重复调度
 */
export class MicroScheduler {
  // 任务队列：Set自动去重
  private readonly taskQueue = new Set<TaskToQueue>();
  // 标记是否已调度微任务执行（防重复）
  private isFlushScheduled = false;
  // 标记是否正在执行任务（避免嵌套执行）
  private isFlushing = false;

  /**
   * 添加任务到队列，并触发调度
   */
  enqueue(task: TaskToQueue): void {
    this.taskQueue.add(task);
    this.scheduleFlush();
  }

  /**
   * 调度任务执行到微任务队列（核心：防重复调度）
   */
  private scheduleFlush(): void {
    // 已调度/正在执行，直接返回
    if (this.isFlushScheduled || this.isFlushing) return;

    this.isFlushScheduled = true;
    // 核心：将执行逻辑放入微任务队列
    queueMicrotask(() => {
      this.isFlushScheduled = false;
      this.executeTasks();
    });
  }

  /**
   * 批量执行所有任务
   */
  private executeTasks(): void {
    if (this.isFlushing) return;
    this.isFlushing = true;

    // 遍历执行所有任务，执行后从队列移除
    this.taskQueue.forEach((task) => {
      task();
      this.taskQueue.delete(task);
    });

    this.isFlushing = false;
  }
}
```

### 3. 测试最小版功能

```typescript
// 实例化调度器
const scheduler = new MicroScheduler();

// 添加2个任务（故意重复添加，测试去重）
const task1 = () => console.log('执行任务1');
scheduler.enqueue(task1);
scheduler.enqueue(task1); // 重复添加，Set会自动去重
scheduler.enqueue(() => console.log('执行任务2'));

// 输出结果（微任务阶段执行）：
// 执行任务1
// 执行任务2
```

### 关键逻辑说明

- `scheduleFlush`：核心防重复逻辑，确保多次调用`enqueue`仅触发一次微任务；

- `isFlushing`：避免执行任务时嵌套调用`executeTasks`（如任务中再次`enqueue`）；

- `Set`存储任务：天然解决重复添加问题，比数组更高效。

## 三、Step 2：扩展核心能力

在最小版基础上，添加「同步执行、前后回调、外部等待」能力，逐步完善功能。

### 1. 添加同步执行方法`flushSync`

支持手动同步执行任务（不等待微任务）：

```typescript
/**
 * 同步触发任务执行（立即执行，不等待微任务）
 */
flushSync(): void {
  this.executeTasks();
}
```

### 2. 添加执行前/后回调

支持注册/取消「执行前/后」的回调，满足初始化、清理等场景：

```typescript
// 新增：执行前/后回调队列
private readonly beforeFlushCallbacks = new Set<() => void>();
private readonly afterFlushCallbacks = new Set<() => void>();

/**
 * 注册「任务执行前」的回调
 * @returns 取消回调的函数
 */
onBeforeFlush(callback: () => void): Unsubscribe {
  this.beforeFlushCallbacks.add(callback);
  return () => this.beforeFlushCallbacks.delete(callback);
}

/**
 * 注册「任务执行后」的回调
 */
onAfterFlush(callback: () => void): Unsubscribe {
  this.afterFlushCallbacks.add(callback);
  return () => this.afterFlushCallbacks.delete(callback);
}

// 改造executeTasks：执行前后回调
private executeTasks(): void {
  if (this.isFlushing) return;
  this.isFlushing = true;

  // 1. 执行前置回调
  this.beforeFlushCallbacks.forEach((cb) => cb());

  // 2. 执行任务
  this.taskQueue.forEach((task) => {
    task();
    this.taskQueue.delete(task);
  });

  // 3. 执行后置回调
  this.afterFlushCallbacks.forEach((cb) => cb());

  this.isFlushing = false;
}
```

### 3. 支持外部`await`等待执行完成

添加`tick`属性，基于固定的`Promise`实现外部等待（核心：用初始化的`Promise`做「时间锚点」，避免每次创建新Promise导致等待失效）：

```typescript
// 新增：固定的微任务Promise（仅初始化一次）
private readonly microtaskPromise = Promise.resolve<void>(undefined);

// 公开只读属性：外部可await
readonly tick = this.microtaskPromise;
```

### 测试扩展能力

```typescript
const scheduler = new MicroScheduler();

// 注册前后回调
const unsubBefore = scheduler.onBeforeFlush(() => console.log('任务执行前'));
scheduler.onAfterFlush(() => console.log('任务执行后'));

// 添加任务
scheduler.enqueue(() => console.log('执行任务'));

// 外部等待任务执行完成
async function test() {
  await scheduler.tick;
  console.log('所有任务执行完毕');
  unsubBefore(); // 取消前置回调
}

test();

// 输出顺序：
// 任务执行前
// 执行任务
// 任务执行后
// 所有任务执行完毕
```

## 四、Step 3：兼容与容错优化（生产级）

完成核心功能后，添加「环境兼容、参数校验、异常捕获」，让代码更健壮。

### 1. 兼容`queueMicrotask` API

Node.js和部分老浏览器可能未实现`queueMicrotask`，需降级到`Promise`：

```typescript
// 声明全局queueMicrotask类型（兼容TS）
declare const queueMicrotask: ((callback: () => void) => void) | undefined;

// 新增：兼容后的微任务执行函数
private readonly queueMicrotaskFn: (callback: () => void) => void;

// 改造构造函数：初始化兼容函数
constructor() {
  this.queueMicrotaskFn =
    typeof queueMicrotask !== 'undefined'
      ? queueMicrotask
      : (cb) => this.microtaskPromise.then(cb);
}

// 改造scheduleFlush：使用兼容后的函数
private scheduleFlush(): void {
  if (this.isFlushScheduled || this.isFlushing) return;
  this.isFlushScheduled = true;
  this.queueMicrotaskFn(() => {
    this.isFlushScheduled = false;
    this.executeTasks();
  });
}
```

### 2. 添加参数校验

避免传入非函数类型的任务/回调：

```typescript
// 改造enqueue
enqueue(task: TaskToQueue): void {
  if (typeof task !== 'function') {
    throw new TypeError('enqueue 必须传入函数类型的任务');
  }
  this.taskQueue.add(task);
  this.scheduleFlush();
}

// 封装回调注册逻辑，添加校验
private registerCallback(callbacks: Set<() => void>, callback: () => void): Unsubscribe {
  if (typeof callback !== 'function') {
    throw new TypeError('回调必须是函数类型');
  }
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

// 改造onBeforeFlush/onAfterFlush，复用校验逻辑
onBeforeFlush(callback: () => void): Unsubscribe {
  return this.registerCallback(this.beforeFlushCallbacks, callback);
}

onAfterFlush(callback: () => void): Unsubscribe {
  return this.registerCallback(this.afterFlushCallbacks, callback);
}
```

### 3. 异常捕获（容错）

单个任务/回调执行失败，不影响整体流程：

```typescript
private executeTasks(): void {
  if (this.isFlushing) return;
  this.isFlushing = true;

  try {
    // 1. 执行前置回调（捕获单个回调异常）
    const beforeCallbacks = Array.from(this.beforeFlushCallbacks);
    beforeCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('执行前置回调失败:', e);
      }
    });

    // 2. 执行任务（复制队列，避免迭代时修改）
    const tasks = Array.from(this.taskQueue);
    tasks.forEach((task) => {
      try {
        task();
      } catch (e) {
        console.error('执行任务失败:', e);
      }
      this.taskQueue.delete(task);
    });
  } finally {
    // 无论是否出错，都执行后置回调+重置状态
    const afterCallbacks = Array.from(this.afterFlushCallbacks);
    afterCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('执行后置回调失败:', e);
      }
    });
    this.isFlushing = false;
  }
}
```

## 五、完整生产级代码

整合所有优化，最终的完整代码如下（可直接复制复用）：

```typescript
// 类型命名更精准，贴合场景
export type TaskToQueue = () => void;
// 取消回调的函数类型（语义更清晰）
export type Unsubscribe = () => void;

// 声明全局 queueMicrotask 类型（兼容 Node.js 和浏览器环境）
declare const queueMicrotask: ((callback: () => void) => void) | undefined;

/**
 * 微任务调度器类
 * 核心能力：批量管理任务，统一在微任务队列执行，支持执行前后回调
 */
export class MicroScheduler {
  // ========== 私有属性（封装，外部不可访问） ==========
  // 任务队列：Set 自动去重，避免重复执行
  private readonly taskQueue = new Set<TaskToQueue>();
  // 执行前回调队列
  private readonly beforeFlushCallbacks = new Set<() => void>();
  // 执行后回调队列
  private readonly afterFlushCallbacks = new Set<() => void>();
  // 标记是否正在执行任务
  private isFlushing = false;
  // 标记是否已将 flush 调度到微任务队列
  private isFlushScheduled = false;
  // 固定的微任务 Promise，用于外部 await 等待执行完成（仅初始化一次）
  private readonly microtaskPromise = Promise.resolve<void>(undefined);
  // 兼容后的微任务执行函数（适配无 queueMicrotask 的环境）
  private readonly queueMicrotaskFn: (callback: () => void) => void;

  // ========== 公开只读属性（外部可访问，不可修改） ==========
  /**
   * 用于等待微任务执行完成的 Promise
   * 外部可通过 await scheduler.tick 等待任务执行完毕
   */
  readonly tick = this.microtaskPromise;

  constructor() {
    // 兼容 queueMicrotask API（前端工程化必备）
    this.queueMicrotaskFn =
      typeof queueMicrotask !== 'undefined'
        ? queueMicrotask
        : (cb) => this.microtaskPromise.then(cb);
  }

  // ========== 公开方法（外部可调用） ==========
  /**
   * 添加任务到调度队列，并触发异步执行调度
   * @param task 待执行的微任务（无参无返回值函数）
   */
  enqueue(task: TaskToQueue): void {
    if (typeof task !== 'function') {
      throw new TypeError('enqueue 必须传入函数类型的任务');
    }
    this.taskQueue.add(task);
    this.scheduleFlush();
  }

  /**
   * 异步触发任务批量执行（放入微任务队列）
   * 多次调用仅会触发一次微任务，避免重复执行
   */
  flush(): void {
    this.scheduleFlush();
  }

  /**
   * 同步触发任务批量执行（立即执行，不等待微任务）
   */
  flushSync(): void {
    this.executeTasks();
  }

  /**
   * 注册「任务执行前」的回调
   * @param callback 执行前的回调函数
   * @returns 取消回调的函数（调用后不再触发该回调）
   */
  onBeforeFlush(callback: () => void): Unsubscribe {
    return this.registerCallback(this.beforeFlushCallbacks, callback);
  }

  /**
   * 注册「任务执行后」的回调
   * @param callback 执行后的回调函数
   * @returns 取消回调的函数（调用后不再触发该回调）
   */
  onAfterFlush(callback: () => void): Unsubscribe {
    return this.registerCallback(this.afterFlushCallbacks, callback);
  }

  // ========== 私有方法（内部逻辑，对外隐藏） ==========
  /**
   * 调度 flush 到微任务队列（核心：防重复调度）
   */
  private scheduleFlush(): void {
    if (this.isFlushScheduled || this.isFlushing) return;

    this.isFlushScheduled = true;
    this.queueMicrotaskFn(() => {
      this.isFlushScheduled = false;
      this.executeTasks();
    });
  }

  /**
   * 核心执行逻辑：执行前后回调 + 批量执行任务
   */
  private executeTasks(): void {
    if (this.isFlushing) return;
    this.isFlushing = true;

    try {
      // 1. 执行前置回调（复制后遍历，避免迭代时修改）
      const beforeCallbacks = Array.from(this.beforeFlushCallbacks);
      beforeCallbacks.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.error('调度器执行前置回调失败:', e);
        }
      });

      // 2. 执行所有任务（复制后遍历，避免迭代时修改队列）
      const tasks = Array.from(this.taskQueue);
      tasks.forEach((task) => {
        try {
          task();
        } catch (e) {
          // 捕获单个任务异常，不影响其他任务执行（前端容错最佳实践）
          console.error('调度器执行任务失败:', e);
        }
        this.taskQueue.delete(task);
      });
    } finally {
      // 无论是否出错，都重置状态 + 执行后置回调
      const afterCallbacks = Array.from(this.afterFlushCallbacks);
      afterCallbacks.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.error('调度器执行后置回调失败:', e);
        }
      });
      this.isFlushing = false;
    }
  }

  /**
   * 注册回调并返回取消函数（复用逻辑）
   * @param callbacks 回调队列
   * @param callback 要注册的回调函数
   * @returns 取消回调的函数
   */
  private registerCallback(callbacks: Set<() => void>, callback: () => void): Unsubscribe {
    if (typeof callback !== 'function') {
      throw new TypeError('回调必须是函数类型');
    }
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  }
}

export default MicroScheduler;
```

## 六、使用场景与扩展方向

### 1. 典型使用场景

- **批量DOM更新**：多次修改DOM的任务加入调度器，避免频繁重排重绘；

- **状态管理库**：如Vue的响应式更新，批量执行依赖收集后的回调；

- **异步数据处理**：批量处理接口返回的数据，统一执行后续逻辑。

### 2. 扩展方向

- 添加「任务优先级」：区分高/低优先级任务，按优先级执行；

- 支持「任务超时」：设置任务执行超时时间，超时后抛出异常；

- 增加「任务统计」：记录任务执行数量、耗时，便于性能监控。

## 七、总结

实现微任务调度器的核心是「理解事件循环+控制执行时机」：

1. 用`Set`管理任务，解决重复执行问题；

2. 用`isFlushScheduled/isFlushing`控制调度时机，避免重复执行；

3. 用固定的`Promise`做时间锚点，支持外部可靠等待；

4. 兼容环境+异常捕获，保证生产环境可用。

从「最小可用版」到「生产级优化版」的实现过程，不仅能掌握微任务的核心逻辑，还能学习到前端工程化的最佳实践（封装、兼容、容错）。希望本文能帮助你理解异步调度的本质，也能在实际项目中落地这个通用的微任务调度器。

