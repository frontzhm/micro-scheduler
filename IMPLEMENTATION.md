# Building a Universal Microtask Scheduler from Scratch: Understanding Frontend Async Scheduling

Microtasks are a core concept in frontend asynchronous programming, widely used in Vue/React updates, Promise callbacks, event loop optimization, and more. Implementing a universal microtask scheduler from scratch not only deepens understanding of the event loop but also solves practical development needs like "batch execution of async tasks and unified control of execution timing."

This article will break down the implementation approach step by step, from a "minimum viable version" to a "production-ready optimized version," ultimately providing complete, reusable code.

## Part 1: Core Requirements and Design Approach

### 1. Problems to Solve

In frontend development, frequently triggered async tasks (like multiple DOM updates, batch data processing) can create multiple microtasks if executed directly, increasing performance overhead. We need:

- Batch task management with deduplication, executing uniformly in the microtask queue;
- Support for callbacks before/after task execution (e.g., initialization/cleanup logic);
- External ability to `await` completion of all tasks;
- Compatibility with browser/Node.js environments (handling `queueMicrotask` API compatibility).

### 2. Core Design Principles

- **Deduplication**: Use `Set` to store tasks, avoiding duplicate additions;
- **Prevent Duplicate Scheduling**: Mark whether execution logic has been placed in the microtask queue to avoid multiple triggers;
- **State Isolation**: Encapsulate internal state (e.g., `isFlushing`) with private properties, exposing controllable APIs externally;
- **Compatibility Fallback**: Use `Promise.resolve().then()` as a fallback when `queueMicrotask` is unavailable.

## Part 2: Step 1 - Implement Minimum Viable Scheduler

First, build the core skeleton, completing basic capabilities of "add tasks, batch execution," temporarily ignoring callbacks, exceptions, compatibility, etc.

### 1. Define Base Types

Clarify core types first to make code semantics clearer:

```typescript
// Task type to be executed (function with no parameters and no return value)
export type TaskToQueue = () => void;

// Function type for canceling callbacks
export type Unsubscribe = () => void;
```

### 2. Core Class Implementation (Minimal Version)

```typescript
/**
 * Minimum viable microtask scheduler
 * Core capabilities: add tasks, batch execution in microtasks, prevent duplicate scheduling
 */
export class MicroScheduler {
  // Task queue: Set automatically deduplicates
  private readonly taskQueue = new Set<TaskToQueue>();
  // Mark whether microtask execution has been scheduled (prevent duplicates)
  private isFlushScheduled = false;
  // Mark whether tasks are currently executing (avoid nested execution)
  private isFlushing = false;

  /**
   * Add task to queue and trigger scheduling
   */
  enqueue(task: TaskToQueue): void {
    this.taskQueue.add(task);
    this.scheduleFlush();
  }

  /**
   * Schedule task execution to microtask queue (core: prevent duplicate scheduling)
   */
  private scheduleFlush(): void {
    // Already scheduled/executing, return directly
    if (this.isFlushScheduled || this.isFlushing) return;

    this.isFlushScheduled = true;
    // Core: place execution logic in microtask queue
    queueMicrotask(() => {
      this.isFlushScheduled = false;
      this.executeTasks();
    });
  }

  /**
   * Batch execute all tasks
   */
  private executeTasks(): void {
    if (this.isFlushing) return;
    this.isFlushing = true;

    // Iterate and execute all tasks, remove from queue after execution
    this.taskQueue.forEach((task) => {
      task();
      this.taskQueue.delete(task);
    });

    this.isFlushing = false;
  }
}
```

### 3. Test Minimal Version Functionality

```typescript
// Instantiate scheduler
const scheduler = new MicroScheduler();

// Add 2 tasks (intentionally add duplicates to test deduplication)
const task1 = () => console.log('Execute task 1');
scheduler.enqueue(task1);
scheduler.enqueue(task1); // Duplicate addition, Set will automatically deduplicate
scheduler.enqueue(() => console.log('Execute task 2'));

// Output (executed in microtask phase):
// Execute task 1
// Execute task 2
```

### Key Logic Explanation

- `scheduleFlush`: Core duplicate prevention logic, ensuring multiple calls to `enqueue` trigger only one microtask;
- `isFlushing`: Prevents nested calls to `executeTasks` during task execution (e.g., if a task calls `enqueue` again);
- `Set` storage: Naturally solves duplicate addition problems, more efficient than arrays.

## Part 3: Step 2 - Extend Core Capabilities

On the minimal version foundation, add "synchronous execution, before/after callbacks, external waiting" capabilities, gradually improving functionality.

### 1. Add Synchronous Execution Method `flushSync`

Support manual synchronous task execution (without waiting for microtasks):

```typescript
/**
 * Synchronously trigger task execution (execute immediately, don't wait for microtasks)
 */
flushSync(): void {
  this.executeTasks();
}
```

### 2. Add Before/After Execution Callbacks

Support registering/canceling "before/after execution" callbacks for initialization, cleanup, etc.:

```typescript
// New: before/after execution callback queues
private readonly beforeFlushCallbacks = new Set<() => void>();
private readonly afterFlushCallbacks = new Set<() => void>();

/**
 * Register callback before task execution
 * @returns Function to cancel the callback
 */
onBeforeFlush(callback: () => void): Unsubscribe {
  this.beforeFlushCallbacks.add(callback);
  return () => this.beforeFlushCallbacks.delete(callback);
}

/**
 * Register callback after task execution
 */
onAfterFlush(callback: () => void): Unsubscribe {
  this.afterFlushCallbacks.add(callback);
  return () => this.afterFlushCallbacks.delete(callback);
}

// Refactor executeTasks: execute before/after callbacks
private executeTasks(): void {
  if (this.isFlushing) return;
  this.isFlushing = true;

  // 1. Execute before callbacks
  this.beforeFlushCallbacks.forEach((cb) => cb());

  // 2. Execute tasks
  this.taskQueue.forEach((task) => {
    task();
    this.taskQueue.delete(task);
  });

  // 3. Execute after callbacks
  this.afterFlushCallbacks.forEach((cb) => cb());

  this.isFlushing = false;
}
```

### 3. Support External `await` to Wait for Execution Completion

Add `tick` property, implementing external waiting based on a fixed `Promise` (core: use initialized `Promise` as a "time anchor" to avoid creating new Promises each time causing waiting to fail):

```typescript
// New: fixed microtask Promise (initialized only once)
private readonly microtaskPromise = Promise.resolve<void>(undefined);

// Public readonly property: external can await
readonly tick = this.microtaskPromise;
```

### Test Extended Capabilities

```typescript
const scheduler = new MicroScheduler();

// Register before/after callbacks
const unsubBefore = scheduler.onBeforeFlush(() => console.log('Before task execution'));
scheduler.onAfterFlush(() => console.log('After task execution'));

// Add task
scheduler.enqueue(() => console.log('Execute task'));

// External wait for task execution completion
async function test() {
  await scheduler.tick;
  console.log('All tasks completed');
  unsubBefore(); // Cancel before callback
}

test();

// Output order:
// Before task execution
// Execute task
// After task execution
// All tasks completed
```

## Part 4: Step 3 - Compatibility and Error Handling Optimization (Production-Ready)

After completing core functionality, add "environment compatibility, parameter validation, exception handling" to make the code more robust.

### 1. Compatible with `queueMicrotask` API

Node.js and some older browsers may not implement `queueMicrotask`, requiring fallback to `Promise`:

```typescript
// Declare global queueMicrotask type (TypeScript compatible)
declare const queueMicrotask: ((callback: () => void) => void) | undefined;

// New: compatible microtask execution function
private readonly queueMicrotaskFn: (callback: () => void) => void;

// Refactor constructor: initialize compatible function
constructor() {
  this.queueMicrotaskFn =
    typeof queueMicrotask !== 'undefined'
      ? queueMicrotask
      : (cb) => this.microtaskPromise.then(cb);
}

// Refactor scheduleFlush: use compatible function
private scheduleFlush(): void {
  if (this.isFlushScheduled || this.isFlushing) return;
  this.isFlushScheduled = true;
  this.queueMicrotaskFn(() => {
    this.isFlushScheduled = false;
    this.executeTasks();
  });
}
```

### 2. Add Parameter Validation

Prevent passing non-function types for tasks/callbacks:

```typescript
// Refactor enqueue
enqueue(task: TaskToQueue): void {
  if (typeof task !== 'function') {
    throw new TypeError('enqueue must receive a function type task');
  }
  this.taskQueue.add(task);
  this.scheduleFlush();
}

// Encapsulate callback registration logic, add validation
private registerCallback(callbacks: Set<() => void>, callback: () => void): Unsubscribe {
  if (typeof callback !== 'function') {
    throw new TypeError('Callback must be a function type');
  }
  callbacks.add(callback);
  return () => callbacks.delete(callback);
}

// Refactor onBeforeFlush/onAfterFlush, reuse validation logic
onBeforeFlush(callback: () => void): Unsubscribe {
  return this.registerCallback(this.beforeFlushCallbacks, callback);
}

onAfterFlush(callback: () => void): Unsubscribe {
  return this.registerCallback(this.afterFlushCallbacks, callback);
}
```

### 3. Exception Handling (Fault Tolerance)

Single task/callback execution failure does not affect overall flow:

```typescript
private executeTasks(): void {
  if (this.isFlushing) return;
  this.isFlushing = true;

  try {
    // 1. Execute before callbacks (catch individual callback exceptions)
    const beforeCallbacks = Array.from(this.beforeFlushCallbacks);
    beforeCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('Failed to execute before callback:', e);
      }
    });

    // 2. Execute tasks (copy queue to avoid modification during iteration)
    const tasks = Array.from(this.taskQueue);
    tasks.forEach((task) => {
      try {
        task();
      } catch (e) {
        console.error('Failed to execute task:', e);
      }
      this.taskQueue.delete(task);
    });
  } finally {
    // Regardless of errors, execute after callbacks + reset state
    const afterCallbacks = Array.from(this.afterFlushCallbacks);
    afterCallbacks.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('Failed to execute after callback:', e);
      }
    });
    this.isFlushing = false;
  }
}
```

## Part 5: Complete Production-Ready Code

Integrating all optimizations, the final complete code is as follows (can be copied and reused directly):

```typescript
// Type naming is more precise, fitting the scenario
export type TaskToQueue = () => void;
// Function type for canceling callbacks (clearer semantics)
export type Unsubscribe = () => void;

// Declare global queueMicrotask type (compatible with Node.js and browser environments)
declare const queueMicrotask: ((callback: () => void) => void) | undefined;

/**
 * Microtask scheduler class
 * Core capabilities: batch task management, unified execution in microtask queue, support for before/after callbacks
 */
export class MicroScheduler {
  // ========== Private properties (encapsulated, not accessible externally) ==========
  // Task queue: Set automatically deduplicates, avoiding duplicate execution
  private readonly taskQueue = new Set<TaskToQueue>();
  // Before execution callback queue
  private readonly beforeFlushCallbacks = new Set<() => void>();
  // After execution callback queue
  private readonly afterFlushCallbacks = new Set<() => void>();
  // Mark whether tasks are currently executing
  private isFlushing = false;
  // Mark whether flush has been scheduled to microtask queue
  private isFlushScheduled = false;
  // Fixed microtask Promise for external await to wait for execution completion (initialized only once)
  private readonly microtaskPromise = Promise.resolve<void>(undefined);
  // Compatible microtask execution function (adapts to environments without queueMicrotask)
  private readonly queueMicrotaskFn: (callback: () => void) => void;

  // ========== Public readonly properties (accessible externally, not modifiable) ==========
  /**
   * Promise for waiting for microtask execution completion
   * External can await scheduler.tick to wait for task completion
   */
  readonly tick = this.microtaskPromise;

  constructor() {
    // Compatible with queueMicrotask API (essential for frontend engineering)
    this.queueMicrotaskFn =
      typeof queueMicrotask !== 'undefined'
        ? queueMicrotask
        : (cb) => this.microtaskPromise.then(cb);
  }

  // ========== Public methods (callable externally) ==========
  /**
   * Add task to scheduling queue and trigger async execution scheduling
   * @param task Task to be executed (function with no parameters and no return value)
   */
  enqueue(task: TaskToQueue): void {
    if (typeof task !== 'function') {
      throw new TypeError('enqueue must receive a function type task');
    }
    this.taskQueue.add(task);
    this.scheduleFlush();
  }

  /**
   * Asynchronously trigger batch task execution (place in microtask queue)
   * Multiple calls will only trigger one microtask, avoiding duplicate execution
   */
  flush(): void {
    this.scheduleFlush();
  }

  /**
   * Synchronously trigger batch task execution (execute immediately, don't wait for microtasks)
   */
  flushSync(): void {
    this.executeTasks();
  }

  /**
   * Register callback before task execution
   * @param callback Callback function before execution
   * @returns Function to cancel callback (calling it will no longer trigger this callback)
   */
  onBeforeFlush(callback: () => void): Unsubscribe {
    return this.registerCallback(this.beforeFlushCallbacks, callback);
  }

  /**
   * Register callback after task execution
   * @param callback Callback function after execution
   * @returns Function to cancel callback (calling it will no longer trigger this callback)
   */
  onAfterFlush(callback: () => void): Unsubscribe {
    return this.registerCallback(this.afterFlushCallbacks, callback);
  }

  // ========== Private methods (internal logic, hidden from external) ==========
  /**
   * Schedule flush to microtask queue (core: prevent duplicate scheduling)
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
   * Core execution logic: execute before/after callbacks + batch execute tasks
   */
  private executeTasks(): void {
    if (this.isFlushing) return;
    this.isFlushing = true;

    try {
      // 1. Execute before callbacks (copy before iterating to avoid modification during iteration)
      const beforeCallbacks = Array.from(this.beforeFlushCallbacks);
      beforeCallbacks.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.error('Scheduler failed to execute before callback:', e);
        }
      });

      // 2. Execute all tasks (copy before iterating to avoid modifying queue during iteration)
      const tasks = Array.from(this.taskQueue);
      tasks.forEach((task) => {
        try {
          task();
        } catch (e) {
          // Catch individual task exceptions, don't affect other task execution (frontend fault tolerance best practice)
          console.error('Scheduler failed to execute task:', e);
        }
        this.taskQueue.delete(task);
      });
    } finally {
      // Regardless of errors, reset state + execute after callbacks
      const afterCallbacks = Array.from(this.afterFlushCallbacks);
      afterCallbacks.forEach((cb) => {
        try {
          cb();
        } catch (e) {
          console.error('Scheduler failed to execute after callback:', e);
        }
      });
      this.isFlushing = false;
    }
  }

  /**
   * Register callback and return cancel function (reuse logic)
   * @param callbacks Callback queue
   * @param callback Callback function to register
   * @returns Function to cancel callback
   */
  private registerCallback(callbacks: Set<() => void>, callback: () => void): Unsubscribe {
    if (typeof callback !== 'function') {
      throw new TypeError('Callback must be a function type');
    }
    callbacks.add(callback);
    return () => callbacks.delete(callback);
  }
}

export default MicroScheduler;
```

## Part 6: Use Cases and Extension Directions

### 1. Typical Use Cases

- **Batch DOM Updates**: Add multiple DOM modification tasks to scheduler, avoiding frequent reflows and repaints;
- **State Management Libraries**: Like Vue's reactive updates, batch execute callbacks after dependency collection;
- **Async Data Processing**: Batch process data returned from APIs, uniformly execute subsequent logic.

### 2. Extension Directions

- Add "Task Priority": Distinguish high/low priority tasks, execute by priority;
- Support "Task Timeout": Set task execution timeout, throw exception after timeout;
- Add "Task Statistics": Record task execution count, duration, convenient for performance monitoring.

## Part 7: Summary

The core of implementing a microtask scheduler is "understanding the event loop + controlling execution timing":

1. Use `Set` to manage tasks, solving duplicate execution problems;
2. Use `isFlushScheduled/isFlushing` to control scheduling timing, avoiding duplicate execution;
3. Use fixed `Promise` as time anchor, supporting reliable external waiting;
4. Environment compatibility + exception handling, ensuring production environment usability.

The implementation process from "minimum viable version" to "production-ready optimized version" not only helps master the core logic of microtasks but also learn frontend engineering best practices (encapsulation, compatibility, fault tolerance). We hope this article helps you understand the essence of async scheduling and implement this universal microtask scheduler in actual projects.
