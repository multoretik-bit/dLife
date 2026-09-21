import { scheduleApi } from "./api.js";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/schedule")
      return scheduleApi(
        request,
        env.DB,
        request.headers.get("oai-authenticated-user-id"),
      );
    return env.ASSETS.fetch(request);
  },
};
