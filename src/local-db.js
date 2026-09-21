// Adapt local node:sqlite to the small D1 interface used by scheduleApi.
export function d1Adapter(sqlite) {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          const statement = sqlite.prepare(sql);
          return {
            async first() {
              return statement.get(...values);
            },
            async run() {
              return {
                meta: { changes: Number(statement.run(...values).changes) },
              };
            },
          };
        },
      };
    },
  };
}
