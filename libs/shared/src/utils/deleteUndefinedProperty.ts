export const deleteUndefinedProperty = (query: any) => {
    Object.keys(query).forEach(
        key => (query[key] === undefined || query[key] === '' || query[key] === null) && delete query[key]
    );
    return query;
};
