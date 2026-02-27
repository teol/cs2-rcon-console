import { describe, it, expect, afterEach } from "vitest";
import { createServer } from "../server";

describe("Fastify Server", () => {
  it("should start and be ready", async () => {
    const server = await createServer();
    await server.ready();
    expect(server).toBeDefined();
    await server.close();
  });

  // Basic check to see if the server starts.
  // Testing websockets via `inject` is tricky because fastify-websocket expects a real upgrade request
  // and `inject` mocks HTTP but doesn't fully simulate the socket upgrade flow easily without more setup.
  // However, we can check if it returns 404 for a normal GET request to /
  // (since we only defined the websocket handler there and static files might be missing)
  // or if we can hit a non-existent route.

  it("should return 404 for non-upgrade request to / if dist is missing", async () => {
    const server = await createServer();
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/",
    });

    // Since static files are likely missing in test env without build, it might 404 or try to serve index.html and fail.
    // In our server code, we catch the static registration error, so it might not even register static routes.
    // Then the '/' route is only defined with { websocket: true }, which means a normal HTTP GET should 404
    // unless fastify-websocket handles it differently (usually returns 404 if not upgrade).

    expect(response.statusCode).toBe(404);
    await server.close();
  });
});
