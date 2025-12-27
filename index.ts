// 类型命名更精准，贴合场景
export type TaskToQueue = () => void;
// 取消回调的函数类型（语义比 FnVoid 更清晰）
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
      // 1. 执行前置回调
      this.runAllCallbacks(this.beforeFlushCallbacks);

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
      this.isFlushing = false;
      this.runAllCallbacks(this.afterFlushCallbacks);
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

  /**
   * 执行所有回调（复用逻辑）
   * @param callbacks 回调队列
   */
  private runAllCallbacks(callbacks: Set<() => void>): void {
    // 复制后遍历，避免回调执行时删除元素导致迭代异常
    const callbacksList = Array.from(callbacks);
    callbacksList.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('调度器执行回调失败:', e);
      }
    });
  }
}
export default MicroScheduler;
