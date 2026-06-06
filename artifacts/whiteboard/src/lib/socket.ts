import { io } from "socket.io-client";

export const socket = io(window.location.origin, {
  path: "/ws/socket.io",
  autoConnect: false,
});
