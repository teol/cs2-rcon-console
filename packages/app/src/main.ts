import { app, BrowserWindow } from "electron";
import path from "node:path";
import { buildApp } from "@cs2-rcon/server";

let mainWindow: BrowserWindow | null = null;
let fastifyApp: any = null;
const PORT = 3000;

async function startServer() {
  try {
    fastifyApp = await buildApp();
    await fastifyApp.listen({ port: PORT, host: "0.0.0.0" });
    console.log(`[Electron] Internal Fastify server running on http://localhost:${PORT}`);
  } catch (err) {
    console.error("[Electron] Failed to start internal server:", err);
  }
}

async function createWindow() {
  const isDev = process.env.NODE_ENV === "development";

  // In production, we run the internal server.
  // In dev, we rely on the external server running on port 3000 to avoid conflicts.
  if (!isDev) {
    await startServer();
  }

  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    autoHideMenuBar: true,
  });

  if (isDev) {
    // In dev, load Vite's HMR server
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // In prod, load the built React app served by our Fastify server
    mainWindow.loadURL(`http://localhost:${PORT}`);
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(createWindow);

app.on("window-all-closed", async () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
  if (fastifyApp) {
    await fastifyApp.close();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});
