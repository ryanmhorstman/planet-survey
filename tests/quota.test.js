import test from "node:test";
import assert from "node:assert/strict";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QUOTA_SCRIPT } from "../lib/server.js";
const exec = promisify(execFile);
// Optional locally; CI supplies redis-server and redis-cli. Uses an isolated Unix socket.
test(
  "real Redis enforces atomic concurrent, hourly and daily limits and expires abandoned leases",
  { skip: !process.env.REDIS_SERVER },
  async () => {
    const dir = await mkdtemp(join(tmpdir(), "psu7-redis-")),
      socket = join(dir, "redis.sock");
    const server = spawn(
      process.env.REDIS_SERVER,
      [
        "--port",
        "0",
        "--unixsocket",
        socket,
        "--save",
        "",
        "--appendonly",
        "no",
      ],
      { stdio: "ignore" },
    );
    const cli = process.env.REDIS_CLI || "redis-cli";
    const command = async (...args) =>
      JSON.parse(
        (await exec(cli, ["-s", socket, "--json", ...args.map(String)])).stdout,
      );
    try {
      for (let i = 0; ; i++) {
        try {
          await command("PING");
          break;
        } catch (error) {
          if (i > 50) throw error;
          await new Promise((r) => setTimeout(r, 20));
        }
      }
      const reserve = (ip, lease, hourly = 20, daily = 100, concurrent = 3) =>
        command(
          "EVAL",
          QUOTA_SCRIPT,
          3,
          `hour:${ip}`,
          "daily",
          "active",
          hourly,
          daily,
          concurrent,
          lease,
        );
      const replies = await Promise.all(
        Array.from({ length: 20 }, (_, i) => reserve(i, `lease-${i}`)),
      );
      assert.equal(replies.filter((r) => r[0] === 1).length, 3);
      assert.equal(await command("GET", "daily"), "3");
      await command("DEL", "active");
      await command("ZADD", "active", 0, "abandoned");
      assert.deepEqual(await reserve("new", "fresh"), [1, 0]);
      assert.equal(await command("ZSCORE", "active", "abandoned"), null);
      await command("FLUSHDB");
      assert.deepEqual(await reserve("same", "one", 1), [1, 0]);
      await command("ZREM", "active", "one");
      const limited = await reserve("same", "two", 1);
      assert.equal(limited[0], 0);
      assert.ok(limited[1] > 3500);
      assert.equal(await command("GET", "daily"), "1");
      const daily = await reserve("different", "three", 20, 1);
      assert.equal(daily[0], 0);
      assert.ok(daily[1] > 86000);
      assert.equal(await command("GET", "hour:different"), null);
    } finally {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
      await rm(dir, { recursive: true, force: true });
    }
  },
);
