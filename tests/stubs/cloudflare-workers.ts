// Stand-in for the Workers runtime module `cloudflare:workers`, which only
// exists inside workerd. Just enough of `DurableObject` for a class to extend
// it and be constructed with a fake state — see the alias in vitest.config.ts.
export class DurableObject<Env = unknown> {
  constructor(
    protected readonly ctx: unknown,
    protected readonly env: Env,
  ) {}
}
