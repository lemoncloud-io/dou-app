const stub = new Proxy(
    {},
    {
        get: (_target, key) => {
            if (key === '__esModule') return true;
            if (key === Symbol.toPrimitive || key === 'toString') return () => 'test-asset-stub';
            return stub;
        },
    }
);

module.exports = stub;
