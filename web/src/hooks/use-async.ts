import { useCallback, useEffect, useState } from "react";

export interface AsyncState<T> {
  readonly data?: T;
  readonly error?: Error;
  readonly loading: boolean;
  readonly reload: () => void;
}

export function useAsync<T>(loader: () => Promise<T>, dependencies: readonly unknown[]): AsyncState<T> {
  const [state, setState] = useState<Omit<AsyncState<T>, "reload">>({ loading: true });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...(current.data === undefined ? {} : { data: current.data }), loading: true }));
    void loader().then(
      (data) => { if (active) setState({ data, loading: false }); },
      (error: unknown) => { if (active) setState({ loading: false, error: error instanceof Error ? error : new Error(String(error)) }); },
    );
    return () => { active = false; };
  }, [...dependencies, revision]);
  return { ...state, reload };
}
