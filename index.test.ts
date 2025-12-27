import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MicroScheduler, type TaskToQueue } from './index';

describe('MicroScheduler', () => {
  let scheduler: MicroScheduler;

  beforeEach(() => {
    scheduler = new MicroScheduler();
  });

  describe('enqueue', () => {
    it('应该能够添加任务到队列', () => {
      const task = vi.fn();
      scheduler.enqueue(task);
      expect(task).not.toHaveBeenCalled();
    });

    it('应该在微任务中执行任务', async () => {
      const task = vi.fn();
      scheduler.enqueue(task);

      await scheduler.tick;
      expect(task).toHaveBeenCalledTimes(1);
    });

    it('应该拒绝非函数类型的任务', () => {
      // @ts-expect-error 测试类型错误
      expect(() => scheduler.enqueue(null)).toThrow(TypeError);
      // @ts-expect-error 测试类型错误
      expect(() => scheduler.enqueue('not a function')).toThrow(TypeError);
    });

    it('应该去重相同的任务', async () => {
      const task = vi.fn();
      scheduler.enqueue(task);
      scheduler.enqueue(task);
      scheduler.enqueue(task);

      await scheduler.tick;
      expect(task).toHaveBeenCalledTimes(1);
    });
  });

  describe('flush', () => {
    it('应该异步执行队列中的任务', async () => {
      const task1 = vi.fn();
      const task2 = vi.fn();

      scheduler.enqueue(task1);
      scheduler.enqueue(task2);

      scheduler.flush();
      await scheduler.tick;

      expect(task1).toHaveBeenCalledTimes(1);
      expect(task2).toHaveBeenCalledTimes(1);
    });
  });

  describe('flushSync', () => {
    it('应该同步执行队列中的任务', () => {
      const task1 = vi.fn();
      const task2 = vi.fn();

      scheduler.enqueue(task1);
      scheduler.enqueue(task2);

      scheduler.flushSync();

      expect(task1).toHaveBeenCalledTimes(1);
      expect(task2).toHaveBeenCalledTimes(1);
    });
  });

  describe('onBeforeFlush', () => {
    it('应该在任务执行前调用回调', async () => {
      const callback = vi.fn();
      const task = vi.fn();

      scheduler.onBeforeFlush(callback);
      scheduler.enqueue(task);

      await scheduler.tick;

      expect(callback).toHaveBeenCalled();
    });

    it('应该返回取消订阅的函数', async () => {
      const callback = vi.fn();
      const unsubscribe = scheduler.onBeforeFlush(callback);

      unsubscribe();
      scheduler.enqueue(vi.fn());

      await scheduler.tick;

      expect(callback).not.toHaveBeenCalled();
    });

    it('应该拒绝非函数类型的回调', () => {
      // @ts-expect-error 测试类型错误
      expect(() => scheduler.onBeforeFlush(null)).toThrow(TypeError);
    });
  });

  describe('onAfterFlush', () => {
    it('应该在任务执行后调用回调', async () => {
      const callback = vi.fn();
      const task = vi.fn();

      scheduler.onAfterFlush(callback);
      scheduler.enqueue(task);

      await scheduler.tick;

      expect(callback).toHaveBeenCalled();
    });

    it('应该返回取消订阅的函数', async () => {
      const callback = vi.fn();
      const unsubscribe = scheduler.onAfterFlush(callback);

      unsubscribe();
      scheduler.enqueue(vi.fn());

      await scheduler.tick;

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('错误处理', () => {
    it('应该捕获任务执行错误，不影响其他任务', async () => {
      const errorTask = vi.fn(() => {
        throw new Error('Task error');
      });
      const normalTask = vi.fn();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      scheduler.enqueue(errorTask);
      scheduler.enqueue(normalTask);

      await scheduler.tick;

      expect(errorTask).toHaveBeenCalled();
      expect(normalTask).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('应该捕获回调执行错误，不影响任务执行', async () => {
      const errorCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      const task = vi.fn();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      scheduler.onBeforeFlush(errorCallback);
      scheduler.enqueue(task);

      await scheduler.tick;

      expect(errorCallback).toHaveBeenCalled();
      expect(task).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('并发场景', () => {
    it('应该正确处理多个任务同时入队', async () => {
      const tasks = Array.from({ length: 10 }, () => vi.fn());

      tasks.forEach((task) => scheduler.enqueue(task));

      await scheduler.tick;

      tasks.forEach((task) => {
        expect(task).toHaveBeenCalledTimes(1);
      });
    });

    it('应该避免重复调度微任务', async () => {
      const task = vi.fn();

      scheduler.enqueue(task);
      scheduler.flush();
      scheduler.flush();
      scheduler.flush();

      await scheduler.tick;

      expect(task).toHaveBeenCalledTimes(1);
    });
  });
});
