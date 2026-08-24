const Module = require("node:module");

const originalLoad = Module._load;
const ts6Consumers = ["typescript-eslint", "@typescript-eslint", "ts-api-utils"];

Module._load = function patchedLoad(request, parent, isMain) {
  if (
    request === "typescript" &&
    ts6Consumers.some((segment) => parent?.filename?.includes(segment))
  ) {
    return originalLoad.call(this, "typescript6", parent, isMain);
  }

  return originalLoad.call(this, request, parent, isMain);
};
