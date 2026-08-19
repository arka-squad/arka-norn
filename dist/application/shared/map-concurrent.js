export async function mapConcurrent(values, concurrency, mapper) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
        throw new Error("concurrency must be a positive integer");
    let nextIndex = 0;
    const worker = async () => {
        const completed = [];
        while (nextIndex < values.length) {
            const index = nextIndex;
            nextIndex += 1;
            completed.push([index, await mapper(values[index], index)]);
        }
        return completed;
    };
    const partitions = await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
    return partitions.flat().sort(([left], [right]) => left - right).map(([, value]) => value);
}
//# sourceMappingURL=map-concurrent.js.map