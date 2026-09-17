let subscribers = {};

function subscribe(eventName, callback) {
  if (subscribers[eventName] === undefined) {
    subscribers[eventName] = [];
  }

  subscribers[eventName] = [...subscribers[eventName], callback];

  return function unsubscribe() {
    subscribers[eventName] = subscribers[eventName].filter((cb) => {
      return cb !== callback;
    });
  };
}

function publish(eventName, data) {
  if (subscribers[eventName]) {
    const promises = subscribers[eventName]
      .map((callback) => callback(data))
    // Promise.allSettled instead of Promise.all:
    // Promise.all rejects immediately when any single subscriber throws or
    // returns a rejected promise, cancelling all remaining subscribers and
    // propagating the rejection to the caller. This allowed a bug in one
    // subscriber (e.g. quick-add-bulk.js reading event.cartData.items when
    // cartData was undefined) to reach the window.location.reload() fallback
    // in standard-actions-override.js and reload the page.
    // Promise.allSettled waits for every subscriber regardless of outcome,
    // isolates failures, and always resolves — so callers never see
    // a spurious rejection from an unrelated subscriber.
    return Promise.allSettled(promises);
  } else {
    return Promise.resolve()
  }
}
