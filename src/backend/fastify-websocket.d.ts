declare module '@fastify/websocket' {
  import { FastifyPluginAsync } from 'fastify';

  interface SocketStream {
    socket: any;
  }

  interface WebsocketPluginOptions {
    websocket?: boolean;
  }

  const fastifyWebsocket: FastifyPluginAsync<WebsocketPluginOptions>;
  export default fastifyWebsocket;
  export { SocketStream };
}
