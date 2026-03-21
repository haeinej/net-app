class Recognizer {
  constructor(config = {}) {
    this.options = config;
  }

  set(config = {}) {
    this.options = { ...this.options, ...config };
    return this;
  }

  recognizeWith() {
    return this;
  }

  requireFailure() {
    return this;
  }

  dropRecognizeWith() {
    return this;
  }

  dropRequireFailure() {
    return this;
  }
}

class Manager {
  constructor(element) {
    this.element = element;
    this.handlers = new Map();
    this.recognizers = [];
  }

  add(recognizer) {
    this.recognizers.push(recognizer);
    return recognizer;
  }

  get() {
    return null;
  }

  on(eventName, handler) {
    this.handlers.set(eventName, handler);
    return this;
  }

  off(eventName) {
    this.handlers.delete(eventName);
    return this;
  }

  emit(eventName, event = {}) {
    const handler = this.handlers.get(eventName);
    if (handler) {
      handler(event);
    }
  }

  set() {
    return this;
  }

  stop() {}

  destroy() {
    this.handlers.clear();
    this.recognizers = [];
  }
}

class Pan extends Recognizer {}
class Tap extends Recognizer {}
class Press extends Recognizer {}
class Pinch extends Recognizer {}
class Rotation extends Recognizer {}
class Swipe extends Recognizer {}
class TouchInput {}

const Hammer = {
  Manager,
  Recognizer,
  Pan,
  Tap,
  Press,
  Pinch,
  Rotation,
  Swipe,
  TouchInput,
  INPUT_START: 1,
  INPUT_MOVE: 2,
  INPUT_END: 4,
  INPUT_CANCEL: 8,
  DIRECTION_NONE: 1,
  DIRECTION_LEFT: 2,
  DIRECTION_RIGHT: 4,
  DIRECTION_UP: 8,
  DIRECTION_DOWN: 16,
  DIRECTION_HORIZONTAL: 6,
  DIRECTION_VERTICAL: 24,
  DIRECTION_ALL: 30,
};

module.exports = Hammer;
module.exports.default = Hammer;
