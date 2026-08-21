/// <reference types="vite/client" />

declare global {
  var slicewiseParseSVG: ((...args: Parameters<typeof import("./lib/svg-mesh").parseSVG>) => Promise<ReturnType<typeof import("./lib/svg-mesh").parseSVG>>) | undefined;
}

export {};
