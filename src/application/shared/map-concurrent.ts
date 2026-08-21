/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
