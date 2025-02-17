import { Event, EventProcessor, Hub, Integration, StackFrame } from '@sentry/types';
import { basename, relative } from '@sentry/utils';

type StackFrameIteratee = (frame: StackFrame) => StackFrame;

/** Rewrite event frames paths */
export class RewriteFrames implements Integration {
  /**
   * @inheritDoc
   */
  public name: string = RewriteFrames.id;

  /**
   * @inheritDoc
   */
  public static id: string = 'RewriteFrames';

  /**
   * @inheritDoc
   */
  private readonly _root?: string;

  /**
   * @inheritDoc
   */
  private readonly _iteratee: StackFrameIteratee = (frame: StackFrame) => {
    if (!frame.filename) {
      return frame;
    }
    // Check if the frame filename begins with `/` or a Windows-style prefix such as `C:\`
    const isWindowsFrame = /^[A-Z]:\\/.test(frame.filename);
    const startsWithSlash = /^\//.test(frame.filename);
    if (frame.filename && (isWindowsFrame || startsWithSlash)) {
      const filename = isWindowsFrame
        ? frame.filename
            .replace(/^[A-Z]:/, '') // remove Windows-style prefix
            .replace(/\\/g, '/') // replace all `\\` instances with `/`
        : frame.filename;
      const base = this._root ? relative(this._root, filename) : basename(filename);
      frame.filename = `app:///${base}`;
    }
    return frame;
  };

  /**
   * @inheritDoc
   */
  public constructor(options: { root?: string; iteratee?: StackFrameIteratee } = {}) {
    if (options.root) {
      this._root = options.root;
    }
    if (options.iteratee) {
      this._iteratee = options.iteratee;
    }
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void, getCurrentHub: () => Hub): void {
    addGlobalEventProcessor(event => {
      const self = getCurrentHub().getIntegration(RewriteFrames);
      if (self) {
        return self.process(event);
      }
      return event;
    });
  }

  /** JSDoc */
  public process(event: Event): Event {
    const frames = this._getFramesFromEvent(event);
    if (frames) {
      for (const i in frames) {
        // tslint:disable-next-line
        frames[i] = this._iteratee(frames[i]);
      }
    }
    return event;
  }

  /** JSDoc */
  private _getFramesFromEvent(event: Event): StackFrame[] | undefined {
    const exception = event.exception;

    if (exception) {
      try {
        return exception.values && exception.values[0].stacktrace && exception.values[0].stacktrace.frames;
      } catch (_oO) {
        return undefined;
      }
    } else if (event.stacktrace) {
      return event.stacktrace.frames;
    }
    return undefined;
  }
}
