import { app, BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "@cs2-rcon/server";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve rendererDist for Electron (since we are in packages/electron/dist)
const rendererDist = path.resolve(__dirname, "..", "..", "renderer", "dist");

async function createWindow() {
  const server = await buildApp({ rendererDist });
  
  // Use a dynamic port to avoid conflicts
  const address = await server.listen({ port: 0, host: "127.0.0.1" });
  console.log(`Electron backend listening on ${address}`);

  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    title: "CS2 RCON Console",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  win.loadURL(address);
  
  // Optional: open devtools in development
  if (process.env.NODE_ENV === "development") {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
