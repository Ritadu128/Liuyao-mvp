import net from "net";

const MIN_PORT = 1;
const MAX_PORT = 65_535;

export function getProductionPort(portValue: string | undefined): number {
  if (!portValue) {
    throw new Error("PORT is required in production.");
  }

  const port = Number(portValue);
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new Error("PORT must be an integer between 1 and 65535 in production.");
  }

  return port;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, () => {
      probe.close(() => resolve(true));
    });
  });
}

export async function findAvailableDevelopmentPort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available development port found starting from ${startPort}.`);
}

export function getDevelopmentPreferredPort(portValue: string | undefined): number {
  if (!portValue) return 3000;

  const port = Number(portValue);
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT ? port : 3000;
}
