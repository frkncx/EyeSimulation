// A tiny observable store. State is replaced, never mutated, so views can compare old vs new.

export function createStore(initial) {
  let state = initial;
  const subscribers = new Set();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
      for (const fn of subscribers) fn(state, prev);
    },
    subscribe(fn) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}
