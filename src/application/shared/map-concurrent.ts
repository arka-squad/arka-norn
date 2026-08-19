export async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>,
): Promise<readonly R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error("concurrency must be a positive integer");
  let nextIndex = 0;
  const worker = async (): Promise<readonly (readonly [number, R])[]> => {
    const completed: (readonly [number, R])[] = [];
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      completed.push([index, await mapper(values[index]!, index)]);
    }
    return completed;
  };
  const partitions = await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return partitions.flat().sort(([left], [right]) => left - right).map(([, value]) => value);
}
