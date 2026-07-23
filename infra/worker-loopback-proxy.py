from __future__ import annotations

import asyncio
import os
from dataclasses import dataclass


LISTEN_PORT = int(os.getenv("LISTEN_PORT", "8001"))
UPSTREAM_HOST = os.getenv("UPSTREAM_HOST", "worker")
UPSTREAM_PORT = int(os.getenv("UPSTREAM_PORT", "8000"))
CHUNK_SIZE = 64 * 1024


def bounded_float(name: str, default: float, minimum: float, maximum: float) -> float:
    try:
        value = float(os.getenv(name, str(default)))
    except ValueError:
        return default
    return min(maximum, max(minimum, value))


def bounded_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        return default
    return min(maximum, max(minimum, value))


CONNECT_TIMEOUT_SECONDS = bounded_float("CONNECT_TIMEOUT_SECONDS", 5, 0.1, 30)
IDLE_TIMEOUT_SECONDS = bounded_float("IDLE_TIMEOUT_SECONDS", 240, 1, 600)
MAX_CONNECTIONS = bounded_int("MAX_CONNECTIONS", 32, 1, 256)
CONNECTION_SLOTS = asyncio.Semaphore(MAX_CONNECTIONS)


@dataclass
class ConnectionActivity:
    last_io_at: float

    def touch(self) -> None:
        self.last_io_at = asyncio.get_running_loop().time()


async def relay(
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    activity: ConnectionActivity,
) -> None:
    try:
        while data := await reader.read(CHUNK_SIZE):
            activity.touch()
            writer.write(data)
            await writer.drain()
    finally:
        try:
            writer.write_eof()
        except (AttributeError, OSError, RuntimeError):
            pass


async def wait_until_idle(activity: ConnectionActivity) -> None:
    loop = asyncio.get_running_loop()
    while True:
        remaining = IDLE_TIMEOUT_SECONDS - (loop.time() - activity.last_io_at)
        if remaining <= 0:
            return
        await asyncio.sleep(remaining)


async def relay_both_directions(
    client_reader: asyncio.StreamReader,
    client_writer: asyncio.StreamWriter,
    upstream_reader: asyncio.StreamReader,
    upstream_writer: asyncio.StreamWriter,
    activity: ConnectionActivity,
) -> None:
    async with asyncio.TaskGroup() as group:
        group.create_task(relay(client_reader, upstream_writer, activity))
        group.create_task(relay(upstream_reader, client_writer, activity))


async def close_writer(writer: asyncio.StreamWriter) -> None:
    writer.close()
    try:
        await writer.wait_closed()
    except (ConnectionError, OSError, RuntimeError):
        pass


async def proxy(
    client_reader: asyncio.StreamReader,
    client_writer: asyncio.StreamWriter,
) -> None:
    if CONNECTION_SLOTS.locked():
        await close_writer(client_writer)
        return

    async with CONNECTION_SLOTS:
        try:
            upstream_reader, upstream_writer = await asyncio.wait_for(
                asyncio.open_connection(UPSTREAM_HOST, UPSTREAM_PORT),
                timeout=CONNECT_TIMEOUT_SECONDS,
            )
        except (OSError, TimeoutError):
            await close_writer(client_writer)
            return

        activity = ConnectionActivity(asyncio.get_running_loop().time())
        relay_task = asyncio.create_task(
            relay_both_directions(
                client_reader,
                client_writer,
                upstream_reader,
                upstream_writer,
                activity,
            ),
        )
        idle_task = asyncio.create_task(wait_until_idle(activity))

        try:
            done, _pending = await asyncio.wait(
                {relay_task, idle_task},
                return_when=asyncio.FIRST_COMPLETED,
            )
            if relay_task in done:
                await relay_task
        except (ConnectionError, OSError, TimeoutError):
            pass
        finally:
            relay_task.cancel()
            idle_task.cancel()
            await asyncio.gather(relay_task, idle_task, return_exceptions=True)
            await asyncio.gather(
                close_writer(upstream_writer),
                close_writer(client_writer),
                return_exceptions=True,
            )


async def main() -> None:
    server = await asyncio.start_server(proxy, "0.0.0.0", LISTEN_PORT)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    asyncio.run(main())
