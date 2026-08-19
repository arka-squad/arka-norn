export async function mapConcurrent(values, concurrency, mapper) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
        throw new Error("concurrency must be a positive integer");
    const results = new Array(values.length);
    let nextIndex = 0;
    const worker = async () => {
        while (nextIndex < values.length) {
            const index = nextIndex;
            nextIndex += 1;
            results[index] = await mapper(values[index], index);
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
    return results;
}
//# sourceMappingURL=map-concurrent.js.map