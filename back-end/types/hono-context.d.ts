import "hono";

declare module "hono" {
  export interface Context<State = {}> {
    state: {
      user?: {
        userId: string;
        roles: string[];
      }
    }
  }
}
