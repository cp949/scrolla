export interface ResourceScope {
  add(disposer: () => void): void;
  destroy(): void;
}

export function createResourceScope(): ResourceScope {
  const disposers: Array<() => void> = [];
  let destroyed = false;

  return {
    add(disposer) {
      if (destroyed) {
        disposer();
        return;
      }
      disposers.push(disposer);
    },
    destroy() {
      if (destroyed) {
        return;
      }
      destroyed = true;

      let hasError = false;
      let firstError: unknown;
      for (let index = disposers.length - 1; index >= 0; index -= 1) {
        try {
          disposers[index]!();
        } catch (error) {
          if (!hasError) {
            hasError = true;
            firstError = error;
          }
        }
      }
      disposers.length = 0;

      if (hasError) {
        throw firstError;
      }
    },
  };
}
