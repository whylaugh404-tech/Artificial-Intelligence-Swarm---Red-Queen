sed -i '1088,1104c\
    const baseExecutor = options?.executorOverride || ((sub, inputs, cell) => {\
      const handler = this.defaultExecutors.get(sub.type);\
      if (!handler) {\
        return Promise.resolve({ result: `Executed ${sub.type}`, ...sub.payload, ...inputs });\
      }\
      return handler(sub, inputs, cell);\
    });\
    const executor = this.fabric ? this.fabric.getRemoteExecutor(baseExecutor as any) : baseExecutor;\
' src/redqueen/cognition/computation/engine.ts
