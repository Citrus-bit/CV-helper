from __future__ import annotations

import asyncio
import importlib.util
import sys
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "worker-loopback-proxy.py"
SPEC = importlib.util.spec_from_file_location("worker_loopback_proxy", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
proxy_module = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = proxy_module
SPEC.loader.exec_module(proxy_module)


def test_timeout_and_connection_limits_are_bounded() -> None:
    assert proxy_module.bounded_float("MISSING_FLOAT", 5, 1, 10) == 5
    assert proxy_module.bounded_int("MISSING_INT", 32, 1, 64) == 32


def test_proxy_relays_data_and_closes_idle_connections() -> None:
    async def scenario() -> None:
        async def echo(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
            try:
                while data := await reader.read(1024):
                    writer.write(data)
                    await writer.drain()
            finally:
                writer.close()
                await writer.wait_closed()

        upstream = await asyncio.start_server(echo, "127.0.0.1", 0)
        upstream_port = upstream.sockets[0].getsockname()[1]
        proxy_module.UPSTREAM_HOST = "127.0.0.1"
        proxy_module.UPSTREAM_PORT = upstream_port
        proxy_module.CONNECT_TIMEOUT_SECONDS = 0.2
        proxy_module.IDLE_TIMEOUT_SECONDS = 0.1
        proxy_module.CONNECTION_SLOTS = asyncio.Semaphore(1)
        gateway = await asyncio.start_server(proxy_module.proxy, "127.0.0.1", 0)
        gateway_port = gateway.sockets[0].getsockname()[1]

        try:
            reader, writer = await asyncio.open_connection("127.0.0.1", gateway_port)
            writer.write(b"health")
            await writer.drain()
            assert await asyncio.wait_for(reader.readexactly(6), timeout=0.5) == b"health"
            assert await asyncio.wait_for(reader.read(), timeout=0.5) == b""
            writer.close()
            await writer.wait_closed()
        finally:
            gateway.close()
            upstream.close()
            await gateway.wait_closed()
            await upstream.wait_closed()

    asyncio.run(scenario())


def test_proxy_rejects_connections_over_the_limit() -> None:
    async def scenario() -> None:
        async def hold(_reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
            try:
                await asyncio.sleep(1)
            finally:
                writer.close()
                await writer.wait_closed()

        upstream = await asyncio.start_server(hold, "127.0.0.1", 0)
        proxy_module.UPSTREAM_HOST = "127.0.0.1"
        proxy_module.UPSTREAM_PORT = upstream.sockets[0].getsockname()[1]
        proxy_module.CONNECT_TIMEOUT_SECONDS = 0.2
        proxy_module.IDLE_TIMEOUT_SECONDS = 1
        proxy_module.CONNECTION_SLOTS = asyncio.Semaphore(1)
        gateway = await asyncio.start_server(proxy_module.proxy, "127.0.0.1", 0)
        gateway_port = gateway.sockets[0].getsockname()[1]

        first_writer: asyncio.StreamWriter | None = None
        second_writer: asyncio.StreamWriter | None = None
        try:
            _first_reader, first_writer = await asyncio.open_connection("127.0.0.1", gateway_port)
            for _ in range(20):
                if proxy_module.CONNECTION_SLOTS.locked():
                    break
                await asyncio.sleep(0.01)
            assert proxy_module.CONNECTION_SLOTS.locked()

            second_reader, second_writer = await asyncio.open_connection("127.0.0.1", gateway_port)
            assert await asyncio.wait_for(second_reader.read(), timeout=0.5) == b""
        finally:
            if second_writer is not None:
                second_writer.close()
                await second_writer.wait_closed()
            if first_writer is not None:
                first_writer.close()
                await first_writer.wait_closed()
            gateway.close()
            upstream.close()
            await gateway.wait_closed()
            await upstream.wait_closed()

    asyncio.run(scenario())
