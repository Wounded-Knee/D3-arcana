const { execFileSync } = require("node:child_process");
const path = require("node:path");

const seed = JSON.parse(
  execFileSync(process.execPath, [path.join(__dirname, "dev-users.mjs")], {
    encoding: "utf8",
  }),
);

const defaultToken = seed.users[0]?.token ?? "dev-alice";

const ws = new WebSocket("ws://localhost:3000/ws");

ws.addEventListener("open", () => {
  console.log("connected");

  ws.send(
    JSON.stringify({
      type: "auth.authenticate",
      token: process.env.AUTH_TOKEN ?? defaultToken,
    }),
  );
});

ws.addEventListener("message", (event) => {
  console.log("received:", event.data);

  const message = JSON.parse(event.data);

  if (message.type === "auth.authenticated" && process.env.CONVERSATION_ID) {
    ws.send(
      JSON.stringify({
        type: "conversation.join",
        conversationId: process.env.CONVERSATION_ID,
      }),
    );
  }
});

ws.addEventListener("close", () => {
  console.log("closed");
});

ws.addEventListener("error", (error) => {
  console.error("error:", error);
});
