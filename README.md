# micro-scheduler

A lightweight, high-performance microtask scheduler for managing batched task execution in both browser and Node.js environments.

## Features

- 🚀 **Batch Task Execution**: Automatically batches tasks and executes them in microtask queue
- 🔄 **Auto Deduplication**: Uses `Set` to automatically deduplicate identical tasks
- ⚡ **Async & Sync Flush**: Supports both asynchronous and synchronous task execution
- 🎯 **Lifecycle Hooks**: Provides `onBeforeFlush` and `onAfterFlush` callbacks
- 🛡️ **Error Handling**: Individual task errors won't affect other tasks
- 📦 **Universal**: Works in both browser and Node.js environments
- 💪 **TypeScript**: Full TypeScript support with type definitions

## Installation

### npm / pnpm / yarn

```bash
npm install micro-scheduler
# or
pnpm add micro-scheduler
# or
yarn add micro-scheduler
```

### CDN

You can also use it directly via CDN:

**unpkg:**

```html
<!-- ESM -->
<script type="module">
  import { MicroScheduler } from 'https://unpkg.com/micro-scheduler@latest/dist/index.mjs';
</script>

<!-- UMD (browser global) -->
<script src="https://unpkg.com/micro-scheduler@latest/dist/index.js"></script>
```

**jsDelivr:**

```html
<!-- ESM -->
<script type="module">
  import { MicroScheduler } from 'https://cdn.jsdelivr.net/npm/micro-scheduler@latest/dist/index.mjs';
</script>

<!-- UMD (browser global) -->
<script src="https://cdn.jsdelivr.net/npm/micro-scheduler@latest/dist/index.js"></script>
```

## Usage

### Browser

#### Using ES Modules (Recommended)

```html
<script type="module">
  import { MicroScheduler } from 'https://unpkg.com/micro-scheduler@latest/dist/index.mjs';
  // or
  // import { MicroScheduler } from 'https://cdn.jsdelivr.net/npm/micro-scheduler@latest/dist/index.mjs';

  const scheduler = new MicroScheduler();

  scheduler.enqueue(() => {
    console.log('Task 1');
  });

  scheduler.enqueue(() => {
    console.log('Task 2');
  });

  // Tasks will be executed in microtask queue
  await scheduler.tick;
  // Output: Task 1, Task 2
</script>
```

#### Using npm package

```html
<script type="module">
  import { MicroScheduler } from './node_modules/micro-scheduler/dist/index.mjs';

  const scheduler = new MicroScheduler();
  // ...
</script>
```

### Node.js

```javascript
// ESM
import { MicroScheduler } from 'micro-scheduler';

// CommonJS
const { MicroScheduler } = require('micro-scheduler');

const scheduler = new MicroScheduler();

scheduler.enqueue(() => {
  console.log('Task executed');
});

await scheduler.tick;
```

### TypeScript

```typescript
import { MicroScheduler } from 'micro-scheduler';

const scheduler = new MicroScheduler();

scheduler.enqueue(() => {
  console.log('Type-safe task');
});
```

## API

### `MicroScheduler`

#### Constructor

```typescript
const scheduler = new MicroScheduler();
```

Creates a new scheduler instance.

#### Methods

##### `enqueue(task: () => void): void`

Adds a task to the queue and schedules execution. Tasks are automatically deduplicated.

```typescript
scheduler.enqueue(() => {
  console.log('Task 1');
});

scheduler.enqueue(() => {
  console.log('Task 2');
});
```

##### `flush(): void`

Asynchronously triggers batch execution of all queued tasks (scheduled to microtask queue).

```typescript
scheduler.enqueue(task1);
scheduler.enqueue(task2);
scheduler.flush(); // Tasks will execute in microtask queue
```

##### `flushSync(): void`

Synchronously executes all queued tasks immediately (without waiting for microtask).

```typescript
scheduler.enqueue(task1);
scheduler.enqueue(task2);
scheduler.flushSync(); // Tasks execute immediately
```

##### `onBeforeFlush(callback: () => void): Unsubscribe`

Registers a callback that will be called before tasks are executed. Returns an unsubscribe function.

```typescript
const unsubscribe = scheduler.onBeforeFlush(() => {
  console.log('Before flush');
});

scheduler.enqueue(() => console.log('Task'));

// Later, to remove the callback:
unsubscribe();
```

##### `onAfterFlush(callback: () => void): Unsubscribe`

Registers a callback that will be called after tasks are executed. Returns an unsubscribe function.

```typescript
const unsubscribe = scheduler.onAfterFlush(() => {
  console.log('After flush');
});

scheduler.enqueue(() => console.log('Task'));
```

#### Properties

##### `tick: Promise<void>`

A Promise that resolves when the microtask queue is flushed. Useful for awaiting task completion.

```typescript
scheduler.enqueue(() => console.log('Task'));
await scheduler.tick; // Wait for task to complete
```

## Implementation Details

> 📖 **Want to learn how to build a microtask scheduler from scratch?** Check out the detailed implementation guide: [IMPLEMENTATION.md](./IMPLEMENTATION.md)

### Core Design

1. **Task Queue**: Uses `Set` data structure to automatically deduplicate identical tasks
2. **Microtask Scheduling**: Leverages `queueMicrotask` API (with fallback for older environments)
3. **Batch Execution**: All tasks are executed together in a single microtask, improving performance
4. **State Management**: Uses flags (`isFlushing`, `isFlushScheduled`) to prevent duplicate scheduling

### Key Features

#### 1. Automatic Deduplication

Tasks are stored in a `Set`, so identical function references are automatically deduplicated:

```typescript
const task = () => console.log('Task');
scheduler.enqueue(task);
scheduler.enqueue(task); // Duplicate, won't execute twice
scheduler.enqueue(task); // Duplicate, won't execute twice
```

#### 2. Microtask Queue

Tasks are scheduled to execute in the microtask queue, ensuring they run:

- After the current synchronous code
- Before the next event loop tick
- In the same order as they were enqueued

#### 3. Error Isolation

Each task's errors are caught individually, preventing one failing task from affecting others:

```typescript
scheduler.enqueue(() => {
  throw new Error('Task 1 failed');
});

scheduler.enqueue(() => {
  console.log('Task 2 still executes');
});

// Task 2 will execute even if Task 1 throws
```

#### 4. Lifecycle Hooks

The scheduler provides hooks for before and after flush events, useful for:

- Logging and debugging
- Performance monitoring
- State management

### Performance Considerations

- **Batch Processing**: Multiple tasks are executed in a single microtask, reducing overhead
- **Deduplication**: Prevents unnecessary duplicate executions
- **Lazy Scheduling**: Tasks are only scheduled when needed
- **Memory Efficient**: Uses `Set` for O(1) lookup and deduplication

## Examples

### Basic Usage

```typescript
import { MicroScheduler } from 'micro-scheduler';

const scheduler = new MicroScheduler();

// Add tasks
scheduler.enqueue(() => updateUI());
scheduler.enqueue(() => logEvent());
scheduler.enqueue(() => sendAnalytics());

// Wait for all tasks to complete
await scheduler.tick;
```

### With Lifecycle Hooks

```typescript
const scheduler = new MicroScheduler();

// Log before execution
scheduler.onBeforeFlush(() => {
  console.log('Starting batch execution');
});

// Log after execution
scheduler.onAfterFlush(() => {
  console.log('Batch execution completed');
});

scheduler.enqueue(() => console.log('Task'));
await scheduler.tick;
// Output:
// Starting batch execution
// Task
// Batch execution completed
```

### Error Handling

```typescript
const scheduler = new MicroScheduler();

scheduler.enqueue(() => {
  throw new Error('This will be caught');
});

scheduler.enqueue(() => {
  console.log('This will still execute');
});

await scheduler.tick;
// Output: This will still execute
// Error is logged but doesn't stop execution
```

### Synchronous Execution

```typescript
const scheduler = new MicroScheduler();

scheduler.enqueue(() => console.log('Task 1'));
scheduler.enqueue(() => console.log('Task 2'));

// Execute immediately (synchronously)
scheduler.flushSync();
// Output: Task 1, Task 2 (immediately)
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
