// Types for importing `.mdx` files as modules. Each blog post's default export
// is its rendered React component, and its `meta` export carries the typed
// frontmatter (see `src/lib/blog.ts`). Inline `import(...)` type references keep
// this file a global script so the ambient `declare module` stays in effect.
declare module "*.mdx" {
  const Component: import("react").ComponentType;
  export const meta: import("./lib/blog").BlogMeta;
  export default Component;
}
