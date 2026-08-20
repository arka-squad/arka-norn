export function selectLatestRun(documents) {
    return [...documents].sort((left, right) => {
        const bySequence = (right.sequence ?? -1) - (left.sequence ?? -1);
        if (bySequence !== 0)
            return bySequence;
        const byDate = timestamp(right.createdAt) - timestamp(left.createdAt);
        if (byDate !== 0)
            return byDate;
        return (right.id ?? "").localeCompare(left.id ?? "");
    })[0];
}
function timestamp(value) {
    if (value === undefined)
        return -1;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? -1 : parsed;
}
//# sourceMappingURL=select-latest-run.js.map